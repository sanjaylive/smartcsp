import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { paymentSubmissionSchema } from '@csp2all/shared';
import { Ctx, TenantAccessAllowSuspended, type AppRequest } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { IdempotencyService, readIdempotencyKey } from '../../common/idempotency';
import { d, n, toDate } from '../../common/serialize';
import { EntitlementsService } from './entitlements.service';
import { planVersionJson, quote, SubscriptionService } from './subscription.service';

@Controller('v1')
export class SubscriptionController {
  constructor(
    private readonly db: Db,
    private readonly subs: SubscriptionService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly idem: IdempotencyService,
  ) {}

  @Get('plans')
  @TenantAccessAllowSuspended()
  @ApiDoc({
    summary: 'Available plans with prices and entitlements (admin-configured)',
    tags: ['Subscription'],
  })
  plans(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({ items: await this.subs.activePlans(tx) }));
  }

  @Get('subscription')
  @TenantAccessAllowSuspended('subscription.view')
  @ApiDoc({
    summary: 'Current subscription, entitlements, usage and history',
    tags: ['Subscription'],
  })
  current(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
      if (!sub) throw notFound('Subscription');
      const version = await tx.planVersion.findUniqueOrThrow({
        where: { id: sub.planVersionId },
        include: { plan: true },
      });
      const scheduled = sub.scheduledPlanVersionId
        ? await tx.planVersion.findUnique({
            where: { id: sub.scheduledPlanVersionId },
            include: { plan: true },
          })
        : null;
      const eff = await this.entitlements.effective(tx, ctx.tenantId);
      const usage = await this.entitlements.usage(tx, ctx.tenantId, ctx.timezone);
      const events = await tx.subscriptionEvent.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      const submissions = await tx.paymentSubmission.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return {
        subscription: {
          status: sub.status,
          billingCycle: sub.billingCycle,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          graceEndsAt: sub.graceEndsAt,
          scheduledChange: scheduled
            ? { planCode: scheduled.plan.code, name: scheduled.name, at: sub.scheduledChangeAt }
            : null,
        },
        plan: planVersionJson(version),
        effective: {
          planCode: eff.planCode,
          entitlements: eff.entitlements,
          overrides: eff.overrides,
          fallback: eff.fallback,
        },
        usage,
        historyPolicy:
          'All records stay readable after a downgrade. Plan limits only restrict new activity; exports need a plan that includes them.',
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          data: e.data,
          actorType: e.actorType,
          createdAt: e.createdAt,
        })),
        paymentSubmissions: submissions.map((s) => this.submissionJson(s)),
      };
    });
  }

  private submissionJson(s: {
    id: string;
    billingCycle: string;
    method: string;
    payerReference: string;
    paidOn: Date;
    amountPaise: bigint;
    expectedPaise: bigint;
    status: string;
    reviewNotes: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    planVersionId: string;
  }) {
    return {
      id: s.id,
      planVersionId: s.planVersionId,
      billingCycle: s.billingCycle,
      method: s.method,
      payerReference: s.payerReference,
      paidOn: d(s.paidOn),
      amountPaise: n(s.amountPaise),
      expectedPaise: n(s.expectedPaise),
      status: s.status,
      reviewNotes: s.reviewNotes,
      createdAt: s.createdAt,
      reviewedAt: s.reviewedAt,
    };
  }

  @Post('subscription/payment-submissions')
  @TenantAccessAllowSuspended('subscription.manage')
  @ApiDoc({
    summary: 'Submit details of a manual payment for a paid plan (reviewed by CSP2All admins)',
    tags: ['Subscription'],
    body: paymentSubmissionSchema,
    idempotent: true,
  })
  submit(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(paymentSubmissionSchema, body);
    return this.idem.run(
      `tenant:${ctx.tenantId}:user:${ctx.userId}`,
      readIdempotencyKey(req.headers),
      'POST /v1/subscription/payment-submissions',
      body,
      () =>
        this.db.inTenant(ctx, async (tx) => {
          const plan = await tx.plan.findUnique({ where: { code: dto.planCode } });
          if (!plan?.isActive || !plan.currentVersionId || plan.isDefault)
            throw new AppError('VALIDATION_FAILED', 'Choose a paid plan', undefined, {
              planCode: ['Not a paid plan'],
            });
          const pending = await tx.paymentSubmission.count({
            where: { tenantId: ctx.tenantId, status: 'SUBMITTED' },
          });
          if (pending >= 3)
            throw new AppError(
              'CONFLICT',
              'You already have payment submissions waiting for review',
            );
          const version = await tx.planVersion.findUniqueOrThrow({
            where: { id: plan.currentVersionId },
          });
          const q = quote(version, dto.billingCycle);
          const s = await tx.paymentSubmission.create({
            data: {
              tenantId: ctx.tenantId,
              planVersionId: version.id,
              billingCycle: dto.billingCycle,
              method: dto.method,
              payerReference: dto.payerReference,
              paidOn: toDate(dto.paidOn),
              amountPaise: BigInt(dto.amountPaise),
              expectedPaise: q.totalPaise,
              notes: dto.notes ?? null,
              submittedByUserId: ctx.userId,
            },
          });
          await this.audit.tenant(tx, ctx, {
            action: 'subscription.payment_submitted',
            targetType: 'payment_submission',
            targetId: s.id,
            data: {
              plan: dto.planCode,
              cycle: dto.billingCycle,
              amountPaise: dto.amountPaise,
              expectedPaise: q.totalPaise,
            },
          });
          return {
            ...this.submissionJson(s),
            amountMatchesQuote: BigInt(dto.amountPaise) === q.totalPaise,
          };
        }),
    );
  }
}
