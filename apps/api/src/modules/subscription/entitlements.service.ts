import { Injectable } from '@nestjs/common';
import { entitlementsSchema, monthPeriodKey, type Entitlements } from '@csp2all/shared';
import type { Tx } from '../../common/db';
import { AppError } from '../../common/errors';

export type BooleanEntitlement =
  'exportsEnabled' | 'advancedReports' | 'customBranding' | 'connectorEligible';

export interface EffectiveEntitlements {
  planCode: string;
  planName: string;
  planVersionId: string;
  subscriptionStatus: string;
  entitlements: Entitlements;
  overrides: { key: string; value: unknown; expiresAt: Date | null }[];
  /** True when a lapsed subscription has fallen back to the default plan. */
  fallback: boolean;
}

/**
 * The single place where plan limits are evaluated. No other module reads plan data directly.
 * Policy (docs/PLANS.md): lapsed subscriptions fall back to the default plan's entitlements;
 * no data is deleted — limits only restrict *new* activity.
 */
@Injectable()
export class EntitlementsService {
  async effective(tx: Tx, tenantId: string, now = new Date()): Promise<EffectiveEntitlements> {
    const sub = await tx.subscription.findUnique({ where: { tenantId } });
    let versionId = sub?.planVersionId;
    let fallback = false;
    if (!sub || sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
      const def = await tx.plan.findFirst({ where: { isDefault: true } });
      if (!def?.currentVersionId)
        throw new AppError('INTERNAL_ERROR', 'No default plan configured');
      versionId = def.currentVersionId;
      fallback = true;
    }
    const version = await tx.planVersion.findUniqueOrThrow({
      where: { id: versionId! },
      include: { plan: true },
    });
    const base = entitlementsSchema.parse(version.entitlements);
    const overrides = await tx.entitlementOverride.findMany({
      where: { tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: 'asc' },
    });
    const merged: Record<string, unknown> = { ...base };
    for (const o of overrides) merged[o.key] = o.value;
    return {
      planCode: version.plan.code,
      planName: version.name,
      planVersionId: version.id,
      subscriptionStatus: fallback ? `${sub?.status ?? 'NONE'}_FALLBACK` : sub!.status,
      entitlements: entitlementsSchema.parse(merged),
      overrides: overrides.map((o) => ({ key: o.key, value: o.value, expiresAt: o.expiresAt })),
      fallback,
    };
  }

  async assertBoolean(tx: Tx, tenantId: string, key: BooleanEntitlement) {
    const e = await this.effective(tx, tenantId);
    if (!e.entitlements[key]) {
      throw new AppError('ENTITLEMENT_REQUIRED', 'Your plan does not include this feature', {
        entitlement: key,
        plan: e.planCode,
      });
    }
  }

  /**
   * Atomically consumes one unit of the monthly record quota (tenant timezone month).
   * `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` locks the counter row, so concurrent
   * requests can never exceed the limit. Runs inside the record-creating transaction: if the
   * record insert fails, the usage increment rolls back with it.
   */
  async consumeRecordQuota(tx: Tx, tenantId: string, timezone: string, now = new Date()) {
    const { entitlements, planCode } = await this.effective(tx, tenantId, now);
    const limit = entitlements.monthlyRecordLimit;
    const periodKey = monthPeriodKey(now, timezone);
    const quotaError = () =>
      new AppError('QUOTA_EXCEEDED', 'Monthly record limit reached for your plan', {
        metric: 'RECORDS_CREATED',
        limit,
        periodKey,
        plan: planCode,
      });
    if (limit === 0) throw quotaError();
    const rows =
      limit === null
        ? await tx.$queryRaw<{ count: number }[]>`
            INSERT INTO usage_counters ("tenantId", metric, "periodKey", count, "updatedAt")
            VALUES (${tenantId}::uuid, 'RECORDS_CREATED', ${periodKey}, 1, now())
            ON CONFLICT ("tenantId", metric, "periodKey") DO UPDATE SET count = usage_counters.count + 1, "updatedAt" = now()
            RETURNING count`
        : await tx.$queryRaw<{ count: number }[]>`
            INSERT INTO usage_counters ("tenantId", metric, "periodKey", count, "updatedAt")
            VALUES (${tenantId}::uuid, 'RECORDS_CREATED', ${periodKey}, 1, now())
            ON CONFLICT ("tenantId", metric, "periodKey") DO UPDATE SET count = usage_counters.count + 1, "updatedAt" = now()
            WHERE usage_counters.count < ${limit}
            RETURNING count`;
    if (rows.length === 0) throw quotaError();
    return { used: rows[0].count, limit, periodKey };
  }

  /** Idempotent manual usage adjustment (e.g. support credit). */
  async adjustUsage(
    tx: Tx,
    tenantId: string,
    metric: string,
    periodKey: string,
    delta: number,
    reason: string,
    idempotencyKey: string,
  ) {
    const existing = await tx.usageAdjustment.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing) return { applied: false };
    await tx.usageAdjustment.create({
      data: { tenantId, metric, periodKey, delta, reason, idempotencyKey },
    });
    await tx.$executeRaw`
      INSERT INTO usage_counters ("tenantId", metric, "periodKey", count, "updatedAt")
      VALUES (${tenantId}::uuid, ${metric}, ${periodKey}, GREATEST(${delta}, 0), now())
      ON CONFLICT ("tenantId", metric, "periodKey") DO UPDATE SET count = GREATEST(usage_counters.count + ${delta}, 0), "updatedAt" = now()`;
    return { applied: true };
  }

  /** Serialises capacity checks per tenant (staff / services) with a row lock. */
  private async lockTenant(tx: Tx, tenantId: string) {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
  }

  async assertStaffCapacity(tx: Tx, tenantId: string) {
    await this.lockTenant(tx, tenantId);
    const { entitlements, planCode } = await this.effective(tx, tenantId);
    if (entitlements.staffLimit === null) return;
    const count = await tx.membership.count({
      where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
    });
    if (count >= entitlements.staffLimit) {
      throw new AppError('QUOTA_EXCEEDED', 'Staff limit reached for your plan', {
        metric: 'STAFF',
        limit: entitlements.staffLimit,
        plan: planCode,
      });
    }
  }

  async assertServiceCapacity(tx: Tx, tenantId: string) {
    await this.lockTenant(tx, tenantId);
    const { entitlements, planCode } = await this.effective(tx, tenantId);
    if (entitlements.enabledServiceLimit === null) return;
    const count = await tx.tenantService.count({ where: { tenantId, enabled: true } });
    if (count >= entitlements.enabledServiceLimit) {
      throw new AppError('QUOTA_EXCEEDED', 'Service limit reached for your plan', {
        metric: 'SERVICES',
        limit: entitlements.enabledServiceLimit,
        plan: planCode,
      });
    }
  }

  async assertCustomServiceCapacity(tx: Tx, tenantId: string) {
    await this.lockTenant(tx, tenantId);
    const { entitlements, planCode } = await this.effective(tx, tenantId);
    const count = await tx.customServiceDefinition.count({ where: { tenantId, active: true } });
    if (count >= entitlements.customServiceLimit) {
      throw new AppError('QUOTA_EXCEEDED', 'Custom service limit reached for your plan', {
        metric: 'CUSTOM_SERVICES',
        limit: entitlements.customServiceLimit,
        plan: planCode,
      });
    }
  }

  async assertStorage(tx: Tx, tenantId: string, addBytes: number) {
    const { entitlements, planCode } = await this.effective(tx, tenantId);
    const agg = await tx.attachment.aggregate({
      where: { tenantId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    const used = agg._sum.sizeBytes ?? 0;
    if (used + addBytes > entitlements.storageLimitMb * 1024 * 1024) {
      throw new AppError('QUOTA_EXCEEDED', 'Storage limit reached for your plan', {
        metric: 'STORAGE',
        limitMb: entitlements.storageLimitMb,
        plan: planCode,
      });
    }
  }

  async usage(tx: Tx, tenantId: string, timezone: string, now = new Date()) {
    const periodKey = monthPeriodKey(now, timezone);
    const [counter, staff, services, custom, storage] = await Promise.all([
      tx.usageCounter.findUnique({
        where: { tenantId_metric_periodKey: { tenantId, metric: 'RECORDS_CREATED', periodKey } },
      }),
      tx.membership.count({ where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } } }),
      tx.tenantService.count({ where: { tenantId, enabled: true } }),
      tx.customServiceDefinition.count({ where: { tenantId, active: true } }),
      tx.attachment.aggregate({ where: { tenantId, deletedAt: null }, _sum: { sizeBytes: true } }),
    ]);
    return {
      periodKey,
      periodTimezone: timezone,
      recordsThisPeriod: counter?.count ?? 0,
      staff,
      enabledServices: services,
      customServices: custom,
      storageBytes: storage._sum.sizeBytes ?? 0,
    };
  }
}
