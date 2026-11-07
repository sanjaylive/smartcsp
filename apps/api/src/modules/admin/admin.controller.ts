import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  adminCreateSchema,
  adminUpdateSchema,
  announcementSchema,
  catalogUpdateSchema,
  entitlementOverrideSchema,
  pagination,
  paymentReviewSchema,
  planVersionCreateSchema,
  subscriptionChangeSchema,
  tenantStatusSchema,
} from '@csp2all/shared';
import { AdminAccess, Auth, type AppRequest, type AuthState } from '../../common/access';
import { Db, type Tx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { d, n, pageResult, paginate } from '../../common/serialize';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { planVersionJson, SubscriptionService } from '../subscription/subscription.service';
import { SessionService } from '../auth/session.service';
import { normalizeEmail } from '../auth/otp.service';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';

const tenantListQuery = pagination.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_DELETION']).optional(),
});
const userListQuery = pagination.extend({ q: z.string().trim().max(120).optional() });
const statusQuery = pagination.extend({ status: z.string().max(20).optional() });
const auditQuery = pagination.extend({
  tenantId: z.uuid().optional(),
  action: z.string().max(60).optional(),
});
const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
  reason: z.string().trim().min(3).max(300),
});
const planMetaSchema = z.object({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});
const deletionSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  confirmName: z.string(),
});
const usageAdjustSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/),
  delta: z.number().int().min(-100000).max(100000),
  reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().min(8).max(100),
});

/** Settings that may be changed at runtime, with their validators. */
const SETTINGS: Record<string, z.ZodType> = {
  dataRetention: z.object({
    auditLogDays: z.number().int().min(365).max(3650),
    otpChallengeDays: z.number().int().min(1).max(90),
    revokedSessionDays: z.number().int().min(7).max(365),
    exportFileHours: z.number().int().min(1).max(168),
    suspendedTenantDeletionDays: z.number().int().min(30).max(3650),
  }),
  signupsEnabled: z.boolean(),
  supportContact: z.object({ email: z.email(), hours: z.string().max(100) }),
  brand: z.object({
    name: z.string().trim().min(1).max(40),
    tagline: z.string().trim().max(80).default(''),
    supportEmail: z.union([z.email(), z.literal('')]).default(''),
    supportPhone: z.string().trim().max(20).default(''),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #DC2626')
      .default('#DC2626'),
    logoUrl: z.union([z.string().url().max(500), z.literal('')]).default(''),
  }),
};

/** Public brand/config defaults (used when no `brand` setting has been saved yet). */
export const BRAND_DEFAULTS = {
  name: 'Smart Outlet',
  tagline: '',
  supportEmail: '',
  supportPhone: '',
  primaryColor: '#DC2626',
  logoUrl: '',
} as const;

@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly subs: SubscriptionService,
    private readonly entitlements: EntitlementsService,
    private readonly jobs: JobsService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {}

  private actor(auth: AuthState, req: AppRequest) {
    return { userId: auth.user.id, actorType: 'ADMIN' as const, requestId: req.requestId };
  }

  // ---------------------------------------------------------------- overview

  @Get('overview')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Platform overview', tags: ['Admin'] })
  overview() {
    return this.db.asSystem(async (tx) => {
      const since = new Date(Date.now() - 30 * 86_400_000);
      const tenants = await tx.tenant.groupBy({ by: ['status'], _count: { _all: true } });
      const plans = await tx.$queryRaw<{ code: string; count: bigint }[]>`
        SELECT p.code, count(*)::bigint AS count FROM subscriptions s JOIN plan_versions v ON v.id = s."planVersionId" JOIN plans p ON p.id = v."planId" GROUP BY p.code`;
      return {
        tenants: Object.fromEntries(tenants.map((t) => [t.status, t._count._all])),
        subscriptionsByPlan: Object.fromEntries(plans.map((p) => [p.code, Number(p.count)])),
        users: await tx.user.count(),
        newTenants30d: await tx.tenant.count({ where: { createdAt: { gte: since } } }),
        records30d: await tx.serviceRecord.count({ where: { createdAt: { gte: since } } }),
        pendingPayments: await tx.paymentSubmission.count({ where: { status: 'SUBMITTED' } }),
        failedEmails24h: await tx.emailLog.count({
          where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 86_400_000) } },
        }),
        failedOutbox: await tx.outboxEvent.count({ where: { status: 'FAILED' } }),
        openReconciliationExceptions: await tx.reconciliationException.count({
          where: { resolvedAt: null },
        }),
        activeSupportSessions: await tx.supportAccessSession.count({
          where: { endedAt: null, expiresAt: { gt: new Date() } },
        }),
        queues: await this.jobs.queueCounts().catch(() => ({})),
      };
    });
  }

  // ---------------------------------------------------------------- tenants

  @Get('tenants')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Search tenants', tags: ['Admin'], query: tenantListQuery })
  tenants(@Query() query: unknown) {
    const q = parse(tenantListQuery, query);
    return this.db.asSystem(async (tx) => {
      const where: Prisma.TenantWhereInput = {};
      if (q.status) where.status = q.status;
      if (q.q)
        where.OR = [
          { name: { contains: q.q, mode: 'insensitive' } },
          { district: { contains: q.q, mode: 'insensitive' } },
          { id: z.uuid().safeParse(q.q).success ? q.q : undefined },
        ];
      const [items, total] = [
        await tx.tenant.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: { subscription: true },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.tenant.count({ where }),
      ];
      const versions = await tx.planVersion.findMany({
        where: {
          id: {
            in: items.map((i) => i.subscription?.planVersionId).filter((x): x is string => !!x),
          },
        },
        include: { plan: true },
      });
      return pageResult(
        items.map((t) => {
          const v = versions.find((x) => x.id === t.subscription?.planVersionId);
          return {
            id: t.id,
            name: t.name,
            ownerDisplayName: t.ownerDisplayName,
            district: t.district,
            state: t.state,
            status: t.status,
            plan: v?.plan.code ?? null,
            subscriptionStatus: t.subscription?.status ?? null,
            createdAt: t.createdAt,
          };
        }),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Get('tenants/:id')
  @AdminAccess('platform.view')
  @ApiDoc({
    summary: 'Tenant administration details (no customer or record data — use a support session)',
    tags: ['Admin'],
  })
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.asSystem(async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id },
        include: { subscription: true, services: true },
      });
      if (!t) throw notFound('Tenant');
      const members = await tx.membership.findMany({
        where: { tenantId: id },
        include: { user: { select: { email: true, lastLoginAt: true } } },
      });
      const eff = await this.entitlements.effective(tx, id);
      const usage = await this.entitlements.usage(tx, id, t.timezone);
      const events = await tx.subscriptionEvent.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const overrides = await tx.entitlementOverride.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
      });
      const connector = await tx.connectorConfig.findFirst({ where: { tenantId: id } });
      const support = await tx.supportAccessSession.findMany({
        where: { tenantId: id },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
      return {
        tenant: {
          id: t.id,
          name: t.name,
          ownerDisplayName: t.ownerDisplayName,
          status: t.status,
          statusReason: t.statusReason,
          state: t.state,
          district: t.district,
          contactPhone: t.contactPhone,
          contactPhoneVerified: t.contactPhoneVerified,
          timezone: t.timezone,
          createdAt: t.createdAt,
        },
        members: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.user.email,
          role: m.role,
          status: m.status,
          lastLoginAt: m.user.lastLoginAt,
        })),
        services: t.services.map((s) => ({ code: s.serviceCode, enabled: s.enabled })),
        subscription: t.subscription
          ? { ...t.subscription, planCode: eff.planCode, planName: eff.planName }
          : null,
        entitlements: eff.entitlements,
        overrides: overrides.map((o) => ({
          id: o.id,
          key: o.key,
          value: o.value,
          reason: o.reason,
          expiresAt: o.expiresAt,
          revokedAt: o.revokedAt,
          createdAt: o.createdAt,
        })),
        usage,
        subscriptionEvents: events,
        connector: connector
          ? {
              mode: connector.mode,
              enabledServices: connector.enabledServices,
              credentialsMasked: connector.credentialsMasked,
              lastHealthStatus: connector.lastHealthStatus,
              lastHealthAt: connector.lastHealthAt,
            }
          : null,
        supportSessions: support,
      };
    });
  }

  @Post('tenants/:id/status')
  @HttpCode(200)
  @AdminAccess('tenants.manage')
  @ApiDoc({
    summary: 'Suspend or restore a tenant (reason required, audited, tenant notified)',
    tags: ['Admin'],
    body: tenantStatusSchema,
  })
  setTenantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(tenantStatusSchema, body);
    return this.db.asSystem(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw notFound('Tenant');
      if (t.status === 'PENDING_DELETION' && dto.status === 'ACTIVE')
        throw new AppError('CONFLICT', 'Cancel the deletion request first');
      const u = await tx.tenant.update({
        where: { id },
        data: { status: dto.status, statusReason: dto.reason, version: { increment: 1 } },
      });
      await tx.notification.create({
        data: {
          tenantId: id,
          type: 'TENANT_STATUS',
          title:
            dto.status === 'SUSPENDED'
              ? 'Your shop has been suspended'
              : 'Your shop has been restored',
          body: dto.reason,
        },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: id,
        action: dto.status === 'SUSPENDED' ? 'admin.tenant_suspended' : 'admin.tenant_restored',
        targetType: 'tenant',
        targetId: id,
        data: { reason: dto.reason, from: t.status },
      });
      return { id: u.id, status: u.status, statusReason: u.statusReason };
    });
  }

  @Post('tenants/:id/deletion-request')
  @HttpCode(200)
  @AdminAccess('tenants.manage')
  @ApiDoc({
    summary:
      'Begin controlled tenant deletion (suspends; purge runs after the retention window via the documented runbook)',
    tags: ['Admin'],
    body: deletionSchema,
  })
  requestDeletion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(deletionSchema, body);
    return this.db.asSystem(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw notFound('Tenant');
      if (dto.confirmName !== t.name)
        throw new AppError(
          'VALIDATION_FAILED',
          'Type the shop name exactly to confirm',
          undefined,
          { confirmName: ['Does not match'] },
        );
      await tx.tenant.update({
        where: { id },
        data: { status: 'PENDING_DELETION', statusReason: dto.reason, version: { increment: 1 } },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: id,
        action: 'admin.tenant_deletion_requested',
        targetType: 'tenant',
        targetId: id,
        data: { reason: dto.reason },
      });
      return { id, status: 'PENDING_DELETION' };
    });
  }

  @Post('tenants/:id/subscription/change')
  @HttpCode(200)
  @AdminAccess('subscriptions.manage')
  @ApiDoc({
    summary: 'Change a tenant plan now or at period end',
    tags: ['Admin'],
    body: subscriptionChangeSchema,
  })
  changeSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(subscriptionChangeSchema, body);
    return this.db.asSystem(async (tx) => {
      await this.subs.changePlan(
        tx,
        id,
        dto.planCode,
        dto.billingCycle,
        dto.effective,
        { userId: auth.user.id, actorType: 'ADMIN' },
        dto.reason,
      );
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: id,
        action: 'admin.subscription_changed',
        targetType: 'tenant',
        targetId: id,
        data: dto,
      });
      return tx.subscription.findUnique({ where: { tenantId: id } });
    });
  }

  @Post('tenants/:id/entitlement-overrides')
  @AdminAccess('subscriptions.manage')
  @ApiDoc({
    summary: 'Override one entitlement for a tenant (optionally until a date)',
    tags: ['Admin'],
    body: entitlementOverrideSchema,
  })
  addOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(entitlementOverrideSchema, body);
    return this.db.asSystem(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId: id } });
      if (!sub) throw notFound('Tenant');
      await tx.entitlementOverride.updateMany({
        where: { tenantId: id, key: dto.key, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const o = await tx.entitlementOverride.create({
        data: {
          tenantId: id,
          key: dto.key,
          value: dto.value as Prisma.InputJsonValue,
          reason: dto.reason,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdByUserId: auth.user.id,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          tenantId: id,
          subscriptionId: sub.id,
          type: 'OVERRIDE_SET',
          actorUserId: auth.user.id,
          actorType: 'ADMIN',
          data: { key: dto.key, value: dto.value, reason: dto.reason },
        },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: id,
        action: 'admin.entitlement_override',
        targetType: 'tenant',
        targetId: id,
        data: dto,
      });
      return o;
    });
  }

  @Delete('tenants/:id/entitlement-overrides/:overrideId')
  @AdminAccess('subscriptions.manage')
  @ApiDoc({ summary: 'Revoke an entitlement override', tags: ['Admin'] })
  revokeOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    return this.db.asSystem(async (tx) => {
      const r = await tx.entitlementOverride.updateMany({
        where: { id: overrideId, tenantId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (r.count === 0) throw notFound('Override');
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: id,
        action: 'admin.entitlement_override_revoked',
        targetType: 'entitlement_override',
        targetId: overrideId,
      });
      return { ok: true };
    });
  }

  @Post('tenants/:id/usage-adjustments')
  @AdminAccess('subscriptions.manage')
  @ApiDoc({
    summary: 'Idempotent usage adjustment (e.g. support credit)',
    tags: ['Admin'],
    body: usageAdjustSchema,
  })
  adjustUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(usageAdjustSchema, body);
    return this.db.asSystem(async (tx) => {
      const r = await this.entitlements.adjustUsage(
        tx,
        id,
        'RECORDS_CREATED',
        dto.periodKey,
        dto.delta,
        dto.reason,
        dto.idempotencyKey,
      );
      if (r.applied)
        await this.audit.platform(tx, this.actor(auth, req), {
          tenantId: id,
          action: 'admin.usage_adjusted',
          targetType: 'tenant',
          targetId: id,
          data: dto,
        });
      return r;
    });
  }

  // ---------------------------------------------------------------- users

  @Get('users')
  @AdminAccess('users.manage')
  @ApiDoc({ summary: 'Search users and memberships', tags: ['Admin'], query: userListQuery })
  users(@Query() query: unknown) {
    const q = parse(userListQuery, query);
    return this.db.asSystem(async (tx) => {
      const where: Prisma.UserWhereInput = q.q ? { email: { contains: q.q.toLowerCase() } } : {};
      const [items, total] = [
        await tx.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            memberships: { include: { tenant: { select: { name: true } } } },
            platformAdmin: true,
          },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.user.count({ where }),
      ];
      return pageResult(
        items.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          status: u.status,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
          platformRole: u.platformAdmin?.role ?? null,
          memberships: u.memberships.map((m) => ({
            tenantId: m.tenantId,
            tenantName: m.tenant.name,
            role: m.role,
            status: m.status,
          })),
        })),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Post('users/:id/status')
  @HttpCode(200)
  @AdminAccess('users.manage')
  @ApiDoc({
    summary: 'Disable or enable a user (disabling revokes all sessions)',
    tags: ['Admin'],
    body: userStatusSchema,
  })
  async userStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(userStatusSchema, body);
    if (id === auth.user.id)
      throw new AppError('FORBIDDEN', 'You cannot change your own account status');
    const result = await this.db.asSystem(async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, include: { platformAdmin: true } });
      if (!u) throw notFound('User');
      if (
        dto.status === 'DISABLED' &&
        u.platformAdmin?.role === 'SUPER_ADMIN' &&
        u.platformAdmin.status === 'ACTIVE'
      )
        await this.assertNotLastSuperAdmin(tx, u.platformAdmin.id);
      await tx.user.update({ where: { id }, data: { status: dto.status } });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.user_status',
        targetType: 'user',
        targetId: id,
        data: dto,
      });
      return { id, status: dto.status };
    });
    if (dto.status === 'DISABLED')
      await this.sessions.revokeAllForUser(id, 'ADMIN_DISABLED', ['WEB', 'MOBILE', 'ADMIN']);
    return result;
  }

  // ---------------------------------------------------------------- plans

  @Get('plans')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Plans with all versions', tags: ['Admin'] })
  plans() {
    return this.db.asSystem(async (tx) => {
      const plans = await tx.plan.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      const counts = await tx.subscription.groupBy({
        by: ['planVersionId'],
        _count: { _all: true },
      });
      return {
        items: plans.map((p) => ({
          id: p.id,
          code: p.code,
          isActive: p.isActive,
          isDefault: p.isDefault,
          sortOrder: p.sortOrder,
          currentVersionId: p.currentVersionId,
          versions: p.versions.map((v) => ({
            ...planVersionJson(v),
            subscribers: counts.find((c) => c.planVersionId === v.id)?._count._all ?? 0,
          })),
        })),
      };
    });
  }

  @Post('plans/:code/versions')
  @AdminAccess('plans.manage')
  @ApiDoc({
    summary:
      'Publish a new plan version (names, prices, limits); choose how existing subscribers are handled',
    tags: ['Admin'],
    body: planVersionCreateSchema,
  })
  createVersion(
    @Param('code') code: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(planVersionCreateSchema, body);
    return this.db.asSystem(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { code } });
      if (!plan) throw notFound('Plan');
      await tx.$queryRaw`SELECT id FROM plans WHERE id = ${plan.id}::uuid FOR UPDATE`;
      const last = await tx.planVersion.findFirst({
        where: { planId: plan.id },
        orderBy: { version: 'desc' },
      });
      const v = await tx.planVersion.create({
        data: {
          planId: plan.id,
          version: (last?.version ?? 0) + 1,
          name: dto.name,
          description: dto.description ?? null,
          monthlyPricePaise: BigInt(dto.monthlyPricePaise),
          annualPricePaise: BigInt(dto.annualPricePaise),
          currency: dto.currency,
          taxRateBps: dto.taxRateBps,
          taxInclusive: dto.taxInclusive,
          trialDays: dto.trialDays,
          graceDays: dto.graceDays,
          entitlements: dto.entitlements,
          existingSubscribers: dto.existingSubscribers,
          isDemoDefault: false,
          createdByUserId: auth.user.id,
        },
      });
      await tx.plan.update({ where: { id: plan.id }, data: { currentVersionId: v.id } });
      let migrated = 0;
      if (dto.existingSubscribers === 'MIGRATE_NOW') {
        const subs = await tx.subscription.findMany({
          where: {
            planVersionId: {
              in: (
                await tx.planVersion.findMany({
                  where: { planId: plan.id, id: { not: v.id } },
                  select: { id: true },
                })
              ).map((x) => x.id),
            },
          },
        });
        for (const s of subs) {
          await tx.subscription.update({
            where: { id: s.id },
            data: { planVersionId: v.id, version: { increment: 1 } },
          });
          await tx.subscriptionEvent.create({
            data: {
              tenantId: s.tenantId,
              subscriptionId: s.id,
              type: 'PLAN_CHANGED',
              fromPlanVersionId: s.planVersionId,
              toPlanVersionId: v.id,
              actorUserId: auth.user.id,
              actorType: 'ADMIN',
              data: { reason: 'Plan version migration' },
            },
          });
          migrated++;
        }
      }
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.plan_version_created',
        targetType: 'plan',
        targetId: plan.id,
        data: { code, version: v.version, existingSubscribers: dto.existingSubscribers, migrated },
      });
      return { ...planVersionJson(v), migratedSubscribers: migrated };
    });
  }

  @Patch('plans/:code')
  @AdminAccess('plans.manage')
  @ApiDoc({
    summary: 'Activate/deactivate a plan or change its order',
    tags: ['Admin'],
    body: planMetaSchema,
  })
  updatePlan(
    @Param('code') code: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(planMetaSchema, body);
    return this.db.asSystem(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { code } });
      if (!plan) throw notFound('Plan');
      if (plan.isDefault && dto.isActive === false)
        throw new AppError('CONFLICT', 'The default plan cannot be deactivated');
      const u = await tx.plan.update({ where: { id: plan.id }, data: dto });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.plan_updated',
        targetType: 'plan',
        targetId: plan.id,
        data: dto,
      });
      return u;
    });
  }

  @Post('subscriptions/run-lifecycle')
  @HttpCode(200)
  @AdminAccess('subscriptions.manage')
  @ApiDoc({ summary: 'Run trial/grace/expiry/scheduled-change processing now', tags: ['Admin'] })
  runLifecycle() {
    return this.subs.runLifecycle(new Date());
  }

  // ---------------------------------------------------------------- manual payments

  @Get('payment-submissions')
  @AdminAccess('payments.approve')
  @ApiDoc({
    summary: 'Manual payment submissions awaiting review',
    tags: ['Admin'],
    query: statusQuery,
  })
  payments(@Query() query: unknown) {
    const q = parse(statusQuery, query);
    return this.db.asSystem(async (tx) => {
      const where: Prisma.PaymentSubmissionWhereInput = { status: q.status ?? 'SUBMITTED' };
      const [items, total] = [
        await tx.paymentSubmission.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.paymentSubmission.count({ where }),
      ];
      const tenants = await tx.tenant.findMany({
        where: { id: { in: items.map((i) => i.tenantId) } },
        select: { id: true, name: true },
      });
      const versions = await tx.planVersion.findMany({
        where: { id: { in: items.map((i) => i.planVersionId) } },
        include: { plan: true },
      });
      const proofs = await tx.attachment.findMany({
        where: {
          ownerType: 'PAYMENT_SUBMISSION',
          ownerId: { in: items.map((i) => i.id) },
          deletedAt: null,
        },
        select: { id: true, ownerId: true, fileName: true },
      });
      return pageResult(
        items.map((s) => {
          const v = versions.find((x) => x.id === s.planVersionId);
          return {
            id: s.id,
            tenantId: s.tenantId,
            tenantName: tenants.find((t) => t.id === s.tenantId)?.name,
            planCode: v?.plan.code,
            planName: v?.name,
            billingCycle: s.billingCycle,
            method: s.method,
            payerReference: s.payerReference,
            paidOn: d(s.paidOn),
            amountPaise: n(s.amountPaise),
            expectedPaise: n(s.expectedPaise),
            amountMatches: s.amountPaise === s.expectedPaise,
            status: s.status,
            notes: s.notes,
            reviewNotes: s.reviewNotes,
            proofs: proofs.filter((p) => p.ownerId === s.id),
            createdAt: s.createdAt,
            version: s.version,
          };
        }),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Post('payment-submissions/:id/review')
  @HttpCode(200)
  @AdminAccess('payments.approve')
  @ApiDoc({
    summary: 'Approve (activates the plan) or reject a manual payment',
    tags: ['Admin'],
    body: paymentReviewSchema,
  })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(paymentReviewSchema, body);
    return this.db
      .asSystem(async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_submissions WHERE id = ${id}::uuid FOR UPDATE`;
        const s = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!s) throw notFound('Payment submission');
        if (s.status !== 'SUBMITTED')
          throw new AppError('CONFLICT', `Already ${s.status.toLowerCase()}`);
        const u = await tx.paymentSubmission.update({
          where: { id },
          data: {
            status: dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            reviewedByUserId: auth.user.id,
            reviewedAt: new Date(),
            reviewNotes: dto.notes ?? null,
            version: { increment: 1 },
          },
        });
        if (dto.decision === 'APPROVE') {
          await this.subs.activate(
            tx,
            s.tenantId,
            s.planVersionId,
            s.billingCycle as 'MONTHLY' | 'ANNUAL',
            { userId: auth.user.id, actorType: 'ADMIN' },
            { paymentSubmissionId: id },
          );
        } else {
          await tx.notification.create({
            data: {
              tenantId: s.tenantId,
              type: 'SUBSCRIPTION',
              title: 'Payment could not be verified',
              body: dto.notes ?? 'Please check the payment details and submit again.',
              link: '/app/subscription',
            },
          });
        }
        const owner = await tx.membership.findFirst({
          where: { tenantId: s.tenantId, role: 'OWNER' },
          include: { user: true },
        });
        if (owner) {
          await this.email.sendInTx(
            tx,
            this.email.simple(
              owner.user.email,
              'payment_reviewed',
              dto.decision === 'APPROVE'
                ? 'Your CSP2All plan is active'
                : 'Your CSP2All payment needs attention',
              dto.decision === 'APPROVE'
                ? 'Your payment was verified and your plan is now active.'
                : `We could not verify your payment. ${dto.notes ?? ''}`,
            ),
            s.tenantId,
          );
        }
        await this.audit.platform(tx, this.actor(auth, req), {
          tenantId: s.tenantId,
          action: `admin.payment_${dto.decision.toLowerCase()}d`,
          targetType: 'payment_submission',
          targetId: id,
          data: { notes: dto.notes, amountPaise: s.amountPaise, expectedPaise: s.expectedPaise },
        });
        return { id: u.id, status: u.status };
      })
      .finally(() => this.jobs.kick());
  }

  @Get('payment-submissions/:id/proofs/:attachmentId/url')
  @AdminAccess('payments.approve')
  @ApiDoc({ summary: 'Short-lived link to a payment proof (audited)', tags: ['Admin'] })
  proofUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    return this.db.asSystem(async (tx) => {
      const a = await tx.attachment.findFirst({
        where: { id: attachmentId, ownerType: 'PAYMENT_SUBMISSION', ownerId: id, deletedAt: null },
      });
      if (!a) throw notFound('Payment proof');
      if (a.scanStatus === 'PENDING')
        throw new AppError('CONFLICT', 'This file is still being checked');
      if (a.scanStatus === 'INFECTED')
        throw new AppError('FILE_REJECTED', 'This file failed the security scan');
      await this.audit.platform(tx, this.actor(auth, req), {
        tenantId: a.tenantId,
        action: 'admin.payment_proof_viewed',
        targetType: 'attachment',
        targetId: a.id,
      });
      return this.storage.signedUrl(a.storageKey, a.fileName, a.contentType);
    });
  }

  // ---------------------------------------------------------------- catalog & connectors

  @Get('services')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Service catalog with adoption', tags: ['Admin'] })
  catalog() {
    return this.db.asSystem(async (tx) => {
      const defs = await tx.serviceDefinition.findMany({ orderBy: { sortOrder: 'asc' } });
      const adoption = await tx.tenantService.groupBy({
        by: ['serviceCode'],
        where: { enabled: true },
        _count: { _all: true },
      });
      return {
        items: defs.map((s) => ({
          ...s,
          enabledTenants: adoption.find((a) => a.serviceCode === s.code)?._count._all ?? 0,
        })),
      };
    });
  }

  @Patch('services/:code')
  @AdminAccess('catalog.manage')
  @ApiDoc({
    summary: 'Enable/disable a service platform-wide (history preserved; new entry blocked)',
    tags: ['Admin'],
    body: catalogUpdateSchema,
  })
  updateService(
    @Param('code') code: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(catalogUpdateSchema, body);
    return this.db.asSystem(async (tx) => {
      const s = await tx.serviceDefinition.findUnique({ where: { code } });
      if (!s) throw notFound('Service');
      const u = await tx.serviceDefinition.update({
        where: { code },
        data: { platformEnabled: dto.platformEnabled },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.catalog_updated',
        targetType: 'service',
        targetId: code,
        data: dto,
      });
      return u;
    });
  }

  @Get('connectors')
  @AdminAccess('connectors.manage')
  @ApiDoc({
    summary: 'Connector configurations, health, operations and webhook receipts',
    tags: ['Admin'],
  })
  connectors() {
    return this.db.asSystem(async (tx) => ({
      configs: (
        await tx.connectorConfig.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
      ).map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        provider: c.provider,
        mode: c.mode,
        enabledServices: c.enabledServices,
        credentialsMasked: c.credentialsMasked,
        keyVersion: c.keyVersion,
        lastHealthAt: c.lastHealthAt,
        lastHealthStatus: c.lastHealthStatus,
      })),
      operationsByStatus: Object.fromEntries(
        (await tx.providerOperation.groupBy({ by: ['status'], _count: { _all: true } })).map(
          (g) => [g.status, g._count._all],
        ),
      ),
      openExceptions: await tx.reconciliationException.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      recentWebhooks: (
        await tx.webhookReceipt.findMany({ orderBy: { receivedAt: 'desc' }, take: 50 })
      ).map((w) => ({
        id: w.id,
        provider: w.provider,
        deliveryId: w.deliveryId,
        signatureValid: w.signatureValid,
        status: w.status,
        error: w.error,
        receivedAt: w.receivedAt,
      })),
      pay2all: {
        liveAvailable: false,
        reason:
          'Awaiting official documentation, credentials and approvals (docs/PAY2ALL_READINESS.md)',
      },
    }));
  }

  // ---------------------------------------------------------------- email & jobs

  @Get('email-logs')
  @AdminAccess('platform.view')
  @ApiDoc({
    summary: 'Email delivery status (recipients masked)',
    tags: ['Admin'],
    query: statusQuery,
  })
  emailLogs(@Query() query: unknown) {
    const q = parse(statusQuery, query);
    return this.db.asSystem(async (tx) => {
      const where: Prisma.EmailLogWhereInput = q.status ? { status: q.status } : {};
      const [items, total] = [
        await tx.emailLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.emailLog.count({ where }),
      ];
      return pageResult(
        items.map(({ toHash: _h, ...rest }) => rest),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Get('jobs')
  @AdminAccess('jobs.manage')
  @ApiDoc({ summary: 'Queue counts, failed jobs and failed outbox events', tags: ['Admin'] })
  async jobsOverview() {
    const failedOutbox = await this.db.asSystem((tx) =>
      tx.outboxEvent.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    return {
      queues: await this.jobs.queueCounts().catch(() => ({})),
      failedJobs: await this.jobs.failedJobs().catch(() => []),
      failedOutbox: failedOutbox.map((o) => ({
        id: o.id,
        tenantId: o.tenantId,
        type: o.type,
        attempts: o.attempts,
        lastError: o.lastError,
        createdAt: o.createdAt,
      })),
    };
  }

  @Post('jobs/:id/retry')
  @HttpCode(200)
  @AdminAccess('jobs.manage')
  @ApiDoc({ summary: 'Retry a failed queue job', tags: ['Admin'] })
  async retryJob(@Param('id') id: string) {
    await this.jobs.retryJob(id);
    return { ok: true };
  }

  @Post('outbox/:id/retry')
  @HttpCode(200)
  @AdminAccess('jobs.manage')
  @ApiDoc({ summary: 'Re-queue a failed outbox event', tags: ['Admin'] })
  async retryOutbox(@Param('id', ParseUUIDPipe) id: string) {
    await this.db.asSystem((tx) =>
      tx.outboxEvent.updateMany({
        where: { id, status: 'FAILED' },
        data: { status: 'PENDING', attempts: 0, availableAt: new Date() },
      }),
    );
    this.jobs.kick();
    return { ok: true };
  }

  // ---------------------------------------------------------------- announcements, audit, settings

  @Get('announcements')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Announcements', tags: ['Admin'] })
  announcements() {
    return this.db.asSystem(async (tx) => ({
      items: await tx.announcement.findMany({ orderBy: { startsAt: 'desc' }, take: 100 }),
    }));
  }

  @Post('announcements')
  @AdminAccess('announcements.manage')
  @ApiDoc({ summary: 'Publish an announcement', tags: ['Admin'], body: announcementSchema })
  createAnnouncement(@Body() body: unknown, @Auth() auth: AuthState, @Req() req: AppRequest) {
    const dto = parse(announcementSchema, body);
    return this.db.asSystem(async (tx) => {
      const a = await tx.announcement.create({
        data: {
          title: dto.title,
          body: dto.body,
          severity: dto.severity,
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          createdByUserId: auth.user.id,
        },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.announcement_created',
        targetType: 'announcement',
        targetId: a.id,
      });
      return a;
    });
  }

  @Delete('announcements/:id')
  @AdminAccess('announcements.manage')
  @ApiDoc({ summary: 'End an announcement now', tags: ['Admin'] })
  endAnnouncement(
    @Param('id', ParseUUIDPipe) id: string,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    return this.db.asSystem(async (tx) => {
      await tx.announcement.update({ where: { id }, data: { endsAt: new Date() } });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.announcement_ended',
        targetType: 'announcement',
        targetId: id,
      });
      return { ok: true };
    });
  }

  @Get('audit')
  @AdminAccess('audit.view')
  @ApiDoc({ summary: 'Platform-wide audit log', tags: ['Admin'], query: auditQuery })
  auditLog(@Query() query: unknown) {
    const q = parse(auditQuery, query);
    return this.db.asSystem(async (tx) => {
      const where: Prisma.AuditEventWhereInput = {};
      if (q.tenantId) where.tenantId = q.tenantId;
      if (q.action) where.action = { startsWith: q.action };
      const [items, total] = [
        await tx.auditEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.auditEvent.count({ where }),
      ];
      return pageResult(items, total, q.page, q.pageSize);
    });
  }

  @Get('settings')
  @AdminAccess('platform.view')
  @ApiDoc({ summary: 'Platform settings (data retention etc.)', tags: ['Admin'] })
  settings() {
    return this.db.asSystem(async (tx) => ({
      items: await tx.platformSetting.findMany(),
      editableKeys: Object.keys(SETTINGS),
    }));
  }

  @Put('settings/:key')
  @AdminAccess('settings.manage')
  @ApiDoc({ summary: 'Update a platform setting', tags: ['Admin'] })
  updateSetting(
    @Param('key') key: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const schema = SETTINGS[key];
    if (!schema) throw notFound('Setting');
    const value = parse(z.object({ value: schema }), body).value;
    return this.db.asSystem(async (tx) => {
      const s = await tx.platformSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedByUserId: auth.user.id },
        update: { value: value as Prisma.InputJsonValue, updatedByUserId: auth.user.id },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.setting_updated',
        targetType: 'setting',
        targetId: key,
        data: { value },
      });
      return s;
    });
  }

  // ---------------------------------------------------------------- platform admins

  @Get('admins')
  @AdminAccess('admins.manage')
  @ApiDoc({ summary: 'Platform administrators', tags: ['Admin'] })
  admins() {
    return this.db.asSystem(async (tx) => ({
      items: (
        await tx.platformAdmin.findMany({
          include: { user: { select: { email: true, lastLoginAt: true } } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((a) => ({
        id: a.id,
        userId: a.userId,
        email: a.user.email,
        role: a.role,
        status: a.status,
        mfaEnabled: !!a.totpEnabledAt,
        lastLoginAt: a.user.lastLoginAt,
        createdAt: a.createdAt,
        version: a.version,
      })),
    }));
  }

  @Post('admins')
  @AdminAccess('admins.manage')
  @ApiDoc({
    summary: 'Add a platform admin (they enrol TOTP on first sign-in)',
    tags: ['Admin'],
    body: adminCreateSchema,
  })
  addAdmin(@Body() body: unknown, @Auth() auth: AuthState, @Req() req: AppRequest) {
    const dto = parse(adminCreateSchema, body);
    return this.db.asSystem(async (tx) => {
      const email = normalizeEmail(dto.email);
      const user = await tx.user.upsert({ where: { email }, create: { email }, update: {} });
      const existing = await tx.platformAdmin.findUnique({ where: { userId: user.id } });
      if (existing) throw new AppError('CONFLICT', 'This user is already a platform admin');
      const a = await tx.platformAdmin.create({
        data: { userId: user.id, role: dto.role, createdByUserId: auth.user.id },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.admin_added',
        targetType: 'platform_admin',
        targetId: a.id,
        data: { email, role: dto.role },
      });
      return { id: a.id, email, role: a.role, status: a.status };
    });
  }

  @Patch('admins/:id')
  @AdminAccess('admins.manage')
  @ApiDoc({
    summary: 'Change an admin role or status (the last active super admin is protected)',
    tags: ['Admin'],
    body: adminUpdateSchema,
  })
  async updateAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const dto = parse(adminUpdateSchema, body);
    const res = await this.db.asSystem(async (tx) => {
      await tx.$queryRaw`SELECT id FROM platform_admins WHERE role = 'SUPER_ADMIN' FOR UPDATE`;
      const a = await tx.platformAdmin.findUnique({ where: { id } });
      if (!a) throw notFound('Admin');
      const demoting =
        a.role === 'SUPER_ADMIN' &&
        a.status === 'ACTIVE' &&
        ((dto.role && dto.role !== 'SUPER_ADMIN') || dto.status === 'DISABLED');
      if (demoting) await this.assertNotLastSuperAdmin(tx, a.id);
      const u = await tx.platformAdmin.update({
        where: { id },
        data: { role: dto.role, status: dto.status, version: { increment: 1 } },
      });
      await this.audit.platform(tx, this.actor(auth, req), {
        action: 'admin.admin_updated',
        targetType: 'platform_admin',
        targetId: id,
        data: { ...dto, previousRole: a.role, previousStatus: a.status },
      });
      return u;
    });
    if (dto.status === 'DISABLED' || dto.role)
      await this.sessions.revokeAllForUser(res.userId, 'ADMIN_ROLE_CHANGED', ['ADMIN']);
    return { id: res.id, role: res.role, status: res.status };
  }

  private async assertNotLastSuperAdmin(tx: Tx, adminId: string) {
    const others = await tx.platformAdmin.count({
      where: {
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        id: { not: adminId },
        user: { status: 'ACTIVE' },
      },
    });
    if (others === 0)
      throw new AppError('LAST_SUPER_ADMIN', 'At least one active super admin must remain');
  }
}
