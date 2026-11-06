import { Body, Controller, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  entitlementsSchema,
  onboardingServicesSchema,
  shopSetupSchema,
  SERVICE_CODES,
  type ServiceCode,
} from '@csp2all/shared';
import { Auth, UserAuth, type AuthState } from '../../common/access';
import { ApiDoc, parse } from '../../common/http';
import { Db } from '../../common/db';
import { AppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { LedgerService } from '../ledger/ledger.service';
import { SessionService } from '../auth/session.service';
import { MeService } from '../auth/me.service';

@Controller('v1/onboarding')
export class OnboardingController {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly me: MeService,
  ) {}

  private async defaultPlan() {
    const plan = await this.db.plan.findFirst({ where: { isDefault: true } });
    if (!plan?.currentVersionId)
      throw new AppError(
        'INTERNAL_ERROR',
        'Platform plans are not configured. Run the reference-data seed.',
      );
    const version = await this.db.planVersion.findUniqueOrThrow({
      where: { id: plan.currentVersionId },
    });
    return { plan, version, entitlements: entitlementsSchema.parse(version.entitlements) };
  }

  @Get()
  @UserAuth()
  @ApiDoc({ summary: 'Get (or start) the resumable onboarding draft', tags: ['Onboarding'] })
  async get(@Auth() auth: AuthState) {
    const draft = await this.db.onboardingDraft.upsert({
      where: { userId: auth.user.id },
      create: { userId: auth.user.id },
      update: {},
    });
    const { entitlements, version } = await this.defaultPlan();
    const catalog = await this.db.serviceDefinition.findMany({
      where: { platformEnabled: true },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      step: draft.step,
      shop: draft.shop,
      services: draft.services,
      completedTenantId: draft.completedTenantId,
      availableServices: catalog.map((c) => c.code),
      startingPlan: { name: version.name, enabledServiceLimit: entitlements.enabledServiceLimit },
    };
  }

  @Put('shop')
  @UserAuth()
  @ApiDoc({ summary: 'Save shop details (step 3)', tags: ['Onboarding'], body: shopSetupSchema })
  async saveShop(@Body() body: unknown, @Auth() auth: AuthState) {
    const shop = parse(shopSetupSchema, body);
    const existing = await this.db.onboardingDraft.findUnique({ where: { userId: auth.user.id } });
    if (existing?.completedTenantId) {
      throw new AppError('CONFLICT', 'Onboarding is already complete. Start a new shop first.', {
        next: 'POST /v1/onboarding/new-shop',
      });
    }
    const draft = await this.db.onboardingDraft.upsert({
      where: { userId: auth.user.id },
      create: { userId: auth.user.id, shop, step: 'SERVICES' },
      update: { shop, step: 'SERVICES' },
    });
    return { step: draft.step, shop: draft.shop, services: draft.services };
  }

  /**
   * Starts onboarding for an additional shop. The completed draft is replaced by a new one (new id ⇒
   * new provisioning key), so retries of the new shop's completion stay idempotent and never touch
   * the existing shop.
   */
  @Post('new-shop')
  @HttpCode(200)
  @UserAuth()
  @ApiDoc({
    summary: 'Start onboarding an additional shop (the current shop is unaffected)',
    tags: ['Onboarding'],
  })
  async newShop(@Auth() auth: AuthState) {
    const existing = await this.db.onboardingDraft.findUnique({ where: { userId: auth.user.id } });
    if (existing && !existing.completedTenantId)
      return { step: existing.step, shop: existing.shop, services: existing.services };
    if (existing) await this.db.onboardingDraft.delete({ where: { id: existing.id } });
    const draft = await this.db.onboardingDraft.create({ data: { userId: auth.user.id } });
    return { step: draft.step, shop: draft.shop, services: draft.services };
  }

  @Put('services')
  @UserAuth()
  @ApiDoc({
    summary: 'Save selected services (step 4)',
    tags: ['Onboarding'],
    body: onboardingServicesSchema,
  })
  async saveServices(@Body() body: unknown, @Auth() auth: AuthState) {
    const { services } = parse(onboardingServicesSchema, body);
    const unique = [...new Set(services)];
    const { entitlements, version } = await this.defaultPlan();
    const platform = await this.db.serviceDefinition.findMany({
      where: { code: { in: unique }, platformEnabled: true },
    });
    if (platform.length !== unique.length)
      throw new AppError('SERVICE_NOT_AVAILABLE', 'One or more services are not available');
    if (
      entitlements.enabledServiceLimit !== null &&
      unique.length > entitlements.enabledServiceLimit
    ) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        `The ${version.name} plan allows up to ${entitlements.enabledServiceLimit} services. You can upgrade later.`,
        { metric: 'SERVICES', limit: entitlements.enabledServiceLimit },
        { services: [`Select up to ${entitlements.enabledServiceLimit}`] },
      );
    }
    const draft = await this.db.onboardingDraft
      .update({ where: { userId: auth.user.id }, data: { services: unique } })
      .catch(() => {
        throw new AppError('CONFLICT', 'Save shop details first');
      });
    return { step: draft.step, shop: draft.shop, services: draft.services };
  }

  /**
   * Creates tenant, primary branch, owner membership, subscription, selected services and the chart
   * of accounts in ONE transaction. Retries are safe: the draft id is the provisioning key.
   */
  @Post('complete')
  @HttpCode(200)
  @UserAuth()
  @ApiDoc({ summary: 'Create the shop (step 5) — idempotent', tags: ['Onboarding'] })
  async complete(@Auth() auth: AuthState, @Res({ passthrough: true }) res: Response) {
    const draft = await this.db.onboardingDraft.findUnique({ where: { userId: auth.user.id } });
    if (!draft?.shop) throw new AppError('CONFLICT', 'Save shop details first', { step: 'SHOP' });
    if (draft.services.length === 0)
      throw new AppError('CONFLICT', 'Select at least one service', { step: 'SERVICES' });
    const shop = parse(shopSetupSchema, draft.shop);
    const provisioningKey = `onboarding:${draft.id}`;

    let tenantId =
      draft.completedTenantId ?? (await this.findProvisioned(auth.user.id, provisioningKey));
    if (!tenantId) {
      const { plan, version, entitlements } = await this.defaultPlan();
      const signups = await this.db.platformSetting.findUnique({
        where: { key: 'signupsEnabled' },
      });
      if (signups?.value === false) {
        throw new AppError(
          'FORBIDDEN',
          'New shop registration is paused. Please try again later or contact CSP2All support.',
        );
      }
      const services = draft.services.filter((s): s is ServiceCode =>
        (SERVICE_CODES as readonly string[]).includes(s),
      );
      if (
        entitlements.enabledServiceLimit !== null &&
        services.length > entitlements.enabledServiceLimit
      ) {
        throw new AppError('QUOTA_EXCEEDED', 'Too many services for the starting plan', {
          metric: 'SERVICES',
        });
      }
      const newId = randomUUID();
      try {
        await this.db.inTenant({ tenantId: newId, userId: auth.user.id }, async (tx) => {
          await tx.tenant.create({
            data: {
              id: newId,
              name: shop.shopName,
              ownerDisplayName: shop.ownerName,
              contactPhone: shop.contactPhone ?? null,
              state: shop.state,
              district: shop.district,
              address: shop.address ?? null,
              locale: shop.preferredLanguage,
              timezone: shop.timezone,
              provisioningKey,
              createdByUserId: auth.user.id,
            },
          });
          await tx.branch.create({
            data: { tenantId: newId, name: shop.shopName, isPrimary: true },
          });
          await tx.membership.create({
            data: {
              tenantId: newId,
              userId: auth.user.id,
              role: 'OWNER',
              status: 'ACTIVE',
              displayName: shop.ownerName,
            },
          });
          await tx.tenantService.createMany({
            data: services.map((code) => ({ tenantId: newId, serviceCode: code, enabled: true })),
          });
          const trialing = version.trialDays > 0;
          const sub = await tx.subscription.create({
            data: {
              tenantId: newId,
              planVersionId: version.id,
              status: trialing ? 'TRIALING' : 'ACTIVE',
              billingCycle: 'NONE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialing
                ? new Date(Date.now() + version.trialDays * 86_400_000)
                : null,
            },
          });
          await tx.subscriptionEvent.create({
            data: {
              tenantId: newId,
              subscriptionId: sub.id,
              type: 'CREATED',
              toPlanVersionId: version.id,
              actorUserId: auth.user.id,
              actorType: 'USER',
              data: { plan: plan.code },
            },
          });
          await this.ledger.ensureAccounts(tx, newId);
          await this.audit.tenant(
            tx,
            {
              tenantId: newId,
              userId: auth.user.id,
              actorType: 'USER',
              membershipId: null,
              role: 'OWNER',
              permissions: new Set(),
              timezone: shop.timezone,
            },
            {
              action: 'tenant.provisioned',
              targetType: 'tenant',
              targetId: newId,
              data: { services },
            },
          );
        });
        tenantId = newId;
      } catch (e) {
        // A concurrent retry won the race: return the tenant it created.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          tenantId = await this.findProvisioned(auth.user.id, provisioningKey);
          if (!tenantId) throw e;
        } else throw e;
      }
    }

    await this.db.onboardingDraft.update({
      where: { id: draft.id },
      data: { step: 'DONE', completedTenantId: tenantId },
    });
    await this.db.user.update({
      where: { id: auth.user.id },
      data: {
        displayName: auth.user.displayName ?? shop.ownerName,
        locale: shop.preferredLanguage,
      },
    });
    await this.db.session.update({
      where: { id: auth.session.id },
      data: { activeTenantId: tenantId },
    });
    if (auth.via === 'cookie') {
      const token = await this.sessions.rotate(auth.session);
      this.sessions.setSessionCookie(res, 'WEB', token);
    }
    return { tenantId, ...(await this.me.get(auth.user.id, tenantId)) };
  }

  private async findProvisioned(userId: string, provisioningKey: string): Promise<string | null> {
    return this.db.asUser(
      userId,
      async (tx) =>
        (await tx.tenant.findUnique({ where: { provisioningKey }, select: { id: true } }))?.id ??
        null,
    );
  }
}
