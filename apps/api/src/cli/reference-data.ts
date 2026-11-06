import type { Prisma, PrismaClient } from '@prisma/client';
import { en, SERVICE_CODES, SERVICE_REGISTRY, type Entitlements } from '@csp2all/shared';

/**
 * Idempotent reference data needed in every environment: the service catalog and the three
 * initial plans. Plan prices/limits are EDITABLE DEMONSTRATION DEFAULTS (isDemoDefault = true);
 * super admins publish new versions from the admin portal. Existing rows are never overwritten.
 */
const PLANS: Array<{
  code: string;
  isDefault: boolean;
  sortOrder: number;
  name: string;
  description: string;
  monthly: number;
  annual: number;
  graceDays: number;
  entitlements: Entitlements;
}> = [
  {
    code: 'FREE',
    isDefault: true,
    sortOrder: 0,
    name: 'Free',
    description: 'Example default: for single-counter shops getting started.',
    monthly: 0,
    annual: 0,
    graceDays: 0,
    entitlements: {
      staffLimit: 2,
      monthlyRecordLimit: 100,
      enabledServiceLimit: 4,
      customServiceLimit: 1,
      storageLimitMb: 100,
      exportsEnabled: false,
      advancedReports: false,
      customBranding: false,
      connectorEligible: false,
    },
  },
  {
    code: 'GROWTH',
    isDefault: false,
    sortOrder: 1,
    name: 'Growth',
    description: 'Example default: for busy shops with a few staff.',
    monthly: 49_900,
    annual: 4_99_000,
    graceDays: 7,
    entitlements: {
      staffLimit: 5,
      monthlyRecordLimit: 3000,
      enabledServiceLimit: 10,
      customServiceLimit: 5,
      storageLimitMb: 2048,
      exportsEnabled: true,
      advancedReports: true,
      customBranding: false,
      connectorEligible: false,
    },
  },
  {
    code: 'PRO',
    isDefault: false,
    sortOrder: 2,
    name: 'Pro',
    description: 'Example default: unlimited records, branding and connector eligibility.',
    monthly: 1_49_900,
    annual: 14_99_000,
    graceDays: 7,
    entitlements: {
      staffLimit: 25,
      monthlyRecordLimit: null,
      enabledServiceLimit: null,
      customServiceLimit: 25,
      storageLimitMb: 20480,
      exportsEnabled: true,
      advancedReports: true,
      customBranding: true,
      connectorEligible: true,
    },
  },
];

export async function seedReferenceData(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
    for (const [i, code] of SERVICE_CODES.entries()) {
      const s = SERVICE_REGISTRY[code];
      await tx.serviceDefinition.upsert({
        where: { code },
        create: {
          code,
          name: en[s.labelKey as keyof typeof en] ?? code,
          category: s.category,
          workflowType: s.workflowType,
          providerCapable: s.providerCapable,
          sortOrder: i,
        },
        update: {
          name: en[s.labelKey as keyof typeof en] ?? code,
          category: s.category,
          workflowType: s.workflowType,
          providerCapable: s.providerCapable,
          sortOrder: i,
        },
      });
    }
    for (const p of PLANS) {
      if (await tx.plan.findUnique({ where: { code: p.code } })) continue;
      const plan = await tx.plan.create({
        data: { code: p.code, isDefault: p.isDefault, sortOrder: p.sortOrder },
      });
      const v = await tx.planVersion.create({
        data: {
          planId: plan.id,
          version: 1,
          name: p.name,
          description: p.description,
          monthlyPricePaise: BigInt(p.monthly),
          annualPricePaise: BigInt(p.annual),
          currency: 'INR',
          taxRateBps: 1800,
          taxInclusive: false,
          trialDays: 0,
          graceDays: p.graceDays,
          entitlements: p.entitlements as unknown as Prisma.InputJsonValue,
          isDemoDefault: true,
        },
      });
      await tx.plan.update({ where: { id: plan.id }, data: { currentVersionId: v.id } });
    }
    if (!(await tx.platformSetting.findUnique({ where: { key: 'dataRetention' } }))) {
      await tx.platformSetting.create({
        data: {
          key: 'dataRetention',
          value: {
            auditLogDays: 2555,
            otpChallengeDays: 7,
            revokedSessionDays: 30,
            exportFileHours: 24,
            suspendedTenantDeletionDays: 180,
          },
        },
      });
    }
  });
}
