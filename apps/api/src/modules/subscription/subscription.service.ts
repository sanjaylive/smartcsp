import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PlanVersion, Prisma } from '@prisma/client';
import { entitlementsSchema } from '@csp2all/shared';
import { Db, type Tx } from '../../common/db';
import { AppError, notFound } from '../../common/errors';
import { n } from '../../common/serialize';
import { JobsService } from '../../jobs/jobs.service';

export interface Actor {
  userId: string | null;
  actorType: 'ADMIN' | 'SYSTEM' | 'USER';
}

export function quote(
  v: Pick<PlanVersion, 'monthlyPricePaise' | 'annualPricePaise' | 'taxRateBps' | 'taxInclusive'>,
  cycle: 'MONTHLY' | 'ANNUAL',
) {
  const base = cycle === 'MONTHLY' ? v.monthlyPricePaise : v.annualPricePaise;
  // Tax rounded half-up to the paisa, in integer arithmetic.
  const tax = v.taxInclusive ? 0n : (base * BigInt(v.taxRateBps) + 5000n) / 10000n;
  return {
    basePaise: base,
    taxPaise: tax,
    totalPaise: base + tax,
    taxInclusive: v.taxInclusive,
    taxRateBps: v.taxRateBps,
  };
}

function addPeriod(from: Date, cycle: string) {
  const d = new Date(from);
  if (cycle === 'ANNUAL') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export function planVersionJson(v: PlanVersion & { plan?: { code: string } }) {
  return {
    id: v.id,
    planCode: v.plan?.code,
    version: v.version,
    name: v.name,
    description: v.description,
    monthlyPricePaise: n(v.monthlyPricePaise),
    annualPricePaise: n(v.annualPricePaise),
    currency: v.currency,
    taxRateBps: v.taxRateBps,
    taxInclusive: v.taxInclusive,
    trialDays: v.trialDays,
    graceDays: v.graceDays,
    entitlements: entitlementsSchema.parse(v.entitlements),
    existingSubscribers: v.existingSubscribers,
    isDemoDefault: v.isDemoDefault,
    createdAt: v.createdAt,
  };
}

/** Subscription state machine. All time-based transitions run through `runLifecycle`. */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly log = new Logger('Subscriptions');

  constructor(
    private readonly db: Db,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('subscription.lifecycle', async () => {
      const r = await this.runLifecycle(new Date());
      if (r.changed) this.log.log(`lifecycle: ${JSON.stringify(r)}`);
    });
  }

  async activePlans(tx: Tx) {
    const plans = await tx.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const versions = await tx.planVersion.findMany({
      where: { id: { in: plans.map((p) => p.currentVersionId!).filter(Boolean) } },
      include: { plan: true },
    });
    return plans.map((p) => {
      const v = versions.find((x) => x.id === p.currentVersionId)!;
      return {
        code: p.code,
        isDefault: p.isDefault,
        current: planVersionJson(v),
        quotes: { MONTHLY: this.jsonQuote(v, 'MONTHLY'), ANNUAL: this.jsonQuote(v, 'ANNUAL') },
      };
    });
  }

  private jsonQuote(v: PlanVersion, c: 'MONTHLY' | 'ANNUAL') {
    const q = quote(v, c);
    return {
      basePaise: n(q.basePaise),
      taxPaise: n(q.taxPaise),
      totalPaise: n(q.totalPaise),
      taxInclusive: q.taxInclusive,
      taxRateBps: q.taxRateBps,
    };
  }

  private async event(
    tx: Tx,
    tenantId: string,
    subscriptionId: string,
    type: string,
    actor: Actor,
    from?: string | null,
    to?: string | null,
    data?: unknown,
  ) {
    await tx.subscriptionEvent.create({
      data: {
        tenantId,
        subscriptionId,
        type,
        fromPlanVersionId: from ?? null,
        toPlanVersionId: to ?? null,
        actorUserId: actor.userId,
        actorType: actor.actorType,
        data: (data ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  private async notify(tx: Tx, tenantId: string, title: string, body: string) {
    await tx.notification.create({
      data: { tenantId, type: 'SUBSCRIPTION', title, body, link: '/app/subscription' },
    });
  }

  /** Resolves which version a subscriber should be on for (re)activation, honouring version policy. */
  private async targetVersion(tx: Tx, planId: string, currentVersionId: string | null) {
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
    const latest = await tx.planVersion.findUniqueOrThrow({
      where: { id: plan.currentVersionId! },
    });
    if (currentVersionId && latest.existingSubscribers === 'KEEP_CURRENT_VERSION') {
      const cur = await tx.planVersion.findUnique({ where: { id: currentVersionId } });
      if (cur?.planId === planId) return cur;
    }
    return latest;
  }

  /** Activates/renews a paid plan after an approved manual payment. */
  async activate(
    tx: Tx,
    tenantId: string,
    planVersionId: string,
    cycle: 'MONTHLY' | 'ANNUAL',
    actor: Actor,
    data?: unknown,
  ) {
    const sub = await tx.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw notFound('Subscription');
    const requested = await tx.planVersion.findUniqueOrThrow({ where: { id: planVersionId } });
    const current = await tx.planVersion.findUniqueOrThrow({ where: { id: sub.planVersionId } });
    const samePlan = current.planId === requested.planId;
    const target = await this.targetVersion(
      tx,
      requested.planId,
      samePlan ? sub.planVersionId : null,
    );
    const now = new Date();
    const renewing =
      samePlan &&
      ['ACTIVE', 'GRACE'].includes(sub.status) &&
      sub.currentPeriodEnd &&
      sub.billingCycle === cycle;
    const start = renewing && sub.currentPeriodEnd! > now ? sub.currentPeriodEnd! : now;
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planVersionId: target.id,
        status: 'ACTIVE',
        billingCycle: cycle,
        currentPeriodStart: renewing ? sub.currentPeriodStart : now,
        currentPeriodEnd: addPeriod(start, cycle),
        graceEndsAt: null,
        scheduledPlanVersionId: null,
        scheduledBillingCycle: null,
        scheduledChangeAt: null,
        version: { increment: 1 },
      },
    });
    await this.event(
      tx,
      tenantId,
      sub.id,
      renewing ? 'RENEWED' : 'ACTIVATED',
      actor,
      sub.planVersionId,
      target.id,
      data,
    );
    await this.notify(
      tx,
      tenantId,
      renewing ? 'Subscription renewed' : `${target.name} plan activated`,
      `Your ${target.name} plan is active until ${updated.currentPeriodEnd!.toISOString().slice(0, 10)}.`,
    );
    return updated;
  }

  /** Admin plan change: immediately, or scheduled for the end of the current period. */
  async changePlan(
    tx: Tx,
    tenantId: string,
    planCode: string,
    cycle: 'MONTHLY' | 'ANNUAL',
    effective: 'NOW' | 'PERIOD_END',
    actor: Actor,
    reason: string,
  ) {
    const sub = await tx.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw notFound('Subscription');
    const plan = await tx.plan.findUnique({ where: { code: planCode } });
    if (!plan?.currentVersionId || !plan.isActive) throw notFound('Plan');
    if (effective === 'PERIOD_END') {
      if (!sub.currentPeriodEnd)
        throw new AppError('CONFLICT', 'There is no current period end; change it now instead');
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          scheduledPlanVersionId: plan.currentVersionId,
          scheduledBillingCycle: plan.isDefault ? 'NONE' : cycle,
          scheduledChangeAt: sub.currentPeriodEnd,
          version: { increment: 1 },
        },
      });
      await this.event(
        tx,
        tenantId,
        sub.id,
        'CHANGE_SCHEDULED',
        actor,
        sub.planVersionId,
        plan.currentVersionId,
        { reason, at: sub.currentPeriodEnd },
      );
      return;
    }
    const now = new Date();
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planVersionId: plan.currentVersionId,
        status: 'ACTIVE',
        billingCycle: plan.isDefault ? 'NONE' : cycle,
        currentPeriodStart: now,
        currentPeriodEnd: plan.isDefault ? null : addPeriod(now, cycle),
        graceEndsAt: null,
        scheduledPlanVersionId: null,
        scheduledChangeAt: null,
        version: { increment: 1 },
      },
    });
    await this.event(
      tx,
      tenantId,
      sub.id,
      'PLAN_CHANGED',
      actor,
      sub.planVersionId,
      plan.currentVersionId,
      { reason },
    );
    await this.notify(
      tx,
      tenantId,
      'Plan changed',
      `Your plan was changed by CSP2All. Reason: ${reason}`,
    );
  }

  private async downgradeToDefault(
    tx: Tx,
    sub: { id: string; tenantId: string; planVersionId: string },
    actor: Actor,
    why: string,
  ) {
    const def = await tx.plan.findFirstOrThrow({ where: { isDefault: true } });
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planVersionId: def.currentVersionId!,
        status: 'ACTIVE',
        billingCycle: 'NONE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        graceEndsAt: null,
        scheduledPlanVersionId: null,
        scheduledChangeAt: null,
        version: { increment: 1 },
      },
    });
    await this.event(tx, sub.tenantId, sub.id, 'EXPIRED', actor, sub.planVersionId, null, { why });
    await this.event(
      tx,
      sub.tenantId,
      sub.id,
      'DOWNGRADED',
      actor,
      sub.planVersionId,
      def.currentVersionId,
      { why },
    );
    await this.notify(
      tx,
      sub.tenantId,
      'Your plan has ended',
      'Your shop moved to the free plan. All your records are kept; some features and limits now apply.',
    );
  }

  /**
   * Time-driven transitions (idempotent; safe to run repeatedly):
   *   TRIALING past end → downgrade · ACTIVE past end → GRACE · GRACE past grace end → downgrade ·
   *   scheduled change due → apply.
   */
  async runLifecycle(now: Date) {
    const actor: Actor = { userId: null, actorType: 'SYSTEM' };
    const counts = { grace: 0, downgraded: 0, scheduled: 0, changed: false };
    await this.db.asSystem(async (tx) => {
      const due = await tx.subscription.findMany({
        where: {
          OR: [
            { status: 'TRIALING', currentPeriodEnd: { lte: now } },
            { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
            { status: 'GRACE', graceEndsAt: { lte: now } },
            { scheduledChangeAt: { lte: now } },
          ],
        },
        take: 500,
      });
      for (const sub of due) {
        if (sub.scheduledChangeAt && sub.scheduledChangeAt <= now && sub.scheduledPlanVersionId) {
          const target = await tx.planVersion.findUniqueOrThrow({
            where: { id: sub.scheduledPlanVersionId },
            include: { plan: true },
          });
          if (target.plan.isDefault) await this.downgradeToDefault(tx, sub, actor, 'SCHEDULED');
          else {
            await tx.subscription.update({
              where: { id: sub.id },
              data: {
                planVersionId: target.id,
                billingCycle: sub.scheduledBillingCycle ?? sub.billingCycle,
                scheduledPlanVersionId: null,
                scheduledBillingCycle: null,
                scheduledChangeAt: null,
                version: { increment: 1 },
              },
            });
            await this.event(
              tx,
              sub.tenantId,
              sub.id,
              'PLAN_CHANGED',
              actor,
              sub.planVersionId,
              target.id,
              { scheduled: true },
            );
          }
          counts.scheduled++;
          continue;
        }
        if (sub.status === 'TRIALING') {
          await this.downgradeToDefault(tx, sub, actor, 'TRIAL_ENDED');
          counts.downgraded++;
        } else if (sub.status === 'ACTIVE' && sub.currentPeriodEnd) {
          const v = await tx.planVersion.findUniqueOrThrow({ where: { id: sub.planVersionId } });
          const graceEndsAt = new Date(sub.currentPeriodEnd.getTime() + v.graceDays * 86_400_000);
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'GRACE', graceEndsAt, version: { increment: 1 } },
          });
          await this.event(
            tx,
            sub.tenantId,
            sub.id,
            'GRACE_STARTED',
            actor,
            sub.planVersionId,
            sub.planVersionId,
            { graceEndsAt },
          );
          await this.notify(
            tx,
            sub.tenantId,
            'Subscription payment due',
            `Your plan period has ended. Features stay available until ${graceEndsAt.toISOString().slice(0, 10)}.`,
          );
          counts.grace++;
        } else if (sub.status === 'GRACE') {
          await this.downgradeToDefault(tx, sub, actor, 'GRACE_ENDED');
          counts.downgraded++;
        }
      }
    });
    counts.changed = counts.grace + counts.downgraded + counts.scheduled > 0;
    return counts;
  }
}
