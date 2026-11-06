import { Injectable } from '@nestjs/common';
import { SERVICE_CODES, SERVICE_REGISTRY, type ServiceCode } from '@csp2all/shared';
import type { TenantCtx, Tx } from '../../common/db';
import { AppError } from '../../common/errors';
import { EntitlementsService } from '../subscription/entitlements.service';

export type UnavailableReason = 'PLATFORM' | 'TENANT' | 'PLAN' | 'PERMISSION';

export interface ServiceAvailability {
  code: ServiceCode;
  platformEnabled: boolean;
  selected: boolean;
  withinPlan: boolean;
  /** New records may be created by this user. */
  canCreate: boolean;
  /** Historical records remain viewable even when new entry is unavailable. */
  hasHistory: boolean;
  reason: UnavailableReason | null;
  workflowType: string;
  providerExecution: { available: boolean; reason: string | null };
}

/**
 * Availability = platform-enabled ∩ tenant-selected ∩ plan entitlement ∩ user permission
 * (∩ connector readiness for provider execution only). Enforced here, used by every write path.
 */
@Injectable()
export class ServiceAvailabilityService {
  constructor(private readonly entitlements: EntitlementsService) {}

  async list(tx: Tx, ctx: TenantCtx): Promise<ServiceAvailability[]> {
    const [defs, tenantServices, eff, history, connector] = [
      await tx.serviceDefinition.findMany(),
      await tx.tenantService.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { enabledAt: 'asc' },
      }),
      await this.entitlements.effective(tx, ctx.tenantId),
      await tx.serviceRecord.groupBy({
        by: ['serviceCode'],
        where: { tenantId: ctx.tenantId },
        _count: { _all: true },
      }),
      await tx.connectorConfig.findUnique({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: 'PAY2ALL' } },
      }),
    ];
    const platform = new Map(defs.map((d) => [d.code, d]));
    const enabled = tenantServices.filter((s) => s.enabled);
    const limit = eff.entitlements.enabledServiceLimit;
    // Downgrade policy: the earliest-enabled services stay usable up to the plan limit.
    const withinPlanCodes = new Set(
      enabled.slice(0, limit ?? enabled.length).map((s) => s.serviceCode),
    );
    const historyCodes = new Set(history.map((h) => h.serviceCode));
    const canCreateRecords = ctx.permissions.has('records.create');

    return SERVICE_CODES.map((code) => {
      const def = platform.get(code);
      const platformEnabled = def?.platformEnabled ?? false;
      const selected = enabled.some((s) => s.serviceCode === code);
      const withinPlan = withinPlanCodes.has(code);
      const reason: UnavailableReason | null = !platformEnabled
        ? 'PLATFORM'
        : !selected
          ? 'TENANT'
          : !withinPlan
            ? 'PLAN'
            : !canCreateRecords
              ? 'PERMISSION'
              : null;
      const reg = SERVICE_REGISTRY[code];
      let providerReason: string | null = null;
      if (!reg.providerCapable) providerReason = 'NOT_SUPPORTED';
      else if (!eff.entitlements.connectorEligible) providerReason = 'PLAN';
      else if (!connector || connector.mode === 'DISABLED') providerReason = 'NOT_CONFIGURED';
      else if (!connector.enabledServices.includes(code)) providerReason = 'SERVICE_NOT_ENABLED';
      else if (!ctx.permissions.has('provider.execute')) providerReason = 'PERMISSION';
      else if (reason) providerReason = reason;
      return {
        code,
        platformEnabled,
        selected,
        withinPlan,
        canCreate: reason === null,
        hasHistory: historyCodes.has(code),
        reason,
        workflowType: reg.workflowType,
        providerExecution: { available: providerReason === null, reason: providerReason },
      };
    });
  }

  async assertCanCreate(tx: Tx, ctx: TenantCtx, code: ServiceCode) {
    const a = (await this.list(tx, ctx)).find((s) => s.code === code);
    if (!a || !a.canCreate) {
      throw new AppError('SERVICE_NOT_AVAILABLE', 'This service is not available for new records', {
        service: code,
        reason: a?.reason ?? 'PLATFORM',
      });
    }
    return a;
  }
}
