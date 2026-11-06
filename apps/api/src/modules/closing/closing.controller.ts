import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { DailyClosing, Prisma } from '@prisma/client';
import { closingCreateSchema, isIsoDate, localDate, reopenRequestSchema } from '@csp2all/shared';
import { Ctx, requirePerm, TenantAccess, type AppRequest } from '../../common/access';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { IdempotencyService, readIdempotencyKey } from '../../common/idempotency';
import { big, d, n, toDate } from '../../common/serialize';
import { LedgerService } from '../ledger/ledger.service';

function closingJson(c: DailyClosing) {
  return {
    id: c.id,
    businessDate: d(c.businessDate),
    status: c.status,
    openingCashPaise: n(c.openingCashPaise),
    cashInPaise: n(c.cashInPaise),
    cashOutPaise: n(c.cashOutPaise),
    expectedCashPaise: n(c.expectedCashPaise),
    countedCashPaise: n(c.countedCashPaise),
    variancePaise: n(c.variancePaise),
    notes: c.notes,
    summary: c.summary,
    closedByUserId: c.closedByUserId,
    closedAt: c.closedAt,
    reopenRequestedBy: c.reopenRequestedBy,
    reopenReason: c.reopenReason,
    reopenApprovedBy: c.reopenApprovedBy,
    reopenedAt: c.reopenedAt,
    closeCount: c.closeCount,
    version: c.version,
  };
}

@Controller('v1/closings')
export class ClosingController {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly idem: IdempotencyService,
  ) {}

  private assertDate(date: string) {
    if (!isIsoDate(date))
      throw new AppError('VALIDATION_FAILED', 'Use YYYY-MM-DD', undefined, {
        date: ['Invalid date'],
      });
  }

  /** Expected cash = opening cash (all days before) + cash in − cash out on the date. */
  private async compute(tx: Tx, ctx: TenantCtx, date: string) {
    const opening = await this.ledger.balanceOf(tx, ctx.tenantId, 'CASH', { before: date });
    const mv = await this.ledger.movements(tx, ctx.tenantId, date, date);
    const cashIn = mv.CASH?.debit ?? 0n;
    const cashOut = mv.CASH?.credit ?? 0n;
    const net = (k: 'FEE_INCOME' | 'COMMISSION_INCOME') =>
      (mv[k]?.credit ?? 0n) - (mv[k]?.debit ?? 0n);
    const records = await tx.serviceRecord.groupBy({
      by: ['postingStatus'],
      where: { tenantId: ctx.tenantId, txnDate: toDate(date), opStatus: { not: 'DRAFT' } },
      _count: { _all: true },
    });
    const count = (s: string) => records.find((r) => r.postingStatus === s)?._count._all ?? 0;
    return {
      openingCash: opening,
      cashIn,
      cashOut,
      expectedCash: opening + cashIn - cashOut,
      summary: {
        recordsTotal: records.reduce((a, r) => a + r._count._all, 0),
        recordsUnposted: count('UNPOSTED'),
        feeIncomePaise: n(net('FEE_INCOME')),
        commissionAccruedPaise: n(net('COMMISSION_INCOME')),
        expensesPaise: n((mv.EXPENSES?.debit ?? 0n) - (mv.EXPENSES?.credit ?? 0n)),
        bankNetPaise: n((mv.BANK?.debit ?? 0n) - (mv.BANK?.credit ?? 0n)),
        walletNetPaise: n((mv.FLOAT?.debit ?? 0n) - (mv.FLOAT?.credit ?? 0n)),
        duesCollectedPaise: n(mv.RECEIVABLE?.credit ?? 0n),
      },
    };
  }

  @Get()
  @TenantAccess('cashbook.view')
  @ApiDoc({ summary: 'Recent daily closings', tags: ['Daily closing'] })
  list(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      items: (
        await tx.dailyClosing.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { businessDate: 'desc' },
          take: 60,
        })
      ).map(closingJson),
    }));
  }

  @Get(':date/preview')
  @TenantAccess('cashbook.view')
  @ApiDoc({ summary: 'Expected cash and day summary before closing', tags: ['Daily closing'] })
  preview(@Ctx() ctx: TenantCtx, @Param('date') date: string) {
    this.assertDate(date);
    return this.db.inTenant(ctx, async (tx) => {
      const c = await this.compute(tx, ctx, date);
      const existing = await tx.dailyClosing.findUnique({
        where: { tenantId_businessDate: { tenantId: ctx.tenantId, businessDate: toDate(date) } },
      });
      return {
        businessDate: date,
        status: existing?.status ?? 'OPEN',
        openingCashPaise: n(c.openingCash),
        cashInPaise: n(c.cashIn),
        cashOutPaise: n(c.cashOut),
        expectedCashPaise: n(c.expectedCash),
        summary: c.summary,
        closing: existing ? closingJson(existing) : null,
      };
    });
  }

  @Post()
  @TenantAccess('day.close')
  @ApiDoc({
    summary: 'Close a business day with a cash count (variance is posted to Cash over/short)',
    tags: ['Daily closing'],
    body: closingCreateSchema,
    idempotent: true,
  })
  close(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(closingCreateSchema, body);
    return this.idem.run(
      `tenant:${ctx.tenantId}:user:${ctx.userId}`,
      readIdempotencyKey(req.headers),
      'POST /v1/closings',
      body,
      () =>
        this.db.inTenant(ctx, async (tx) => {
          if (dto.businessDate > localDate(new Date(), ctx.timezone))
            throw new AppError('VALIDATION_FAILED', 'A future day cannot be closed', undefined, {
              businessDate: ['Future date'],
            });
          await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId}::uuid FOR UPDATE`;
          const existing = await tx.dailyClosing.findUnique({
            where: {
              tenantId_businessDate: {
                tenantId: ctx.tenantId,
                businessDate: toDate(dto.businessDate),
              },
            },
          });
          if (existing && existing.status !== 'REOPENED')
            throw new AppError('DAY_CLOSED', 'This day is already closed');
          const c = await this.compute(tx, ctx, dto.businessDate);
          const counted = big(dto.countedCashPaise);
          const variance = counted - c.expectedCash;
          const closeCount = (existing?.closeCount ?? 0) + 1;
          const closingId = existing?.id ?? randomUUID();
          let varianceEntryId: string | null = null;
          if (variance !== 0n) {
            const amt = variance > 0n ? variance : -variance;
            const entry = await this.ledger.post(tx, ctx, {
              businessDate: dto.businessDate,
              type: 'CLOSING_VARIANCE',
              sourceType: 'daily_closing',
              sourceId: closingId,
              postingKey: `closing:${dto.businessDate}:${closeCount}`,
              description: `Cash ${variance > 0n ? 'over' : 'short'} at day close ${dto.businessDate}`,
              lines:
                variance > 0n
                  ? [
                      { account: 'CASH', debit: amt, memo: 'Cash over' },
                      { account: 'CASH_OVER_SHORT', credit: amt, memo: 'Cash over' },
                    ]
                  : [
                      { account: 'CASH_OVER_SHORT', debit: amt, memo: 'Cash short' },
                      { account: 'CASH', credit: amt, memo: 'Cash short' },
                    ],
            });
            varianceEntryId = entry!.id;
          }
          const data = {
            status: 'CLOSED',
            openingCashPaise: c.openingCash,
            cashInPaise: c.cashIn,
            cashOutPaise: c.cashOut,
            expectedCashPaise: c.expectedCash,
            countedCashPaise: counted,
            variancePaise: variance,
            varianceEntryId,
            notes: dto.notes ?? null,
            summary: c.summary as Prisma.InputJsonValue,
            closedByUserId: ctx.userId,
            closedAt: new Date(),
            closeCount,
          };
          const closing = existing
            ? await tx.dailyClosing.update({
                where: { id: existing.id },
                data: { ...data, version: { increment: 1 } },
              })
            : await tx.dailyClosing.create({
                data: {
                  ...data,
                  id: closingId,
                  tenantId: ctx.tenantId,
                  businessDate: toDate(dto.businessDate),
                },
              });
          await this.audit.tenant(tx, ctx, {
            action: 'day.closed',
            targetType: 'daily_closing',
            targetId: closing.id,
            data: { businessDate: dto.businessDate, variancePaise: variance, closeCount },
          });
          return closingJson(closing);
        }),
    );
  }

  @Post(':date/reopen-request')
  @HttpCode(200)
  @TenantAccess('day.close')
  @ApiDoc({
    summary: 'Request reopening a closed day (owners with day.reopen reopen immediately)',
    tags: ['Daily closing'],
    body: reopenRequestSchema,
  })
  requestReopen(@Ctx() ctx: TenantCtx, @Param('date') date: string, @Body() body: unknown) {
    this.assertDate(date);
    const { reason } = parse(reopenRequestSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.dailyClosing.findUnique({
        where: { tenantId_businessDate: { tenantId: ctx.tenantId, businessDate: toDate(date) } },
      });
      if (!c || c.status !== 'CLOSED')
        throw new AppError('DAY_NOT_CLOSED', 'This day is not closed');
      const requested = await tx.dailyClosing.update({
        where: { id: c.id },
        data: {
          status: 'REOPEN_REQUESTED',
          reopenRequestedBy: ctx.userId,
          reopenRequestedAt: new Date(),
          reopenReason: reason,
          version: { increment: 1 },
        },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'day.reopen_requested',
        targetType: 'daily_closing',
        targetId: c.id,
        data: { date, reason },
      });
      if (ctx.permissions.has('day.reopen'))
        return closingJson(await this.reopen(tx, ctx, requested, date));
      await tx.notification.create({
        data: {
          tenantId: ctx.tenantId,
          type: 'REOPEN_REQUESTED',
          title: `Reopen requested for ${date}`,
          body: reason,
          link: `/app/closing?date=${date}`,
        },
      });
      return closingJson(requested);
    });
  }

  @Post(':date/reopen-approve')
  @HttpCode(200)
  @TenantAccess('day.reopen')
  @ApiDoc({
    summary: 'Approve a reopen request; the close variance entry is reversed',
    tags: ['Daily closing'],
  })
  approveReopen(@Ctx() ctx: TenantCtx, @Param('date') date: string) {
    this.assertDate(date);
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.dailyClosing.findUnique({
        where: { tenantId_businessDate: { tenantId: ctx.tenantId, businessDate: toDate(date) } },
      });
      if (!c || c.status !== 'REOPEN_REQUESTED')
        throw new AppError('CONFLICT', 'No pending reopen request for this day');
      return closingJson(await this.reopen(tx, ctx, c, date));
    });
  }

  @Post(':date/reopen-reject')
  @HttpCode(200)
  @TenantAccess('day.reopen')
  @ApiDoc({ summary: 'Reject a reopen request', tags: ['Daily closing'] })
  rejectReopen(@Ctx() ctx: TenantCtx, @Param('date') date: string) {
    this.assertDate(date);
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.dailyClosing.findUnique({
        where: { tenantId_businessDate: { tenantId: ctx.tenantId, businessDate: toDate(date) } },
      });
      if (!c || c.status !== 'REOPEN_REQUESTED')
        throw new AppError('CONFLICT', 'No pending reopen request for this day');
      const u = await tx.dailyClosing.update({
        where: { id: c.id },
        data: { status: 'CLOSED', version: { increment: 1 } },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'day.reopen_rejected',
        targetType: 'daily_closing',
        targetId: c.id,
        data: { date },
      });
      return closingJson(u);
    });
  }

  private async reopen(tx: Tx, ctx: TenantCtx, c: DailyClosing, date: string) {
    requirePerm(ctx, 'day.reopen');
    const u = await tx.dailyClosing.update({
      where: { id: c.id },
      data: {
        status: 'REOPENED',
        reopenApprovedBy: ctx.userId,
        reopenedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (c.varianceEntryId) {
      await this.ledger.reverse(tx, ctx, c.varianceEntryId, {
        type: 'CLOSING_VARIANCE_REVERSAL',
        businessDate: date,
        description: `Day ${date} reopened: close variance reversed`,
      });
    }
    await this.audit.tenant(tx, ctx, {
      action: 'day.reopened',
      targetType: 'daily_closing',
      targetId: c.id,
      data: { date, reason: c.reopenReason, requestedBy: c.reopenRequestedBy },
    });
    return u;
  }
}
