import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConnectorConfig, Prisma, ProviderOperation } from '@prisma/client';
import {
  collectedNeedsMethod,
  connectorConfigSchema,
  recordCreateBase,
  SERVICE_REGISTRY,
  type ServiceCode,
} from '@csp2all/shared';
import { z } from 'zod';
import { config } from '../../config/config';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { encryptSecret, sha256 } from '../../common/crypto';
import { RedisService } from '../../common/redis';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { RecordsService } from '../records/records.service';
import { ServiceAvailabilityService } from '../services/service-availability.service';
import {
  CircuitBreaker,
  OutcomeUnknownError,
  PAY2ALL_MISSING,
  Pay2AllAdapter,
  SimulatorAdapter,
  type ProviderAdapter,
  type ProviderResultStatus,
} from './providers';

export const providerExecuteSchema = recordCreateBase
  .omit({ post: true, clientRef: true, opStatus: true })
  .extend({
    confirmed: z.literal(true, { message: 'Confirm the details before sending to the provider' }),
  })
  .refine(collectedNeedsMethod, {
    message: 'Choose how the amount was collected',
    path: ['paymentMethod'],
  });

type OpStatus = 'INITIATED' | 'PENDING' | 'UNKNOWN' | 'CONFIRMED' | 'FAILED';
const OP_TRANSITIONS: Record<OpStatus, OpStatus[]> = {
  INITIATED: ['PENDING', 'UNKNOWN', 'CONFIRMED', 'FAILED'],
  PENDING: ['CONFIRMED', 'FAILED', 'UNKNOWN'],
  UNKNOWN: ['PENDING', 'CONFIRMED', 'FAILED'],
  CONFIRMED: [],
  FAILED: [],
};

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

function maskCredentials(creds: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(creds).map(([k, v]) => [k, v.length <= 4 ? '****' : `****${v.slice(-4)}`]),
  );
}

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly log = new Logger('Integrations');
  private readonly breakers = new Map<string, CircuitBreaker>();
  private simulator: SimulatorAdapter | null = null;
  private readonly pay2all = new Pay2AllAdapter();

  constructor(
    private readonly db: Db,
    private readonly redis: RedisService,
    private readonly entitlements: EntitlementsService,
    private readonly records: RecordsService,
    private readonly availability: ServiceAvailabilityService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('reconciliation.run', async (p) => {
      await this.reconcileAll(typeof p.tenantId === 'string' ? p.tenantId : undefined);
    });
  }

  simulatorEnabled() {
    return config().CONNECTOR_SIMULATOR_ENABLED && config().NODE_ENV !== 'production';
  }

  /** Adapter for a tenant config. LIVE Pay2All stays disabled until documented and approved. */
  adapterFor(cfg: Pick<ConnectorConfig, 'mode'> | null): ProviderAdapter | null {
    if (!cfg || cfg.mode === 'DISABLED') return null;
    if (cfg.mode === 'SIMULATOR') {
      if (!this.simulatorEnabled()) return null;
      this.simulator ??= new SimulatorAdapter(
        config().SIMULATOR_WEBHOOK_SECRET!,
        this.redis.client,
      );
      return this.simulator;
    }
    return this.pay2all;
  }

  private breaker(id: string) {
    let b = this.breakers.get(id);
    if (!b) this.breakers.set(id, (b = new CircuitBreaker()));
    return b;
  }

  // ------------------------------------------------------------------ configuration

  async overview(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const cfg = await tx.connectorConfig.findUnique({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: 'PAY2ALL' } },
      });
      const eff = await this.entitlements.effective(tx, ctx.tenantId);
      return {
        providers: [
          {
            provider: 'PAY2ALL',
            mode: cfg?.mode ?? 'DISABLED',
            liveAvailable: false,
            liveUnavailableReason:
              'Official Pay2All documentation and credentials have not been supplied.',
            missing: PAY2ALL_MISSING,
            simulatorAvailable: this.simulatorEnabled(),
            credentialsMasked: cfg?.credentialsMasked ?? null,
            keyVersion: cfg?.keyVersion ?? null,
            enabledServices: cfg?.enabledServices ?? [],
            supportedServices: Object.values(SERVICE_REGISTRY)
              .filter((s) => s.providerCapable)
              .map((s) => s.code),
            lastHealthAt: cfg?.lastHealthAt ?? null,
            lastHealthStatus: cfg?.lastHealthStatus ?? null,
            version: cfg?.version ?? 0,
          },
        ],
        planAllowsConnector: eff.entitlements.connectorEligible,
        notice:
          'Manual records never trigger provider operations. The simulator never moves real money.',
      };
    });
  }

  async configure(ctx: TenantCtx, dto: z.infer<typeof connectorConfigSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      if (dto.mode === 'SIMULATOR') {
        if (!this.simulatorEnabled())
          throw new AppError(
            'CONNECTOR_UNAVAILABLE',
            'The simulator is not enabled in this environment',
          );
        await this.entitlements.assertBoolean(tx, ctx.tenantId, 'connectorEligible');
      }
      const existing = await tx.connectorConfig.findUnique({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: 'PAY2ALL' } },
      });
      const credentialsChanged = !!dto.credentials && Object.keys(dto.credentials).length > 0;
      const data = {
        mode: dto.mode,
        enabledServices: dto.enabledServices.filter((c) => SERVICE_REGISTRY[c].providerCapable),
        updatedByUserId: ctx.userId,
        ...(credentialsChanged
          ? {
              credentialsEnc: encryptSecret(JSON.stringify(dto.credentials)),
              credentialsMasked: maskCredentials(dto.credentials!),
              keyVersion: (existing?.keyVersion ?? 0) + 1,
            }
          : {}),
      };
      const cfg = existing
        ? await tx.connectorConfig.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.connectorConfig.create({
            data: { ...data, tenantId: ctx.tenantId, provider: 'PAY2ALL' },
          });
      await this.audit.tenant(tx, ctx, {
        action: 'connector.configured',
        targetType: 'connector',
        targetId: cfg.id,
        data: {
          mode: dto.mode,
          enabledServices: data.enabledServices,
          credentialsRotated: credentialsChanged,
        },
      });
      return {
        mode: cfg.mode,
        enabledServices: cfg.enabledServices,
        credentialsMasked: cfg.credentialsMasked,
        keyVersion: cfg.keyVersion,
      };
    });
  }

  async health(ctx: TenantCtx) {
    const cfg = await this.db.inTenant(ctx, (tx) =>
      tx.connectorConfig.findUnique({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: 'PAY2ALL' } },
      }),
    );
    const adapter = this.adapterFor(cfg) ?? this.pay2all;
    const h = await adapter.health();
    if (cfg)
      await this.db.inTenant(ctx, (tx) =>
        tx.connectorConfig.update({
          where: { id: cfg.id },
          data: {
            lastHealthAt: new Date(),
            lastHealthStatus: h.ok ? 'OK' : h.detail.slice(0, 120),
          },
        }),
      );
    return h;
  }

  // ------------------------------------------------------------------ execution

  /**
   * Executes a provider operation:
   *  1. readiness checks (entitlement, configuration, provider support, permission, service availability)
   *  2. tx: create a PROVIDER-sourced record + INITIATED operation (idempotency key unique per tenant)
   *  3. call the adapter outside the transaction, with a timeout
   *  4. tx: apply the outcome through validated transitions; timeouts become UNKNOWN and are never retried
   */
  async execute(
    ctx: TenantCtx,
    idempotencyKey: string,
    dto: z.infer<typeof providerExecuteSchema>,
  ) {
    const requestHash = sha256(JSON.stringify(dto));
    const prepared = await this.db.inTenant(ctx, async (tx) => {
      const existing = await tx.providerOperation.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new AppError(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was used for a different operation',
          );
        return { existing };
      }
      const cfg = await tx.connectorConfig.findUnique({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: 'PAY2ALL' } },
      });
      const adapter = this.adapterFor(cfg);
      const avail = (await this.availability.list(tx, ctx)).find((s) => s.code === dto.serviceCode);
      if (
        !adapter ||
        !avail?.providerExecution.available ||
        !adapter.supports(dto.serviceCode as ServiceCode)
      ) {
        throw new AppError(
          'CONNECTOR_UNAVAILABLE',
          'Provider execution is not available for this service',
          { reason: avail?.providerExecution.reason ?? 'NOT_CONFIGURED' },
        );
      }
      this.breaker(adapter.id).assertClosed();
      const created = await this.records.create(
        ctx,
        { ...dto, opStatus: 'PENDING', post: false, clientRef: null },
        'PROVIDER',
        tx,
      );
      const op = await tx.providerOperation.create({
        data: {
          tenantId: ctx.tenantId,
          recordId: created.id,
          provider: 'PAY2ALL',
          mode: adapter.mode,
          operationType: 'EXECUTE',
          idempotencyKey,
          requestHash,
          status: 'INITIATED',
          createdByUserId: ctx.userId,
          attempts: 1,
        },
      });
      await tx.providerOperationEvent.create({
        data: {
          tenantId: ctx.tenantId,
          operationId: op.id,
          fromStatus: null,
          toStatus: 'INITIATED',
          source: 'API',
        },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'provider.execute',
        targetType: 'provider_operation',
        targetId: op.id,
        data: { service: dto.serviceCode, mode: adapter.mode },
      });
      return { op, adapter, details: created.details };
    });

    if ('existing' in prepared && prepared.existing)
      return this.operationJson(ctx, prepared.existing.id);
    const { op, adapter } = prepared as { op: ProviderOperation; adapter: ProviderAdapter };

    let outcome: { status: OpStatus; providerRef?: string; error?: string };
    try {
      const r = await adapter.execute(
        {
          idempotencyKey,
          serviceCode: dto.serviceCode as ServiceCode,
          operationType: 'EXECUTE',
          amountPaise: dto.principalPaise,
          details: dto.details,
        },
        config().PROVIDER_TIMEOUT_MS,
      );
      this.breaker(adapter.id).success();
      outcome = { status: r.status, providerRef: r.providerRef };
    } catch (e) {
      this.breaker(adapter.id).failure();
      // Never blindly retry: the request may have reached the provider. Reconciliation resolves it.
      outcome = {
        status: 'UNKNOWN',
        error: e instanceof OutcomeUnknownError ? e.message : 'Provider call failed after sending',
      };
    }
    await this.db.inTenant(ctx, (tx) =>
      this.applyStatus(tx, ctx.tenantId, op.id, outcome.status, 'API', {
        providerRef: outcome.providerRef,
        error: outcome.error,
      }),
    );
    if (outcome.status === 'UNKNOWN' || outcome.status === 'PENDING') {
      await this.db.inTenant(ctx, (tx) =>
        this.jobs.enqueue(
          tx,
          'reconciliation.run',
          { tenantId: ctx.tenantId },
          { tenantId: ctx.tenantId, delayMs: 30_000 },
        ),
      );
      this.jobs.kick();
    }
    return this.operationJson(ctx, op.id);
  }

  /**
   * Validated provider status transition. Terminal states are never overwritten; a conflicting
   * terminal report is recorded as a reconciliation exception for a human to review.
   */
  async applyStatus(
    tx: Tx,
    tenantId: string,
    operationId: string,
    to: OpStatus,
    source: 'API' | 'WEBHOOK' | 'RECONCILIATION' | 'USER',
    data: { providerRef?: string; error?: string; runId?: string } = {},
  ) {
    await tx.$queryRaw`SELECT id FROM provider_operations WHERE id = ${operationId}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    const op = await tx.providerOperation.findFirstOrThrow({
      where: { id: operationId, tenantId },
    });
    const from = op.status as OpStatus;
    if (from === to) return op;
    if (!OP_TRANSITIONS[from].includes(to)) {
      if (from === 'CONFIRMED' || from === 'FAILED') {
        const run =
          data.runId ??
          (
            await tx.reconciliationRun.create({
              data: {
                tenantId,
                provider: op.provider,
                status: 'COMPLETED',
                finishedAt: new Date(),
                stats: { source },
              },
            })
          ).id;
        await tx.reconciliationException.create({
          data: {
            tenantId,
            runId: run,
            operationId,
            kind: 'STATUS_MISMATCH',
            details: { recorded: from, reported: to, source },
          },
        });
      }
      return op;
    }
    const updated = await tx.providerOperation.update({
      where: { id: operationId },
      data: {
        status: to,
        providerRef: data.providerRef ?? op.providerRef,
        lastError: data.error ?? null,
        resolvedAt: to === 'CONFIRMED' || to === 'FAILED' ? new Date() : null,
      },
    });
    await tx.providerOperationEvent.create({
      data: {
        tenantId,
        operationId,
        fromStatus: from,
        toStatus: to,
        source,
        data: data as Prisma.InputJsonValue,
      },
    });
    const rec = await tx.serviceRecord.findFirstOrThrow({ where: { id: op.recordId, tenantId } });
    const recordStatus = to === 'CONFIRMED' ? 'SUCCESSFUL' : to === 'FAILED' ? 'FAILED' : null;
    await tx.serviceRecord.update({
      where: { id: rec.id },
      data: {
        connectorStatus: to,
        opStatus: recordStatus && rec.opStatus === 'PENDING' ? recordStatus : undefined,
        externalRef: rec.externalRef ?? data.providerRef ?? null,
        version: { increment: 1 },
      },
    });
    await tx.recordStatusEvent.create({
      data: {
        tenantId,
        recordId: rec.id,
        dimension: 'CONNECTOR',
        fromStatus: from,
        toStatus: to,
        data: { source, providerRef: data.providerRef },
        actorType: 'SYSTEM',
      },
    });
    if (recordStatus && rec.opStatus === 'PENDING') {
      await tx.recordStatusEvent.create({
        data: {
          tenantId,
          recordId: rec.id,
          dimension: 'OPERATIONAL',
          fromStatus: 'PENDING',
          toStatus: recordStatus,
          reason: `Provider ${source.toLowerCase()} result`,
          actorType: 'SYSTEM',
        },
      });
    }
    return updated;
  }

  async operationJson(ctx: TenantCtx, id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const op = await tx.providerOperation.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      if (!op) throw notFound('Provider operation');
      const rec = await tx.serviceRecord.findFirstOrThrow({
        where: { id: op.recordId, tenantId: ctx.tenantId },
      });
      return {
        id: op.id,
        mode: op.mode,
        status: op.status,
        outcomeKnown: op.status === 'CONFIRMED' || op.status === 'FAILED',
        message:
          op.status === 'UNKNOWN'
            ? 'The provider did not confirm the result. Do NOT repeat this transaction. CSP2All will check the status automatically.'
            : op.status === 'PENDING'
              ? 'The provider is still processing this request.'
              : null,
        providerRef: op.providerRef,
        idempotencyKey: op.idempotencyKey,
        record: await this.records.toJson(ctx, rec, tx),
        events: op.events.map((e) => ({
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          source: e.source,
          createdAt: e.createdAt,
        })),
        createdAt: op.createdAt,
      };
    });
  }

  async listOperations(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      items: (
        await tx.providerOperation.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      ).map((o) => ({
        id: o.id,
        recordId: o.recordId,
        mode: o.mode,
        status: o.status,
        providerRef: o.providerRef,
        createdAt: o.createdAt,
        resolvedAt: o.resolvedAt,
      })),
      exceptions: (
        await tx.reconciliationException.findMany({
          where: { tenantId: ctx.tenantId, resolvedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      ).map((e) => ({
        id: e.id,
        operationId: e.operationId,
        kind: e.kind,
        details: e.details,
        createdAt: e.createdAt,
      })),
    }));
  }

  // ------------------------------------------------------------------ webhooks & reconciliation

  /** Raw-body verification first; duplicates and replays are recorded but not re-applied. */
  async handleWebhook(
    provider: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    if (!rawBody) throw new AppError('VALIDATION_FAILED', 'Empty body');
    const bodyHash = sha256(rawBody);
    const adapter: ProviderAdapter | null =
      provider === 'simulator'
        ? this.adapterFor({ mode: 'SIMULATOR' })
        : provider === 'pay2all'
          ? this.pay2all
          : null;
    if (!adapter) throw notFound('Webhook endpoint');
    const v = adapter.verifyWebhook(rawBody, headers);
    if (!v.valid || !v.deliveryId || !v.event) {
      await this.db.asSystem((tx) =>
        tx.webhookReceipt.create({
          data: {
            provider,
            deliveryId: `invalid:${bodyHash}:${Date.now()}`,
            signatureValid: false,
            rawBodySha256: bodyHash,
            status: 'REJECTED',
            error: v.reason,
          },
        }),
      );
      throw new AppError('UNAUTHENTICATED', 'Webhook verification failed');
    }
    const event = v.event;
    return this.db.asSystem(async (tx) => {
      const dup = await tx.webhookReceipt.findUnique({
        where: { provider_deliveryId: { provider, deliveryId: v.deliveryId! } },
      });
      if (dup) return { ok: true, duplicate: true };
      const op = await tx.providerOperation.findFirst({
        where: event.providerRef
          ? { provider: 'PAY2ALL', providerRef: event.providerRef }
          : { idempotencyKey: event.idempotencyKey ?? '__none__' },
      });
      const receipt = await tx.webhookReceipt.create({
        data: {
          provider,
          deliveryId: v.deliveryId!,
          tenantId: op?.tenantId ?? null,
          signatureValid: true,
          rawBodySha256: bodyHash,
          payload: { status: event.status, providerRef: event.providerRef ?? null },
          status: op ? 'PROCESSED' : 'FAILED',
          error: op ? null : 'Unknown operation',
          processedAt: new Date(),
        },
      });
      if (op)
        await this.applyStatus(
          tx,
          op.tenantId,
          op.id,
          event.status as ProviderResultStatus,
          'WEBHOOK',
          { providerRef: event.providerRef },
        );
      return { ok: true, duplicate: false, receiptId: receipt.id };
    });
  }

  async reconcileAll(onlyTenant?: string) {
    const ops = await this.db.asSystem((tx) =>
      tx.providerOperation.findMany({
        where: {
          status: { in: ['PENDING', 'UNKNOWN', 'INITIATED'] },
          updatedAt: { lt: new Date(Date.now() - 5_000) },
          ...(onlyTenant ? { tenantId: onlyTenant } : {}),
        },
        take: 200,
      }),
    );
    const byTenant = new Map<string, ProviderOperation[]>();
    for (const o of ops) byTenant.set(o.tenantId, [...(byTenant.get(o.tenantId) ?? []), o]);
    const results = [];
    for (const [tenantId, list] of byTenant)
      results.push(await this.reconcileTenant(tenantId, list));
    return results;
  }

  async reconcileOperation(ctx: TenantCtx, id: string) {
    const op = await this.db.inTenant(ctx, (tx) =>
      tx.providerOperation.findFirst({ where: { id, tenantId: ctx.tenantId } }),
    );
    if (!op) throw notFound('Provider operation');
    await this.reconcileTenant(ctx.tenantId, [op]);
    return this.operationJson(ctx, id);
  }

  private async reconcileTenant(tenantId: string, ops: ProviderOperation[]) {
    const tctx = { tenantId, userId: SYSTEM_USER };
    const run = await this.db.inTenant(tctx, (tx) =>
      tx.reconciliationRun.create({ data: { tenantId, provider: 'PAY2ALL', status: 'RUNNING' } }),
    );
    const stats = { checked: 0, resolved: 0, exceptions: 0 };
    for (const op of ops) {
      if (op.status === 'CONFIRMED' || op.status === 'FAILED') continue;
      const adapter = this.adapterFor({ mode: op.mode === 'SIMULATOR' ? 'SIMULATOR' : 'LIVE' });
      if (!adapter) continue;
      stats.checked++;
      try {
        const s = await adapter.queryStatus(op.idempotencyKey);
        await this.db.inTenant(tctx, async (tx) => {
          if (s.status === 'NOT_FOUND') {
            // Provider confirms it never received the request: safe to mark failed (no money moved).
            if (op.status === 'UNKNOWN' || op.status === 'INITIATED') {
              await this.applyStatus(tx, tenantId, op.id, 'FAILED', 'RECONCILIATION', {
                error: 'Not found at provider',
                runId: run.id,
              });
              stats.resolved++;
            }
            return;
          }
          await this.applyStatus(tx, tenantId, op.id, s.status, 'RECONCILIATION', {
            providerRef: s.providerRef,
            runId: run.id,
          });
          if (s.status !== 'PENDING') stats.resolved++;
        });
      } catch (e) {
        stats.exceptions++;
        await this.db.inTenant(tctx, (tx) =>
          tx.reconciliationException.create({
            data: {
              tenantId,
              runId: run.id,
              operationId: op.id,
              kind: 'UNRESOLVED_UNKNOWN',
              details: { error: (e as Error).message.slice(0, 200) },
            },
          }),
        );
      }
    }
    await this.db.inTenant(tctx, (tx) =>
      tx.reconciliationRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', finishedAt: new Date(), stats },
      }),
    );
    return { tenantId, runId: run.id, ...stats };
  }
}
