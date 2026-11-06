import { Controller, Get, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { isoDate, localDate, reportRangeQuery } from '@csp2all/shared';
import { Ctx, TenantAccess } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError } from '../../common/errors';
import { d, n, toDate } from '../../common/serialize';
import { LedgerService } from '../ledger/ledger.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { visibleWhere } from '../records/records.service';

const MAX_RANGE_DAYS = 366;

function checkRange(from: string, to: string) {
  if (from > to)
    throw new AppError('VALIDATION_FAILED', '`from` must be on or before `to`', undefined, {
      from: ['After to'],
    });
  const days = (toDate(to).getTime() - toDate(from).getTime()) / 86_400_000;
  if (days > MAX_RANGE_DAYS)
    throw new AppError('VALIDATION_FAILED', 'Range is limited to one year', undefined, {
      to: ['Range too long'],
    });
}

@Controller('v1')
export class ReportsController {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('dashboard')
  @TenantAccess()
  @ApiDoc({
    summary:
      "Today's dashboard (tenant timezone). Financial widgets require financial permissions.",
    tags: ['Reports'],
  })
  dashboard(@Ctx() ctx: TenantCtx) {
    const today = localDate(new Date(), ctx.timezone);
    return this.db.inTenant(ctx, async (tx) => {
      const vis = visibleWhere(ctx);
      const todayWhere: Prisma.ServiceRecordWhereInput = {
        ...vis,
        txnDate: toDate(today),
        opStatus: { not: 'DRAFT' },
      };
      const todayCount = await tx.serviceRecord.count({ where: todayWhere });
      const volume = await tx.serviceRecord.groupBy({
        by: ['serviceCode'],
        where: todayWhere,
        _count: { _all: true },
        _sum: { principalPaise: true, customerFeePaise: true },
      });
      const pendingApplications = await tx.serviceRecord.count({
        where: {
          ...vis,
          workflowType: 'APPLICATION',
          opStatus: { in: ['SUBMITTED', 'IN_PROGRESS'] },
        },
      });
      const recent = await tx.serviceRecord.findMany({
        where: vis,
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { customer: { select: { name: true } } },
      });
      const followWhere: Prisma.FollowUpTaskWhereInput = {
        tenantId: ctx.tenantId,
        status: 'OPEN',
        dueDate: { lte: toDate(today) },
      };
      if (!ctx.permissions.has('records.view_all'))
        followWhere.OR = [{ assignedToUserId: ctx.userId }, { createdByUserId: ctx.userId }];
      const followUps = ctx.permissions.has('followups.view')
        ? await tx.followUpTask.findMany({
            where: followWhere,
            orderBy: { dueDate: 'asc' },
            take: 8,
            include: { customer: { select: { name: true } } },
          })
        : [];

      let financial: Record<string, unknown> | null = null;
      if (ctx.permissions.has('reports.financial') || ctx.permissions.has('cashbook.view')) {
        const mv = await this.ledger.movements(tx, ctx.tenantId, today, today);
        const balances = await this.ledger.balances(tx, ctx.tenantId);
        const bal = (k: string) => n(balances.find((b) => b.key === k)?.balancePaise ?? 0n);
        financial = {
          customerFeesPaise: {
            value: n((mv.FEE_INCOME?.credit ?? 0n) - (mv.FEE_INCOME?.debit ?? 0n)),
            range: { from: today, to: today },
            meaning:
              'Customer fees recorded as income today (posted records). Excludes transaction principal.',
          },
          cashInPaise: {
            value: n(mv.CASH?.debit ?? 0n),
            range: { from: today, to: today },
            meaning: 'Money into Cash in hand today.',
          },
          cashOutPaise: {
            value: n(mv.CASH?.credit ?? 0n),
            range: { from: today, to: today },
            meaning: 'Money out of Cash in hand today.',
          },
          cashInHandPaise: {
            value: bal('CASH'),
            asOf: 'now',
            meaning: 'Current Cash in hand balance per cashbook.',
          },
          outstandingDuesPaise: {
            value: bal('RECEIVABLE'),
            asOf: 'now',
            meaning: 'Unpaid customer dues on posted records.',
          },
          pendingCommissionPaise: {
            value: bal('COMMISSION_RECEIVABLE'),
            asOf: 'now',
            meaning: 'Commission expected from providers but not yet received. Not cash.',
          },
        };
      }

      const checklist = {
        firstCustomer: (await tx.customer.count({ where: { tenantId: ctx.tenantId } })) > 0,
        firstRecord: (await tx.serviceRecord.count({ where: { tenantId: ctx.tenantId } })) > 0,
        openingCash:
          (await tx.journalEntry.count({
            where: { tenantId: ctx.tenantId, type: 'OPENING_BALANCE' },
          })) > 0,
        staffInvited: ctx.permissions.has('staff.manage')
          ? (await tx.membership.count({ where: { tenantId: ctx.tenantId } })) > 1
          : null,
      };

      return {
        date: today,
        timezone: ctx.timezone,
        scope: ctx.permissions.has('records.view_all') ? 'SHOP' : 'MY_RECORDS',
        todayRecords: {
          value: todayCount,
          range: { from: today, to: today },
          meaning: 'Records dated today (excluding drafts).',
        },
        serviceVolume: {
          range: { from: today, to: today },
          meaning: 'Transaction value processed for customers. This is NOT income.',
          items: volume.map((v) => ({
            serviceCode: v.serviceCode,
            count: v._count._all,
            principalPaise: n(v._sum.principalPaise),
            customerFeePaise: n(v._sum.customerFeePaise),
          })),
        },
        pendingApplications: {
          value: pendingApplications,
          meaning: 'Applications submitted or in progress.',
        },
        financial,
        recentActivity: recent.map((r) => ({
          id: r.id,
          recordNo: r.recordNo,
          serviceCode: r.serviceCode,
          customerName: r.customer?.name ?? r.walkInName,
          txnDate: d(r.txnDate),
          opStatus: r.opStatus,
          principalPaise: n(r.principalPaise),
          customerFeePaise: n(r.customerFeePaise),
          postingStatus: r.postingStatus,
          createdAt: r.createdAt,
        })),
        followUpsDue: followUps.map((f) => ({
          id: f.id,
          title: f.title,
          dueDate: d(f.dueDate),
          customerName: f.customer?.name ?? null,
          recordId: f.recordId,
          version: f.version,
        })),
        checklist,
      };
    });
  }

  @Get('reports/summary')
  @TenantAccess('reports.financial')
  @ApiDoc({
    summary: 'Income, cash movement, dues and commissions for a date range (from ledger)',
    tags: ['Reports'],
    query: reportRangeQuery,
  })
  summary(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const { from, to } = parse(reportRangeQuery, query);
    checkRange(from, to);
    return this.db.inTenant(ctx, async (tx) => {
      const mv = await this.ledger.movements(tx, ctx.tenantId, from, to);
      const net = (k: keyof typeof mv, creditNormal: boolean) => {
        const m = mv[k] ?? { debit: 0n, credit: 0n };
        return n(creditNormal ? m.credit - m.debit : m.debit - m.credit);
      };
      const asOf = await this.ledger.balances(tx, ctx.tenantId, { asOf: to });
      const bal = (k: string) => n(asOf.find((b) => b.key === k)?.balancePaise ?? 0n);
      const received = await tx.commissionReceipt.aggregate({
        where: { tenantId: ctx.tenantId, receivedOn: { gte: toDate(from), lte: toDate(to) } },
        _sum: { amountPaise: true },
      });
      const byService = await tx.serviceRecord.groupBy({
        by: ['serviceCode'],
        where: {
          tenantId: ctx.tenantId,
          txnDate: { gte: toDate(from), lte: toDate(to) },
          postingStatus: 'POSTED',
        },
        _count: { _all: true },
        _sum: { principalPaise: true, customerFeePaise: true, expectedCommissionPaise: true },
      });
      const fee = net('FEE_INCOME', true);
      const commission = net('COMMISSION_INCOME', true);
      const expenses = net('EXPENSES', false);
      const overShort = net('CASH_OVER_SHORT', false);
      return {
        range: { from, to },
        notes: [
          'Income = customer fees + commission accrued − expenses − cash shortages. Transaction principal is not income.',
          'Pending commission is expected, not received. Opening balances are capital, not income.',
        ],
        income: {
          customerFeesPaise: fee,
          commissionAccruedPaise: commission,
          expensesPaise: expenses,
          cashOverShortPaise: -overShort,
          netIncomePaise: fee + commission - expenses - overShort,
        },
        commission: {
          accruedInRangePaise: commission,
          receivedInRangePaise: n(received._sum.amountPaise),
          pendingAsOfEndPaise: bal('COMMISSION_RECEIVABLE'),
        },
        funds: (['CASH', 'BANK', 'FLOAT'] as const).map((k) => ({
          account: k,
          inPaise: n(mv[k]?.debit ?? 0n),
          outPaise: n(mv[k]?.credit ?? 0n),
          closingBalancePaise: bal(k),
        })),
        duesOutstandingAsOfEndPaise: bal('RECEIVABLE'),
        openingCapitalPaise: bal('CAPITAL'),
        services: byService.map((s) => ({
          serviceCode: s.serviceCode,
          postedRecords: s._count._all,
          transactionValuePaise: n(s._sum.principalPaise),
          customerFeesPaise: n(s._sum.customerFeePaise),
          expectedCommissionPaise: n(s._sum.expectedCommissionPaise),
        })),
      };
    });
  }

  @Get('reports/operations')
  @TenantAccess('reports.operational')
  @ApiDoc({
    summary: 'Record counts by service and status (respects own-records scope)',
    tags: ['Reports'],
    query: reportRangeQuery,
  })
  operations(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const { from, to } = parse(reportRangeQuery, query);
    checkRange(from, to);
    return this.db.inTenant(ctx, async (tx) => {
      const rows = await tx.serviceRecord.groupBy({
        by: ['serviceCode', 'opStatus'],
        where: { ...visibleWhere(ctx), txnDate: { gte: toDate(from), lte: toDate(to) } },
        _count: { _all: true },
        _sum: { principalPaise: true },
      });
      return {
        range: { from, to },
        scope: ctx.permissions.has('records.view_all') ? 'SHOP' : 'MY_RECORDS',
        items: rows.map((r) => ({
          serviceCode: r.serviceCode,
          opStatus: r.opStatus,
          count: r._count._all,
          transactionValuePaise: n(r._sum.principalPaise),
        })),
      };
    });
  }

  @Get('reports/trial-balance')
  @TenantAccess('reports.financial')
  @ApiDoc({
    summary: 'Trial balance as of a date (plan: advanced reports)',
    tags: ['Reports'],
    query: z.object({ asOf: isoDate }),
  })
  trialBalance(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const { asOf } = parse(z.object({ asOf: isoDate }), query);
    return this.db.inTenant(ctx, async (tx) => {
      await this.entitlements.assertBoolean(tx, ctx.tenantId, 'advancedReports');
      const rows = await this.ledger.balances(tx, ctx.tenantId, { asOf });
      const totalDebit = rows.reduce((a, r) => a + r.debitPaise, 0n);
      const totalCredit = rows.reduce((a, r) => a + r.creditPaise, 0n);
      return {
        asOf,
        balanced: totalDebit === totalCredit,
        totalDebitPaise: n(totalDebit),
        totalCreditPaise: n(totalCredit),
        accounts: rows.map((r) => ({
          code: r.code,
          key: r.key,
          name: r.name,
          type: r.type,
          debitPaise: n(r.debitPaise),
          creditPaise: n(r.creditPaise),
          balancePaise: n(r.balancePaise),
        })),
      };
    });
  }

  @Get('reports/daybook')
  @TenantAccess('reports.financial')
  @ApiDoc({
    summary: 'All journal entries for a business date (plan: advanced reports)',
    tags: ['Reports'],
    query: z.object({ date: isoDate }),
  })
  daybook(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const { date } = parse(z.object({ date: isoDate }), query);
    return this.db.inTenant(ctx, async (tx) => {
      await this.entitlements.assertBoolean(tx, ctx.tenantId, 'advancedReports');
      const entries = await tx.journalEntry.findMany({
        where: { tenantId: ctx.tenantId, businessDate: toDate(date) },
        include: { lines: { include: { account: { select: { key: true, name: true } } } } },
        orderBy: { entryNo: 'asc' },
      });
      return {
        date,
        entries: entries.map((e) => ({
          id: e.id,
          entryNo: e.entryNo,
          type: e.type,
          description: e.description,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          reversesEntryId: e.reversesEntryId,
          reversedByEntryId: e.reversedByEntryId,
          lines: e.lines.map((l) => ({
            account: l.account.key,
            accountName: l.account.name,
            debitPaise: n(l.debitPaise),
            creditPaise: n(l.creditPaise),
            memo: l.memo,
          })),
        })),
      };
    });
  }
}
