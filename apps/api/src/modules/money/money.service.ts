import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  cashAdjustmentSchema,
  collectionCreateSchema,
  commissionReceiptSchema,
  expenseCreateSchema,
  fundTransferSchema,
  localDate,
  openingBalanceSchema,
  type PrincipalDirection,
} from '@csp2all/shared';
import { randomUUID } from 'node:crypto';
import { Db, nextCounter, type TenantCtx } from '../../common/db';
import { AppError, notFound } from '../../common/errors';
import { MastersService } from '../masters/masters.service';
import { AuditService } from '../../common/audit';
import { big, d, n, toDate } from '../../common/serialize';
import {
  fundAccountFor,
  LedgerService,
  type AccountKey,
  type FundAccount,
} from '../ledger/ledger.service';
import { paymentStatusFor, receivableFor } from '../records/posting';
import { visibleWhere } from '../records/records.service';

const REVERSIBLE_MANUAL_TYPES = ['OPENING_BALANCE', 'ADJUSTMENT', 'TRANSFER'];

@Injectable()
export class MoneyService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly masters: MastersService,
  ) {}

  // ------------------------------------------------------------------ dues & collections

  async dues(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const records = await tx.serviceRecord.findMany({
        where: { ...visibleWhere(ctx), postingStatus: 'POSTED', amountDuePaise: { gt: 0 } },
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { txnDate: 'asc' },
        take: 500,
      });
      const groups = new Map<
        string,
        {
          customerId: string | null;
          customerName: string;
          totalDuePaise: number;
          records: unknown[];
        }
      >();
      for (const r of records) {
        const key = r.customerId ?? `walkin:${r.id}`;
        const g = groups.get(key) ?? {
          customerId: r.customerId,
          customerName: r.customer?.name ?? r.walkInName ?? 'Walk-in customer',
          totalDuePaise: 0,
          records: [],
        };
        g.totalDuePaise += n(r.amountDuePaise);
        g.records.push({
          id: r.id,
          recordNo: r.recordNo,
          serviceCode: r.serviceCode,
          txnDate: d(r.txnDate),
          amountDuePaise: n(r.amountDuePaise),
          paymentStatus: r.paymentStatus,
        });
        groups.set(key, g);
      }
      const items = [...groups.values()].sort((a, b) => b.totalDuePaise - a.totalDuePaise);
      return { items, totalDuePaise: items.reduce((a, g) => a + g.totalDuePaise, 0) };
    });
  }

  /**
   * Records money received against dues. Records are locked FOR UPDATE so concurrent collections
   * cannot over-collect. Posting: Dr Cash/Bank, Cr Customer dues receivable.
   */
  async collect(ctx: TenantCtx, dto: z.infer<typeof collectionCreateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const ids = [...new Set(dto.allocations.map((a) => a.recordId))];
      if (ids.length !== dto.allocations.length)
        throw new AppError('VALIDATION_FAILED', 'Each record may appear once');
      await tx.$queryRaw`SELECT id FROM service_records WHERE "tenantId" = ${ctx.tenantId}::uuid AND id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      const records = await tx.serviceRecord.findMany({
        where: { ...visibleWhere(ctx), id: { in: ids } },
      });
      if (records.length !== ids.length) throw notFound('Record');
      for (const a of dto.allocations) {
        const r = records.find((x) => x.id === a.recordId)!;
        if (r.postingStatus !== 'POSTED')
          throw new AppError('NOT_POSTED', `Record #${r.recordNo} is not posted`);
        if (dto.customerId && r.customerId !== dto.customerId)
          throw new AppError(
            'VALIDATION_FAILED',
            `Record #${r.recordNo} belongs to a different customer`,
          );
        if (big(a.amountPaise) > r.amountDuePaise) {
          throw new AppError(
            'AMOUNT_EXCEEDS_DUE',
            `Record #${r.recordNo} has only ${n(r.amountDuePaise)} paise due`,
            { recordId: r.id, duePaise: n(r.amountDuePaise) },
          );
        }
      }
      const total = dto.allocations.reduce((s, a) => s + big(a.amountPaise), 0n);
      const paymentMode = await this.masters.resolvePaymentMode(
        tx,
        ctx,
        dto.paymentMode,
        dto.method,
      );
      const id = randomUUID();
      const receiptNo = await nextCounter(tx, ctx.tenantId, 'receipt');
      const entry = await this.ledger.post(tx, ctx, {
        businessDate: dto.receivedOn,
        type: 'COLLECTION',
        sourceType: 'collection',
        sourceId: id,
        postingKey: `collection:${id}`,
        description: `Due collection receipt #${receiptNo}`,
        lines: [
          { account: fundAccountFor(dto.method), debit: total, memo: 'Due collected' },
          { account: 'RECEIVABLE', credit: total, memo: 'Customer dues settled' },
        ],
      });
      await tx.collection.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          receiptNo,
          customerId: dto.customerId ?? null,
          method: dto.method,
          paymentMode,
          amountPaise: total,
          receivedOn: toDate(dto.receivedOn),
          notes: dto.notes ?? null,
          journalEntryId: entry!.id,
          createdByUserId: ctx.userId,
        },
      });
      for (const a of dto.allocations) {
        const r = records.find((x) => x.id === a.recordId)!;
        await tx.paymentAllocation.create({
          data: {
            tenantId: ctx.tenantId,
            collectionId: id,
            recordId: r.id,
            amountPaise: big(a.amountPaise),
          },
        });
        const allocated = r.amountAllocatedPaise + big(a.amountPaise);
        const receivable = receivableFor(
          r.principalDirection as PrincipalDirection,
          r.principalPaise,
          r.customerFeePaise,
        );
        const status = paymentStatusFor(receivable, r.amountCollectedPaise + allocated);
        await tx.serviceRecord.update({
          where: { id: r.id },
          data: {
            amountAllocatedPaise: allocated,
            amountDuePaise: r.amountDuePaise - big(a.amountPaise),
            paymentStatus: status,
            version: { increment: 1 },
          },
        });
        await tx.recordStatusEvent.create({
          data: {
            tenantId: ctx.tenantId,
            recordId: r.id,
            dimension: 'PAYMENT',
            fromStatus: r.paymentStatus,
            toStatus: status,
            data: { collectionId: id, receiptNo, amountPaise: a.amountPaise },
            actorUserId: ctx.userId,
            actorType: ctx.actorType,
          },
        });
      }
      await this.audit.tenant(tx, ctx, {
        action: 'collection.created',
        targetType: 'collection',
        targetId: id,
        data: { receiptNo, totalPaise: total },
      });
      return {
        id,
        receiptNo,
        amountPaise: n(total),
        method: dto.method,
        receivedOn: dto.receivedOn,
        journalEntryId: entry!.id,
      };
    });
  }

  async reverseCollection(ctx: TenantCtx, id: string, reason: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.collection.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { allocations: true },
      });
      if (!c) throw notFound('Collection');
      if (c.reversedAt) throw new AppError('CONFLICT', 'Collection already reversed');
      const ids = c.allocations.map((a) => a.recordId);
      await tx.$queryRaw`SELECT id FROM service_records WHERE "tenantId" = ${ctx.tenantId}::uuid AND id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      const reversal = await this.ledger.reverse(tx, ctx, c.journalEntryId, {
        type: 'COLLECTION_REVERSAL',
        businessDate: localDate(new Date(), ctx.timezone),
        description: `Reversal of receipt #${c.receiptNo}: ${reason}`,
      });
      await tx.collection.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: reason, reversalEntryId: reversal.id },
      });
      for (const a of c.allocations) {
        const r = await tx.serviceRecord.findUniqueOrThrow({ where: { id: a.recordId } });
        const allocated = r.amountAllocatedPaise - a.amountPaise;
        const receivable = receivableFor(
          r.principalDirection as PrincipalDirection,
          r.principalPaise,
          r.customerFeePaise,
        );
        const status = paymentStatusFor(receivable, r.amountCollectedPaise + allocated);
        await tx.serviceRecord.update({
          where: { id: r.id },
          data: {
            amountAllocatedPaise: allocated,
            amountDuePaise: r.amountDuePaise + a.amountPaise,
            paymentStatus: status,
            version: { increment: 1 },
          },
        });
        await tx.recordStatusEvent.create({
          data: {
            tenantId: ctx.tenantId,
            recordId: r.id,
            dimension: 'PAYMENT',
            fromStatus: r.paymentStatus,
            toStatus: status,
            reason,
            data: { reversedCollectionId: id },
            actorUserId: ctx.userId,
            actorType: ctx.actorType,
          },
        });
      }
      await this.audit.tenant(tx, ctx, {
        action: 'collection.reversed',
        targetType: 'collection',
        targetId: id,
        data: { reason },
      });
      return { id, reversed: true, reversalEntryId: reversal.id };
    });
  }

  async listCollections(ctx: TenantCtx, from?: string, to?: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.CollectionWhereInput = { tenantId: ctx.tenantId };
      if (from || to)
        where.receivedOn = {
          ...(from ? { gte: toDate(from) } : {}),
          ...(to ? { lte: toDate(to) } : {}),
        };
      const items = await tx.collection.findMany({
        where,
        include: { allocations: { include: { record: { select: { recordNo: true } } } } },
        orderBy: { receiptNo: 'desc' },
        take: 200,
      });
      return {
        items: items.map((c) => ({
          id: c.id,
          receiptNo: c.receiptNo,
          customerId: c.customerId,
          method: c.method,
          paymentMode: c.paymentMode,
          amountPaise: n(c.amountPaise),
          receivedOn: d(c.receivedOn),
          notes: c.notes,
          reversedAt: c.reversedAt,
          allocations: c.allocations.map((a) => ({
            recordId: a.recordId,
            recordNo: a.record.recordNo,
            amountPaise: n(a.amountPaise),
          })),
        })),
      };
    });
  }

  // ------------------------------------------------------------------ expenses

  async createExpense(ctx: TenantCtx, dto: z.infer<typeof expenseCreateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      await this.masters.assertExpenseCategory(tx, ctx, dto.category);
      const paymentMode = await this.masters.resolvePaymentMode(
        tx,
        ctx,
        dto.paymentMode,
        dto.method,
      );
      const id = randomUUID();
      const amount = big(dto.amountPaise);
      const entry = await this.ledger.post(tx, ctx, {
        businessDate: dto.paidOn,
        type: 'EXPENSE',
        sourceType: 'expense',
        sourceId: id,
        postingKey: `expense:${id}`,
        description: `Expense: ${dto.category}${dto.vendor ? ` (${dto.vendor})` : ''}`,
        lines: [
          { account: 'EXPENSES', debit: amount, memo: dto.category },
          { account: fundAccountFor(dto.method), credit: amount, memo: 'Paid' },
        ],
      });
      const e = await tx.expense.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          category: dto.category,
          amountPaise: amount,
          method: dto.method,
          paymentMode,
          paidOn: toDate(dto.paidOn),
          vendor: dto.vendor ?? null,
          notes: dto.notes ?? null,
          journalEntryId: entry!.id,
          createdByUserId: ctx.userId,
        },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'expense.created',
        targetType: 'expense',
        targetId: id,
        data: { amountPaise: amount, category: dto.category },
      });
      return this.expenseJson(e);
    });
  }

  async reverseExpense(ctx: TenantCtx, id: string, reason: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const e = await tx.expense.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!e) throw notFound('Expense');
      if (e.reversedAt) throw new AppError('CONFLICT', 'Expense already reversed');
      const rev = await this.ledger.reverse(tx, ctx, e.journalEntryId, {
        type: 'EXPENSE_REVERSAL',
        businessDate: localDate(new Date(), ctx.timezone),
        description: `Expense reversal: ${reason}`,
      });
      const u = await tx.expense.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: reason, reversalJournalEntryId: rev.id },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'expense.reversed',
        targetType: 'expense',
        targetId: id,
        data: { reason },
      });
      return this.expenseJson(u);
    });
  }

  async listExpenses(ctx: TenantCtx, from?: string, to?: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.ExpenseWhereInput = { tenantId: ctx.tenantId };
      if (from || to)
        where.paidOn = {
          ...(from ? { gte: toDate(from) } : {}),
          ...(to ? { lte: toDate(to) } : {}),
        };
      const items = await tx.expense.findMany({
        where,
        orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      });
      const total = items.filter((e) => !e.reversedAt).reduce((a, e) => a + e.amountPaise, 0n);
      return { items: items.map((e) => this.expenseJson(e)), totalPaise: n(total) };
    });
  }

  private expenseJson(e: {
    id: string;
    category: string;
    amountPaise: bigint;
    method: string;
    paymentMode: string | null;
    paidOn: Date;
    vendor: string | null;
    notes: string | null;
    reversedAt: Date | null;
    reversalReason: string | null;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      category: e.category,
      amountPaise: n(e.amountPaise),
      method: e.method,
      paymentMode: e.paymentMode,
      paidOn: d(e.paidOn),
      vendor: e.vendor,
      notes: e.notes,
      reversedAt: e.reversedAt,
      reversalReason: e.reversalReason,
      createdAt: e.createdAt,
    };
  }

  // ------------------------------------------------------------------ cashbook

  async cashbook(ctx: TenantCtx, date: string, account: FundAccount) {
    return this.db.inTenant(ctx, async (tx) => {
      const acct = await tx.ledgerAccount.findUniqueOrThrow({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: account } },
      });
      const opening = await this.ledger.balanceOf(tx, ctx.tenantId, account, { before: date });
      const lines = await tx.journalLine.findMany({
        where: { tenantId: ctx.tenantId, accountId: acct.id, businessDate: toDate(date) },
        include: { entry: true },
        orderBy: [{ entry: { entryNo: 'asc' } }],
      });
      let running = opening;
      const items = lines.map((l) => {
        running += l.debitPaise - l.creditPaise;
        return {
          entryId: l.entryId,
          entryNo: l.entry.entryNo,
          type: l.entry.type,
          description: l.entry.description,
          sourceType: l.entry.sourceType,
          sourceId: l.entry.sourceId,
          inPaise: n(l.debitPaise),
          outPaise: n(l.creditPaise),
          balancePaise: n(running),
          memo: l.memo,
          reversed: !!l.entry.reversedByEntryId,
          isReversal: !!l.entry.reversesEntryId,
          createdAt: l.createdAt,
        };
      });
      const totalIn = lines.reduce((a, l) => a + l.debitPaise, 0n);
      const totalOut = lines.reduce((a, l) => a + l.creditPaise, 0n);
      const balances = (await this.ledger.balances(tx, ctx.tenantId, { asOf: date })).filter((b) =>
        ['CASH', 'BANK', 'FLOAT'].includes(b.key),
      );
      const closing = await tx.dailyClosing.findUnique({
        where: { tenantId_businessDate: { tenantId: ctx.tenantId, businessDate: toDate(date) } },
      });
      return {
        date,
        account,
        openingBalancePaise: n(opening),
        totalInPaise: n(totalIn),
        totalOutPaise: n(totalOut),
        closingBalancePaise: n(opening + totalIn - totalOut),
        items,
        fundBalances: balances.map((b) => ({
          account: b.key,
          name: b.name,
          balancePaise: n(b.balancePaise),
        })),
        dayStatus: closing?.status ?? 'OPEN',
      };
    });
  }

  async opening(ctx: TenantCtx, dto: z.infer<typeof openingBalanceSchema>) {
    return this.manualEntry(
      ctx,
      'OPENING_BALANCE',
      dto.businessDate,
      `Opening balance: ${dto.account}`,
      [
        { account: dto.account, debit: big(dto.amountPaise), memo: dto.notes ?? 'Opening balance' },
        { account: 'CAPITAL', credit: big(dto.amountPaise), memo: 'Opening balance' },
      ],
    );
  }

  async adjust(ctx: TenantCtx, dto: z.infer<typeof cashAdjustmentSchema>) {
    const amt = big(dto.amountPaise);
    const lines =
      dto.direction === 'IN'
        ? [
            { account: dto.account as AccountKey, debit: amt, memo: dto.reason },
            { account: 'CASH_OVER_SHORT' as AccountKey, credit: amt, memo: dto.reason },
          ]
        : [
            { account: 'CASH_OVER_SHORT' as AccountKey, debit: amt, memo: dto.reason },
            { account: dto.account as AccountKey, credit: amt, memo: dto.reason },
          ];
    return this.manualEntry(
      ctx,
      'ADJUSTMENT',
      dto.businessDate,
      `Adjustment (${dto.direction}) ${dto.account}: ${dto.reason}`,
      lines,
    );
  }

  async transfer(ctx: TenantCtx, dto: z.infer<typeof fundTransferSchema>) {
    const amt = big(dto.amountPaise);
    return this.manualEntry(
      ctx,
      'TRANSFER',
      dto.businessDate,
      `Transfer ${dto.from} → ${dto.to}${dto.notes ? `: ${dto.notes}` : ''}`,
      [
        { account: dto.to, debit: amt, memo: 'Transfer in' },
        { account: dto.from, credit: amt, memo: 'Transfer out' },
      ],
    );
  }

  private async manualEntry(
    ctx: TenantCtx,
    type: string,
    businessDate: string,
    description: string,
    lines: { account: AccountKey; debit?: bigint; credit?: bigint; memo?: string }[],
  ) {
    return this.db.inTenant(ctx, async (tx) => {
      const id = randomUUID();
      const entry = await this.ledger.post(tx, ctx, {
        businessDate,
        type,
        sourceType: 'manual',
        sourceId: id,
        postingKey: `${type.toLowerCase()}:${id}`,
        description,
        lines,
      });
      if (!entry) throw new AppError('VALIDATION_FAILED', 'Amount must be greater than zero');
      await this.audit.tenant(tx, ctx, {
        action: `cashbook.${type.toLowerCase()}`,
        targetType: 'journal_entry',
        targetId: entry.id,
        data: { description, lines },
      });
      return { entryId: entry.id, entryNo: entry.entryNo, type, businessDate };
    });
  }

  async reverseManualEntry(ctx: TenantCtx, entryId: string, reason: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const e = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId } });
      if (!e) throw notFound('Journal entry');
      if (!REVERSIBLE_MANUAL_TYPES.includes(e.type)) {
        throw new AppError(
          'CONFLICT',
          'Reverse this entry from its source (record, collection or expense)',
        );
      }
      const rev = await this.ledger.reverse(tx, ctx, e.id, {
        type: `${e.type}_REVERSAL`,
        businessDate: localDate(new Date(), ctx.timezone),
        description: `Reversal of entry #${e.entryNo}: ${reason}`,
      });
      await this.audit.tenant(tx, ctx, {
        action: 'journal.reversed',
        targetType: 'journal_entry',
        targetId: e.id,
        data: { reason, reversalId: rev.id },
      });
      return { entryId: e.id, reversalEntryId: rev.id };
    });
  }

  // ------------------------------------------------------------------ commissions

  async commissions(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const pending = await this.ledger.balanceOf(tx, ctx.tenantId, 'COMMISSION_RECEIVABLE');
      const records = await tx.$queryRaw<
        {
          id: string;
          recordNo: number;
          serviceCode: string;
          txnDate: Date;
          expected: bigint;
          received: bigint;
        }[]
      >`
        SELECT id, "recordNo", "serviceCode", "txnDate", "expectedCommissionPaise" AS expected, "receivedCommissionPaise" AS received
        FROM service_records WHERE "tenantId" = ${ctx.tenantId}::uuid AND "postingStatus" = 'POSTED'
          AND "expectedCommissionPaise" > "receivedCommissionPaise"
        ORDER BY "txnDate" ASC LIMIT 300`;
      const receipts = await tx.commissionReceipt.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const receivedTotal = await tx.commissionReceipt.aggregate({
        where: { tenantId: ctx.tenantId },
        _sum: { amountPaise: true },
      });
      return {
        /** Accrued from posted records but not yet received from providers. */
        pendingPaise: n(pending),
        receivedToDatePaise: n(receivedTotal._sum.amountPaise),
        outstanding: records.map((r) => ({
          id: r.id,
          recordNo: r.recordNo,
          serviceCode: r.serviceCode,
          txnDate: d(r.txnDate),
          expectedPaise: n(r.expected),
          receivedPaise: n(r.received),
          outstandingPaise: n(r.expected - r.received),
        })),
        receipts: receipts.map((r) => ({
          id: r.id,
          method: r.method,
          amountPaise: n(r.amountPaise),
          receivedOn: d(r.receivedOn),
          notes: r.notes,
          allocations: r.allocations,
        })),
      };
    });
  }

  /** Dr Wallet/Bank/Cash; Cr Commission receivable (allocated) and Commission income (unallocated extra). */
  async receiveCommission(ctx: TenantCtx, dto: z.infer<typeof commissionReceiptSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const ids = dto.allocations.map((a) => a.recordId);
      if (new Set(ids).size !== ids.length)
        throw new AppError('VALIDATION_FAILED', 'Each record may appear once');
      if (ids.length)
        await tx.$queryRaw`SELECT id FROM service_records WHERE "tenantId" = ${ctx.tenantId}::uuid AND id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      const records = ids.length
        ? await tx.serviceRecord.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } } })
        : [];
      if (records.length !== ids.length) throw notFound('Record');
      for (const a of dto.allocations) {
        const r = records.find((x) => x.id === a.recordId)!;
        if (r.postingStatus !== 'POSTED')
          throw new AppError('NOT_POSTED', `Record #${r.recordNo} is not posted`);
        if (big(a.amountPaise) > r.expectedCommissionPaise - r.receivedCommissionPaise) {
          throw new AppError(
            'AMOUNT_EXCEEDS_DUE',
            `Record #${r.recordNo}: more than the outstanding commission`,
          );
        }
      }
      const allocated = dto.allocations.reduce((s, a) => s + big(a.amountPaise), 0n);
      const extra = big(dto.unallocatedPaise);
      const total = allocated + extra;
      if (total === 0n) throw new AppError('VALIDATION_FAILED', 'Enter an amount');
      const id = randomUUID();
      const entry = await this.ledger.post(tx, ctx, {
        businessDate: dto.receivedOn,
        type: 'COMMISSION_RECEIPT',
        sourceType: 'commission_receipt',
        sourceId: id,
        postingKey: `commission:${id}`,
        description: 'Commission received from provider',
        lines: [
          { account: fundAccountFor(dto.method), debit: total, memo: 'Commission received' },
          {
            account: 'COMMISSION_RECEIVABLE',
            credit: allocated,
            memo: 'Expected commission settled',
          },
          {
            account: 'COMMISSION_INCOME',
            credit: extra,
            memo: 'Commission not linked to a record',
          },
        ],
      });
      await tx.commissionReceipt.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          method: dto.method,
          amountPaise: total,
          receivedOn: toDate(dto.receivedOn),
          allocations: dto.allocations,
          notes: dto.notes ?? null,
          journalEntryId: entry!.id,
          createdByUserId: ctx.userId,
        },
      });
      for (const a of dto.allocations) {
        await tx.serviceRecord.update({
          where: { id: a.recordId },
          data: {
            receivedCommissionPaise: { increment: big(a.amountPaise) },
            version: { increment: 1 },
          },
        });
      }
      await this.audit.tenant(tx, ctx, {
        action: 'commission.received',
        targetType: 'commission_receipt',
        targetId: id,
        data: { totalPaise: total },
      });
      return {
        id,
        amountPaise: n(total),
        allocatedPaise: n(allocated),
        unallocatedPaise: n(extra),
        journalEntryId: entry!.id,
      };
    });
  }
}
