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
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../../common/crypto';
import { RedisService } from '../../common/redis';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { RecordsService } from '../records/records.service';
import { ServiceAvailabilityService } from '../services/service-availability.service';
import {
  CircuitBreaker,
  OutcomeUnknownError,
  SimulatorAdapter,
  type ProviderAdapter,
  type ProviderResultStatus,
} from './providers';
import { simulatorCatalogFetch } from './simulator-catalog';
import {
  PAY2ALL_LIVE_SERVICES,
  PAY2ALL_PENDING_SERVICES,
  Pay2AllAdapter,
  Pay2AllClient,
  parsePay2AllCallback,
  type Pay2AllCredentials,
} from './pay2all';

/** Ids chosen on the record screen for a Live Pay2All operation. */
export const pay2allLiveSchema = z.object({
  providerId: z.coerce.number().int().positive().optional(),
  billerId: z.string().trim().min(1).max(64).optional(),
  referenceId: z.string().trim().max(128).optional().nullable(),
  params: z.record(z.string().max(64), z.string().trim().max(128)).optional(),
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number')
    .optional()
    .nullable(),
});

export const providerExecuteSchema = recordCreateBase
  .omit({ post: true, clientRef: true, opStatus: true })
  .extend({
    confirmed: z.literal(true, { message: 'Confirm the details before sending to the provider' }),
    live: pay2allLiveSchema.optional(),
  })
  .refine(collectedNeedsMethod, {
    message: 'Choose how the amount was collected',
    path: ['paymentMethod'],
  });

export const pay2allLookupSchema = z.object({
  number: z.string().regex(/^\d{6,20}$/, 'Enter the number'),
  type: z.enum(['mobile', 'dth']).default('mobile'),
});
export const pay2allBillFetchSchema = z.object({
  billerId: z.string().trim().min(1).max(64),
  params: z.record(z.string().max(64), z.string().trim().max(128)),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'),
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

type CfgLike = Pick<ConnectorConfig, 'mode' | 'credentialsEnc'> | null;

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly log = new Logger('Integrations');
  private readonly breakers = new Map<string, CircuitBreaker>();
  private simulator: SimulatorAdapter | null = null;
  /** Injectable for tests so no real Pay2All call is ever made. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

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

  private rawCredentials(cfg: CfgLike): Record<string, string> {
    if (!cfg?.credentialsEnc) return {};
    try {
      return JSON.parse(decryptSecret(cfg.credentialsEnc)) as Record<string, string>;
    } catch {
      this.log.error('Could not decrypt connector credentials');
      return {};
    }
  }

  private credentials(cfg: CfgLike): Pay2AllCredentials | null {
    const c = this.rawCredentials(cfg);
    return c.apiToken ? (c as unknown as Pay2AllCredentials) : null;
  }

  /** Adapter for a shop's connector settings, or null when every service is Offline. */
  adapterFor(cfg: CfgLike): ProviderAdapter | null {
    if (!cfg || cfg.mode === 'DISABLED') return null;
    if (cfg.mode === 'SIMULATOR') {
      if (!this.simulatorEnabled()) return null;
      this.simulator ??= new SimulatorAdapter(
        config().SIMULATOR_WEBHOOK_SECRET!,
        this.redis.client,
      );
      return this.simulator;
    }
    const creds = this.credentials(cfg);
    if (!creds) return null;
    return new Pay2AllAdapter(new Pay2AllClient(creds, cfg.mode === 'UAT', this.fetchImpl), creds);
  }

  /** What an operation row records as its mode (UAT is kept apart from real LIVE money). */
  private opMode(cfg: CfgLike, adapter: ProviderAdapter) {
    return cfg?.mode === 'UAT' ? 'UAT' : adapter.mode;
  }

  private breaker(id: string) {
    let b = this.breakers.get(id);
    if (!b) this.breakers.set(id, (b = new CircuitBreaker()));
    return b;
  }

  private loadConfig(tx: Tx, tenantId: string) {
    return tx.connectorConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'PAY2ALL' } },
    });
  }

  private callbackUrl(token: string | null | undefined) {
    return token
      ? `${config().PUBLIC_API_URL.replace(/\/$/, '')}/v1/webhooks/pay2all/${token}`
      : null;
  }

  // ------------------------------------------------------------------ configuration

  async overview(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const cfg = await this.loadConfig(tx, ctx.tenantId);
      const eff = await this.entitlements.effective(tx, ctx.tenantId);
      return {
        providers: [
          {
            provider: 'PAY2ALL',
            mode: cfg?.mode ?? 'DISABLED',
            liveAvailable: true,
            liveUnavailableReason: null,
            /** Services that can run Live through Pay2All today. */
            liveServices: PAY2ALL_LIVE_SERVICES,
            /** Services that can run Live in Pay2All's UAT test mode. */
            uatServices: ['RECHARGE'] as ServiceCode[],
            /** Offered by Pay2All but not yet documented — Offline only until they are. */
            pendingServices: PAY2ALL_PENDING_SERVICES,
            missing: [] as string[],
            simulatorAvailable: this.simulatorEnabled(),
            hasCredentials: !!cfg?.credentialsEnc,
            credentialsMasked: cfg?.credentialsMasked ?? null,
            keyVersion: cfg?.keyVersion ?? null,
            enabledServices: cfg?.enabledServices ?? [],
            supportedServices: Object.values(SERVICE_REGISTRY)
              .filter((s) => s.providerCapable)
              .map((s) => s.code),
            callbackUrl: this.callbackUrl(cfg?.webhookToken),
            lastHealthAt: cfg?.lastHealthAt ?? null,
            lastHealthStatus: cfg?.lastHealthStatus ?? null,
            version: cfg?.version ?? 0,
          },
        ],
        planAllowsConnector: eff.entitlements.connectorEligible,
        notice:
          'Offline services are recorded by hand. Live services are sent to Pay2All and paid from your Pay2All wallet.',
      };
    });
  }

  async configure(ctx: TenantCtx, dto: z.infer<typeof connectorConfigSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      if (dto.mode === 'SIMULATOR' && !this.simulatorEnabled())
        throw new AppError(
          'CONNECTOR_UNAVAILABLE',
          'The simulator is not enabled in this environment',
        );
      const existing = await this.loadConfig(tx, ctx.tenantId);
      const incoming = Object.fromEntries(
        Object.entries(dto.credentials ?? {})
          .filter(([, v]) => v.trim())
          .map(([k, v]) => [k, v.trim()]),
      );
      const credentialsChanged = Object.keys(incoming).length > 0;
      const merged = { ...this.rawCredentials(existing), ...incoming };
      if ((dto.mode === 'LIVE' || dto.mode === 'UAT') && !merged.apiToken)
        throw new AppError('VALIDATION_FAILED', 'Enter your Pay2All API token', undefined, {
          'credentials.apiToken': ['Enter your Pay2All API token'],
        });
      if (dto.mode !== 'DISABLED')
        await this.entitlements.assertBoolean(tx, ctx.tenantId, 'connectorEligible');

      const allowed: ServiceCode[] =
        dto.mode === 'SIMULATOR'
          ? Object.values(SERVICE_REGISTRY)
              .filter((s) => s.providerCapable)
              .map((s) => s.code)
          : dto.mode === 'UAT'
            ? ['RECHARGE']
            : PAY2ALL_LIVE_SERVICES;
      const data = {
        mode: dto.mode,
        enabledServices: dto.enabledServices.filter((c) => allowed.includes(c)),
        updatedByUserId: ctx.userId,
        webhookToken: existing?.webhookToken ?? randomToken(24),
        ...(credentialsChanged
          ? {
              credentialsEnc: encryptSecret(JSON.stringify(merged)),
              credentialsMasked: maskCredentials(merged),
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
        callbackUrl: this.callbackUrl(cfg.webhookToken),
      };
    });
  }

  async health(ctx: TenantCtx) {
    const cfg = await this.db.inTenant(ctx, (tx) => this.loadConfig(tx, ctx.tenantId));
    const adapter = this.adapterFor(cfg);
    const h = adapter
      ? await adapter.health()
      : {
          ok: false,
          detail:
            cfg && cfg.mode !== 'DISABLED'
              ? 'Add your Pay2All API token first'
              : 'All services are Offline',
        };
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

  // ------------------------------------------------------------------ Pay2All catalog (read-only)

  /** The shop's Pay2All client, for lookups. Never used for money-moving calls. */
  private async pay2all(ctx: TenantCtx) {
    const cfg = await this.db.inTenant(ctx, (tx) => this.loadConfig(tx, ctx.tenantId));
    if (cfg?.mode === 'SIMULATOR' && this.simulatorEnabled())
      return new Pay2AllClient({ apiToken: 'simulator' }, false, simulatorCatalogFetch);
    const creds = cfg && (cfg.mode === 'LIVE' || cfg.mode === 'UAT') ? this.credentials(cfg) : null;
    if (!creds)
      throw new AppError('CONNECTOR_UNAVAILABLE', 'Connect Pay2All (Live) in Integrations first');
    return new Pay2AllClient(creds, cfg!.mode === 'UAT', this.fetchImpl);
  }

  /** Catalog lists change rarely: cache them per shop for a few hours. */
  private async cached<T>(ctx: TenantCtx, key: string, ttlSec: number, load: () => Promise<T>) {
    const k = `csp2all:p2a:${ctx.tenantId}:${key}`;
    const hit = await this.redis.client.get(k).catch(() => null);
    if (hit) return JSON.parse(hit) as T;
    const v = await load();
    await this.redis.client.set(k, JSON.stringify(v), 'EX', ttlSec).catch(() => undefined);
    return v;
  }

  async p2aProviders(ctx: TenantCtx) {
    const c = await this.pay2all(ctx);
    return this.cached(ctx, `providers:${c.isUat}`, 6 * 3600, () =>
      c.read<unknown>('GET', '/providers', { timeoutMs: 10_000 }),
    );
  }

  async p2aLookup(ctx: TenantCtx, dto: z.infer<typeof pay2allLookupSchema>) {
    const c = await this.pay2all(ctx);
    return c.read<unknown>('POST', '/lookup', { body: dto, timeoutMs: 8000 });
  }

  async p2aPlans(ctx: TenantCtx, providerId: string, circleId?: string) {
    if (!/^\d{1,9}$/.test(providerId))
      throw new AppError('VALIDATION_FAILED', 'Choose the operator');
    const c = await this.pay2all(ctx);
    return this.cached(ctx, `plans:${providerId}:${circleId ?? ''}`, 3600, () =>
      c.read<unknown>('GET', '/plans', {
        query: { provider_id: providerId, circle_id: circleId },
        timeoutMs: 10_000,
      }),
    );
  }

  private async bbpsClient(ctx: TenantCtx) {
    const c = await this.pay2all(ctx);
    if (c.isUat)
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'Pay2All offers bill payment only in Live mode (not in UAT test mode)',
      );
    return c;
  }

  async p2aBbpsCategories(ctx: TenantCtx) {
    const c = await this.bbpsClient(ctx);
    return this.cached(ctx, 'bbps:categories', 12 * 3600, () =>
      c.read<unknown>('GET', '/bbps/categories', { timeoutMs: 10_000 }),
    );
  }

  async p2aBbpsBillers(ctx: TenantCtx, category: string) {
    if (!/^[\w-]{1,64}$/.test(category))
      throw new AppError('VALIDATION_FAILED', 'Choose a bill category');
    const c = await this.bbpsClient(ctx);
    return this.cached(ctx, `bbps:billers:${category}`, 12 * 3600, () =>
      c.read<unknown>('GET', '/bbps/billers', { query: { category }, timeoutMs: 10_000 }),
    );
  }

  async p2aBbpsBiller(ctx: TenantCtx, billerId: string) {
    if (!/^[\w-]{1,64}$/.test(billerId)) throw new AppError('VALIDATION_FAILED', 'Choose a biller');
    const c = await this.bbpsClient(ctx);
    return this.cached(ctx, `bbps:biller:${billerId}`, 12 * 3600, () =>
      c.read<unknown>('GET', `/bbps/billers/${encodeURIComponent(billerId)}`, {
        timeoutMs: 10_000,
      }),
    );
  }

  async p2aBbpsFetch(ctx: TenantCtx, dto: z.infer<typeof pay2allBillFetchSchema>) {
    const c = await this.bbpsClient(ctx);
    return c.read<unknown>('POST', '/bbps/fetch', {
      body: { biller_id: dto.billerId, params: dto.params, mobile_number: dto.mobile },
      timeoutMs: 15_000,
    });
  }

  // ------------------------------------------------------------------ account name check

  /** Whether the shop can verify a beneficiary's account name through its connected provider. */
  async accountVerifyStatus(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const cfg = await this.loadConfig(tx, ctx.tenantId);
      const adapter = this.adapterFor(cfg);
      const eff = await this.entitlements.effective(tx, ctx.tenantId);
      let reason: string | null = null;
      if (!eff.entitlements.connectorEligible) reason = 'PLAN';
      else if (!adapter) reason = 'NOT_CONFIGURED';
      else if (cfg?.mode === 'UAT') reason = 'LIVE_ONLY';
      else if (adapter instanceof SimulatorAdapter) {
        const dmt = (await this.availability.list(tx, ctx)).find((s) => s.code === 'DMT');
        if (!dmt?.providerExecution.available)
          reason = dmt?.providerExecution.reason ?? 'NOT_CONFIGURED';
      }
      return {
        available: reason === null,
        mode: reason === null ? this.opMode(cfg, adapter!) : null,
        reason,
      };
    });
  }

  async verifyAccount(ctx: TenantCtx, dto: { accountNumber: string; ifsc: string }) {
    const status = await this.accountVerifyStatus(ctx);
    if (!status.available)
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'Account verification needs Pay2All connected in Live mode. Enter the name manually.',
        { reason: status.reason },
      );
    const cfg = await this.db.inTenant(ctx, (tx) => this.loadConfig(tx, ctx.tenantId));
    const adapter = this.adapterFor(cfg)!;
    this.breaker(adapter.id).assertClosed();
    let r: Awaited<ReturnType<ProviderAdapter['verifyAccount']>>;
    try {
      r = await adapter.verifyAccount(dto, config().PROVIDER_TIMEOUT_MS);
      this.breaker(adapter.id).success();
    } catch (e) {
      this.breaker(adapter.id).failure();
      if (e instanceof AppError) throw e;
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'Could not reach the provider to verify the account. Enter the name manually or try again.',
      );
    }
    await this.db.inTenant(ctx, (tx) =>
      this.audit.tenant(tx, ctx, {
        action: 'beneficiary.account_verified',
        targetType: 'connector',
        targetId: cfg!.id,
        data: {
          mode: adapter.mode,
          result: r.status,
          account: `••••${dto.accountNumber.slice(-4)}`,
          ifsc: dto.ifsc,
        },
      }),
    );
    return r.status === 'VERIFIED'
      ? { verified: true as const, name: r.name, mode: adapter.mode }
      : { verified: false as const, message: r.message ?? 'Account not found', mode: adapter.mode };
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
    if (idempotencyKey.length > 64)
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key must be at most 64 characters');
    const requestHash = sha256(JSON.stringify(dto));
    const { live, confirmed: _confirmed, ...recordDto } = dto;
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
      const cfg = await this.loadConfig(tx, ctx.tenantId);
      const adapter = this.adapterFor(cfg);
      const avail = (await this.availability.list(tx, ctx)).find((s) => s.code === dto.serviceCode);
      if (
        !adapter ||
        !avail?.providerExecution.available ||
        !adapter.supports(dto.serviceCode as ServiceCode)
      ) {
        throw new AppError(
          'CONNECTOR_UNAVAILABLE',
          'Live mode is not available for this service. Save it as an Offline record instead.',
          { reason: avail?.providerExecution.reason ?? 'NOT_CONFIGURED' },
        );
      }
      if (!dto.principalPaise)
        throw new AppError('VALIDATION_FAILED', 'Enter the amount', undefined, {
          principalPaise: ['Enter the amount'],
        });
      this.breaker(adapter.id).assertClosed();
      const created = await this.records.create(
        ctx,
        { ...recordDto, opStatus: 'PENDING', post: false, clientRef: null },
        'PROVIDER',
        tx,
      );
      const op = await tx.providerOperation.create({
        data: {
          tenantId: ctx.tenantId,
          recordId: created.id,
          provider: 'PAY2ALL',
          mode: this.opMode(cfg, adapter),
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
        data: { service: dto.serviceCode, mode: op.mode },
      });
      return { op, adapter, details: created.details };
    });

    if ('existing' in prepared && prepared.existing)
      return this.operationJson(ctx, prepared.existing.id);
    const { op, adapter } = prepared as { op: ProviderOperation; adapter: ProviderAdapter };

    let outcome: { status: OpStatus; providerRef?: string; operatorRef?: string; error?: string };
    try {
      const r = await adapter.execute(
        {
          idempotencyKey,
          serviceCode: dto.serviceCode as ServiceCode,
          operationType: 'EXECUTE',
          amountPaise: dto.principalPaise,
          details: dto.details,
          live: live as Record<string, unknown> | undefined,
        },
        config().PROVIDER_TIMEOUT_MS,
      );
      this.breaker(adapter.id).success();
      outcome = {
        status: r.status,
        providerRef: r.providerRef,
        operatorRef: r.operatorRef,
        error: r.status === 'FAILED' ? r.message : undefined,
      };
    } catch (e) {
      if (e instanceof AppError && !(e instanceof OutcomeUnknownError)) {
        // Rejected before anything was sent (e.g. missing operator): nothing moved.
        outcome = { status: 'FAILED', error: e.message };
      } else {
        this.breaker(adapter.id).failure();
        // Never blindly retry: the request may have reached the provider. Reconciliation resolves it.
        outcome = {
          status: 'UNKNOWN',
          error:
            e instanceof OutcomeUnknownError ? e.message : 'Provider call failed after sending',
        };
      }
    }
    await this.db.inTenant(ctx, (tx) =>
      this.applyStatus(tx, ctx.tenantId, op.id, outcome.status, 'API', {
        providerRef: outcome.providerRef,
        operatorRef: outcome.operatorRef,
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
    data: { providerRef?: string; operatorRef?: string; error?: string; runId?: string } = {},
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
              : op.status === 'FAILED'
                ? (op.lastError ?? 'The provider reported this transaction as failed.')
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
    // Pay2All callbacks use the per-shop URL (handlePay2AllCallback): they carry no signature.
    const adapter: ProviderAdapter | null =
      provider === 'simulator'
        ? this.adapterFor({ mode: 'SIMULATOR', credentialsEnc: null })
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

  /**
   * Pay2All callback (POST /v1/webhooks/pay2all/:token). Pay2All does not sign callbacks, so:
   *  - the shop is identified by an unguessable token in its own callback URL,
   *  - the body must name one of that shop's pending operations (client_id = our idempotency key),
   *  - bill payments are re-checked with Pay2All's status API instead of trusting the body,
   *  - a recharge result is accepted only if the amount matches what we sent.
   */
  async handlePay2AllCallback(token: string, rawBody: Buffer | undefined, body: unknown) {
    const bodyHash = sha256(rawBody ?? JSON.stringify(body ?? {}));
    const cfg = /^[\w-]{16,64}$/.test(token)
      ? await this.db.asSystem((tx) =>
          tx.connectorConfig.findUnique({ where: { webhookToken: token } }),
        )
      : null;
    const reject = async (reason: string, tenantId: string | null = null) => {
      await this.db.asSystem((tx) =>
        tx.webhookReceipt.create({
          data: {
            provider: 'pay2all',
            deliveryId: `rejected:${bodyHash}:${Date.now()}`,
            tenantId,
            signatureValid: false,
            rawBodySha256: bodyHash,
            status: 'REJECTED',
            error: reason,
          },
        }),
      );
      return { ok: false };
    };
    if (!cfg) {
      await reject('unknown callback token');
      throw notFound('Webhook endpoint');
    }
    const cb = parsePay2AllCallback(body);
    if (!cb) return reject('malformed body', cfg.tenantId);
    const tctx = { tenantId: cfg.tenantId, userId: SYSTEM_USER };
    const op = await this.db.inTenant(tctx, (tx) =>
      tx.providerOperation.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: cfg.tenantId, idempotencyKey: cb.clientId } },
      }),
    );
    if (!op || op.mode === 'SIMULATOR') return reject('unknown client_id', cfg.tenantId);
    const rec = await this.db.inTenant(tctx, (tx) =>
      tx.serviceRecord.findFirstOrThrow({ where: { id: op.recordId, tenantId: cfg.tenantId } }),
    );
    let status: ProviderResultStatus = cb.status;
    let providerRef = cb.providerRef;
    if (rec.serviceCode === 'BILL_PAYMENT') {
      const adapter = this.adapterFor({ mode: op.mode, credentialsEnc: cfg.credentialsEnc });
      const s = adapter ? await adapter.queryStatus(op.idempotencyKey, 'BILL_PAYMENT') : null;
      if (!s || s.status === 'NOT_FOUND')
        return reject('not confirmed by status API', cfg.tenantId);
      status = s.status;
      providerRef = s.providerRef ?? providerRef;
    } else if (cb.amountPaise !== undefined && BigInt(cb.amountPaise) !== rec.principalPaise) {
      return reject('amount mismatch', cfg.tenantId);
    }
    // De-duplicate on the verified outcome, so a re-sent callback after settlement still applies.
    const deliveryId = `${cb.clientId}:${status}:${providerRef ?? ''}`;
    const dup = await this.db.asSystem((tx) =>
      tx.webhookReceipt.findUnique({
        where: { provider_deliveryId: { provider: 'pay2all', deliveryId } },
      }),
    );
    if (dup) return { ok: true, duplicate: true };
    await this.db.inTenant(tctx, async (tx) => {
      await tx.webhookReceipt.create({
        data: {
          provider: 'pay2all',
          deliveryId,
          tenantId: cfg.tenantId,
          signatureValid: false,
          rawBodySha256: bodyHash,
          payload: { status, providerRef: providerRef ?? null, utr: cb.utr ?? null },
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
      await this.applyStatus(tx, cfg.tenantId, op.id, status, 'WEBHOOK', {
        providerRef,
        operatorRef: cb.utr,
      });
    });
    return { ok: true, duplicate: false };
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
    const cfg = await this.db.inTenant(tctx, (tx) => this.loadConfig(tx, tenantId));
    for (const op of ops) {
      if (op.status === 'CONFIRMED' || op.status === 'FAILED') continue;
      // Ask in the mode the operation was sent in, with the shop's current credentials.
      const adapter = this.adapterFor({
        mode: op.mode === 'SIMULATOR' ? 'SIMULATOR' : op.mode === 'UAT' ? 'UAT' : 'LIVE',
        credentialsEnc: cfg?.credentialsEnc ?? null,
      });
      if (!adapter) continue;
      stats.checked++;
      try {
        const rec = await this.db.inTenant(tctx, (tx) =>
          tx.serviceRecord.findFirst({
            where: { id: op.recordId, tenantId },
            select: { serviceCode: true },
          }),
        );
        const s = await adapter.queryStatus(
          op.idempotencyKey,
          rec?.serviceCode as ServiceCode | undefined,
        );
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
