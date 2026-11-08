import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  customFieldsSchema,
  customServiceCreateSchema,
  customServiceUpdateSchema,
  SERVICE_CODES,
  SERVICE_REGISTRY,
  serviceToggleSchema,
  shopProfileUpdateSchema,
  type Permission,
  type ServiceCode,
} from '@csp2all/shared';
import { Ctx, TenantAccess, TenantAccessAllowSuspended } from '../../common/access';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound, versionConflict, zodToAppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { n } from '../../common/serialize';
import { ServiceAvailabilityService } from '../services/service-availability.service';
import { EntitlementsService } from '../subscription/entitlements.service';

/** Sections of the portal and the permission each requires. Clients render only what is returned. */
const NAV: { key: string; path: string; permission: Permission | null }[] = [
  { key: 'dashboard', path: '/app', permission: null },
  { key: 'records', path: '/app/records', permission: 'records.view' },
  { key: 'customers', path: '/app/customers', permission: 'customers.view' },
  { key: 'followUps', path: '/app/follow-ups', permission: 'followups.view' },
  { key: 'dues', path: '/app/dues', permission: 'dues.view' },
  { key: 'cashbook', path: '/app/cashbook', permission: 'cashbook.view' },
  { key: 'expenses', path: '/app/expenses', permission: 'expenses.view' },
  { key: 'commissions', path: '/app/commissions', permission: 'commissions.view' },
  { key: 'closing', path: '/app/closing', permission: 'cashbook.view' },
  { key: 'reports', path: '/app/reports', permission: 'reports.operational' },
  { key: 'staff', path: '/app/staff', permission: 'staff.view' },
  { key: 'subscription', path: '/app/subscription', permission: 'subscription.view' },
  { key: 'shop', path: '/app/settings/shop', permission: 'settings.manage' },
  { key: 'services', path: '/app/settings/services', permission: 'services.manage' },
  { key: 'masters', path: '/app/settings/masters', permission: 'settings.manage' },
  { key: 'integrations', path: '/app/integrations', permission: 'integrations.view' },
  { key: 'notifications', path: '/app/notifications', permission: null },
  { key: 'security', path: '/app/security', permission: null },
  { key: 'audit', path: '/app/audit', permission: 'audit.view' },
];

export function tenantJson(t: Prisma.TenantGetPayload<object>) {
  return {
    id: t.id,
    name: t.name,
    ownerDisplayName: t.ownerDisplayName,
    status: t.status,
    statusReason: t.statusReason,
    contactPhone: t.contactPhone,
    contactPhoneVerified: t.contactPhoneVerified,
    state: t.state,
    district: t.district,
    address: t.address,
    preferredLanguage: t.locale,
    timezone: t.timezone,
    brandColor: t.brandColor,
    receiptFooter: t.receiptFooter,
    logoAttachmentId: t.logoAttachmentId,
    createdAt: t.createdAt,
    version: t.version,
  };
}

@Controller('v1')
export class TenantController {
  constructor(
    private readonly db: Db,
    private readonly availability: ServiceAvailabilityService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  @Get('tenant/context')
  @TenantAccessAllowSuspended()
  @ApiDoc({
    summary:
      'Everything a client needs to render the shop: permissions, services, navigation, plan and usage',
    tags: ['Tenant'],
  })
  context(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const services = await this.availability.list(tx, ctx);
      const eff = await this.entitlements.effective(tx, ctx.tenantId);
      const usage = await this.entitlements.usage(tx, ctx.tenantId, ctx.timezone);
      const custom = await tx.customServiceDefinition.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { name: 'asc' },
      });
      const support = await tx.supportAccessSession.findMany({
        where: { tenantId: ctx.tenantId, endedAt: null, expiresAt: { gt: new Date() } },
      });
      const announcements = await tx.announcement.findMany({
        where: {
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        orderBy: { startsAt: 'desc' },
        take: 3,
      });
      const unread = await tx.notification.count({
        where: {
          tenantId: ctx.tenantId,
          readAt: null,
          OR: [{ userId: null }, { userId: ctx.userId }],
        },
      });
      const visibleServices = services.filter((s) => s.selected || s.hasHistory);
      return {
        tenant: tenantJson(tenant),
        membership: { role: ctx.role, permissions: [...ctx.permissions].sort() },
        services,
        customServices: custom.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          workflowType: c.workflowType,
          principalDirection: c.principalDirection,
          defaultFeePaise: n(c.defaultFeePaise),
          fields: c.fields,
          active: c.active,
          version: c.version,
        })),
        navigation: NAV.filter((i) => !i.permission || ctx.permissions.has(i.permission)).map(
          ({ key, path }) => ({ key, path }),
        ),
        serviceNavigation: visibleServices.map((s) => ({
          code: s.code,
          path: `/app/records?service=${s.code}`,
          canCreate: s.canCreate,
          reason: s.reason,
        })),
        quickActions: services
          .filter((s) => s.canCreate)
          .map((s) => ({ code: s.code, path: `/app/records/new?service=${s.code}` })),
        dashboardWidgets: [
          ...new Set(
            services
              .filter((s) => s.selected)
              .flatMap((s) => SERVICE_REGISTRY[s.code].dashboardWidgets),
          ),
        ],
        plan: {
          code: eff.planCode,
          name: eff.planName,
          status: eff.subscriptionStatus,
          fallback: eff.fallback,
          entitlements: eff.entitlements,
        },
        usage,
        supportAccessActive: support.map((s) => ({
          id: s.id,
          reason: s.reason,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
        })),
        announcements: announcements.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          severity: a.severity,
        })),
        unreadNotifications: unread,
      };
    });
  }

  @Get('tenant/profile')
  @TenantAccessAllowSuspended()
  @ApiDoc({ summary: 'Shop profile', tags: ['Tenant'] })
  profile(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) =>
      tenantJson(await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } })),
    );
  }

  @Patch('tenant/profile')
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Update shop profile and branding',
    tags: ['Tenant'],
    body: shopProfileUpdateSchema,
  })
  updateProfile(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(shopProfileUpdateSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      if (dto.brandColor !== undefined || dto.receiptFooter !== undefined)
        await this.entitlements.assertBoolean(tx, ctx.tenantId, 'customBranding');
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const phoneChanged =
        dto.contactPhone !== undefined && dto.contactPhone !== current.contactPhone;
      const res = await tx.tenant.updateMany({
        where: { id: ctx.tenantId, version: dto.version },
        data: {
          name: dto.shopName,
          contactPhone: dto.contactPhone,
          contactPhoneVerified: phoneChanged ? false : undefined,
          state: dto.state,
          district: dto.district,
          address: dto.address,
          locale: dto.preferredLanguage,
          timezone: dto.timezone,
          brandColor: dto.brandColor,
          receiptFooter: dto.receiptFooter,
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw versionConflict();
      await this.audit.tenant(tx, ctx, {
        action: 'tenant.profile_updated',
        targetType: 'tenant',
        targetId: ctx.tenantId,
        data: { fields: Object.keys(dto) },
      });
      return tenantJson(await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }));
    });
  }

  @Get('services')
  @TenantAccessAllowSuspended()
  @ApiDoc({
    summary: 'Service availability with reasons (platform, plan, tenant, permission, connector)',
    tags: ['Services'],
  })
  services(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({ items: await this.availability.list(tx, ctx) }));
  }

  @Put('services/:code')
  @TenantAccess('services.manage')
  @ApiDoc({
    summary: 'Turn a service on or off. History is always preserved.',
    tags: ['Services'],
    body: serviceToggleSchema,
  })
  toggle(@Ctx() ctx: TenantCtx, @Param('code') code: string, @Body() body: unknown) {
    if (!(SERVICE_CODES as readonly string[]).includes(code)) throw notFound('Service');
    const { enabled } = parse(serviceToggleSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      const existing = await tx.tenantService.findUnique({
        where: { tenantId_serviceCode: { tenantId: ctx.tenantId, serviceCode: code } },
      });
      if (enabled && !existing?.enabled) {
        const def = await tx.serviceDefinition.findUnique({ where: { code } });
        if (!def?.platformEnabled)
          throw new AppError(
            'SERVICE_NOT_AVAILABLE',
            'This service is not available on the platform',
            { reason: 'PLATFORM' },
          );
        await this.entitlements.assertServiceCapacity(tx, ctx.tenantId);
        await tx.tenantService.upsert({
          where: { tenantId_serviceCode: { tenantId: ctx.tenantId, serviceCode: code } },
          create: { tenantId: ctx.tenantId, serviceCode: code, enabled: true },
          update: { enabled: true, enabledAt: new Date(), disabledAt: null, disabledReason: null },
        });
      } else if (!enabled && existing?.enabled) {
        await tx.tenantService.update({
          where: { tenantId_serviceCode: { tenantId: ctx.tenantId, serviceCode: code } },
          data: { enabled: false, disabledAt: new Date(), disabledReason: 'TENANT' },
        });
      }
      await this.audit.tenant(tx, ctx, {
        action: enabled ? 'service.enabled' : 'service.disabled',
        targetType: 'service',
        targetId: code,
      });
      return { items: await this.availability.list(tx, ctx) };
    });
  }

  @Get('custom-services')
  @TenantAccess('records.view')
  @ApiDoc({ summary: 'Custom service definitions', tags: ['Services'] })
  customServices(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      items: (
        await tx.customServiceDefinition.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { name: 'asc' },
        })
      ).map((c) => ({ ...c, defaultFeePaise: n(c.defaultFeePaise) })),
    }));
  }

  private validFields(raw: unknown[]) {
    const r = customFieldsSchema.safeParse(raw);
    if (!r.success) {
      const e = zodToAppError(r.error);
      throw new AppError(
        e.code,
        e.message,
        undefined,
        Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [`fields.${k}`, v])),
      );
    }
    return r.data;
  }

  @Post('custom-services')
  @TenantAccess('services.manage')
  @ApiDoc({
    summary: 'Define a custom service with up to 8 validated fields',
    tags: ['Services'],
    body: customServiceCreateSchema,
  })
  createCustom(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(customServiceCreateSchema, body);
    const fields = this.validFields(dto.fields);
    return this.db.inTenant(ctx, async (tx) => {
      await this.entitlements.assertCustomServiceCapacity(tx, ctx.tenantId);
      await this.ensureCustomEnabled(tx, ctx);
      const c = await tx.customServiceDefinition.create({
        data: {
          tenantId: ctx.tenantId,
          name: dto.name,
          category: dto.category,
          workflowType: dto.workflowType,
          principalDirection: dto.principalDirection,
          defaultFeePaise: BigInt(dto.defaultFeePaise),
          fields,
          createdByUserId: ctx.userId,
        },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'custom_service.created',
        targetType: 'custom_service',
        targetId: c.id,
      });
      return { ...c, defaultFeePaise: n(c.defaultFeePaise) };
    });
  }

  @Patch('custom-services/:id')
  @TenantAccess('services.manage')
  @ApiDoc({
    summary: 'Update or deactivate a custom service',
    tags: ['Services'],
    body: customServiceUpdateSchema,
  })
  updateCustom(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = parse(customServiceUpdateSchema, body);
    const fields = dto.fields ? this.validFields(dto.fields) : undefined;
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.customServiceDefinition.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });
      if (!c) throw notFound('Custom service');
      if (dto.active === true && !c.active)
        await this.entitlements.assertCustomServiceCapacity(tx, ctx.tenantId);
      const res = await tx.customServiceDefinition.updateMany({
        where: { id, tenantId: ctx.tenantId, version: dto.version },
        data: {
          name: dto.name,
          category: dto.category,
          workflowType: dto.workflowType,
          principalDirection: dto.principalDirection,
          defaultFeePaise:
            dto.defaultFeePaise !== undefined ? BigInt(dto.defaultFeePaise) : undefined,
          fields,
          active: dto.active,
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw versionConflict();
      await this.audit.tenant(tx, ctx, {
        action: 'custom_service.updated',
        targetType: 'custom_service',
        targetId: id,
        data: { fields: Object.keys(dto) },
      });
      const u = await tx.customServiceDefinition.findUniqueOrThrow({ where: { id } });
      return { ...u, defaultFeePaise: n(u.defaultFeePaise) };
    });
  }

  private async ensureCustomEnabled(tx: Tx, ctx: TenantCtx) {
    const ts = await tx.tenantService.findUnique({
      where: {
        tenantId_serviceCode: {
          tenantId: ctx.tenantId,
          serviceCode: 'CUSTOM' satisfies ServiceCode,
        },
      },
    });
    if (!ts?.enabled)
      throw new AppError('SERVICE_NOT_AVAILABLE', 'Turn on Custom Services first', {
        reason: 'TENANT',
      });
  }
}
