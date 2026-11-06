import { Injectable } from '@nestjs/common';
import type { JournalEntry } from '@prisma/client';
import { nextCounter, type TenantCtx, type Tx } from '../../common/db';
import { AppError } from '../../common/errors';
import { toDate } from '../../common/serialize';

/**
 * Chart of accounts created for every tenant. Debit-normal: ASSET, EXPENSE. Credit-normal: EQUITY, INCOME.
 * See docs/FINANCE.md for the posting rules that use these accounts.
 */
export const CHART = [
  { key: 'CASH', code: '1000', name: 'Cash in hand', type: 'ASSET' },
  { key: 'BANK', code: '1010', name: 'Bank / UPI', type: 'ASSET' },
  { key: 'FLOAT', code: '1020', name: 'Provider wallet (float)', type: 'ASSET' },
  { key: 'RECEIVABLE', code: '1100', name: 'Customer dues receivable', type: 'ASSET' },
  {
    key: 'COMMISSION_RECEIVABLE',
    code: '1200',
    name: 'Commission receivable (expected)',
    type: 'ASSET',
  },
  { key: 'CAPITAL', code: '3000', name: "Owner's capital / opening balances", type: 'EQUITY' },
  { key: 'FEE_INCOME', code: '4000', name: 'Customer fee income', type: 'INCOME' },
  { key: 'COMMISSION_INCOME', code: '4100', name: 'Commission income', type: 'INCOME' },
  { key: 'EXPENSES', code: '5000', name: 'Shop expenses', type: 'EXPENSE' },
  { key: 'CASH_OVER_SHORT', code: '5900', name: 'Cash over / short', type: 'EXPENSE' },
] as const;

export type AccountKey = (typeof CHART)[number]['key'];
export type FundAccount = 'CASH' | 'BANK' | 'FLOAT';

/** Maps a payment method to the asset account that receives/pays the money. */
export function fundAccountFor(method: string): FundAccount {
  if (method === 'CASH') return 'CASH';
  if (method === 'UPI' || method === 'BANK' || method === 'BANK_TRANSFER') return 'BANK';
  if (method === 'FLOAT') return 'FLOAT';
  throw new AppError('VALIDATION_FAILED', `Unsupported payment method ${method}`);
}

export interface LineInput {
  account: AccountKey;
  debit?: bigint;
  credit?: bigint;
  memo?: string;
}

export interface PostInput {
  businessDate: string;
  type: string;
  sourceType: string;
  sourceId: string;
  postingKey: string;
  description: string;
  lines: LineInput[];
  reversesEntryId?: string;
}

/** Validates and normalises lines: drops zero lines, enforces one side per line and balance. */
export interface NormalLine {
  account: AccountKey;
  debit: bigint;
  credit: bigint;
  memo?: string;
}

export function normaliseLines(lines: LineInput[]): NormalLine[] {
  const out = lines
    .map((l) => ({
      account: l.account,
      debit: l.debit ?? 0n,
      credit: l.credit ?? 0n,
      memo: l.memo,
    }))
    .filter((l) => l.debit !== 0n || l.credit !== 0n);
  for (const l of out) {
    if (l.debit < 0n || l.credit < 0n || (l.debit > 0n && l.credit > 0n)) {
      throw new AppError(
        'UNBALANCED_ENTRY',
        'Each journal line must have exactly one positive side',
      );
    }
  }
  const d = out.reduce((a, l) => a + l.debit, 0n);
  const c = out.reduce((a, l) => a + l.credit, 0n);
  if (d !== c)
    throw new AppError('UNBALANCED_ENTRY', `Entry does not balance (debits ${d}, credits ${c})`);
  return out;
}

@Injectable()
export class LedgerService {
  async ensureAccounts(tx: Tx, tenantId: string) {
    await tx.ledgerAccount.createMany({
      data: CHART.map((a) => ({ tenantId, key: a.key, code: a.code, name: a.name, type: a.type })),
      skipDuplicates: true,
    });
  }

  private async accountIds(tx: Tx, tenantId: string): Promise<Record<string, string>> {
    const rows = await tx.ledgerAccount.findMany({
      where: { tenantId },
      select: { id: true, key: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.id]));
  }

  /**
   * Posts a balanced journal entry. Returns null when every line is zero (nothing to post).
   * `postingKey` is unique per tenant, so the same source can never be posted twice.
   */
  async post(
    tx: Tx,
    ctx: Pick<TenantCtx, 'tenantId' | 'userId'>,
    input: PostInput,
  ): Promise<JournalEntry | null> {
    const lines = normaliseLines(input.lines);
    if (lines.length === 0) return null;
    if (lines.length < 2)
      throw new AppError('UNBALANCED_ENTRY', 'An entry needs at least two lines');

    const dup = await tx.journalEntry.findUnique({
      where: { tenantId_postingKey: { tenantId: ctx.tenantId, postingKey: input.postingKey } },
    });
    if (dup)
      throw new AppError('ALREADY_POSTED', 'This item has already been posted', {
        entryId: dup.id,
      });

    await this.assertDayOpen(tx, ctx.tenantId, input.businessDate);
    const ids = await this.accountIds(tx, ctx.tenantId);
    const entryNo = await nextCounter(tx, ctx.tenantId, 'journal_entry');
    const businessDate = toDate(input.businessDate);
    const entry = await tx.journalEntry.create({
      data: {
        tenantId: ctx.tenantId,
        entryNo,
        businessDate,
        type: input.type,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingKey: input.postingKey,
        description: input.description.slice(0, 200),
        reversesEntryId: input.reversesEntryId,
        createdByUserId: ctx.userId,
      },
    });
    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        tenantId: ctx.tenantId,
        entryId: entry.id,
        accountId: ids[l.account],
        debitPaise: l.debit,
        creditPaise: l.credit,
        memo: l.memo?.slice(0, 120),
        businessDate,
      })),
    });
    return entry;
  }

  /** Compensating entry that mirrors every line of the original. The original is never modified except for its reversal link. */
  async reverse(
    tx: Tx,
    ctx: Pick<TenantCtx, 'tenantId' | 'userId'>,
    entryId: string,
    opts: { type: string; businessDate: string; description: string },
  ) {
    const original = await tx.journalEntry.findFirst({
      where: { id: entryId, tenantId: ctx.tenantId },
      include: { lines: { include: { account: true } } },
    });
    if (!original) throw new AppError('NOT_FOUND', 'Journal entry not found');
    if (original.reversedByEntryId)
      throw new AppError('CONFLICT', 'This entry has already been reversed');
    if (original.reversesEntryId)
      throw new AppError('CONFLICT', 'A reversal entry cannot itself be reversed');
    const reversal = await this.post(tx, ctx, {
      businessDate: opts.businessDate,
      type: opts.type,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      postingKey: `reversal:${original.id}`,
      description: opts.description,
      reversesEntryId: original.id,
      lines: original.lines.map((l) => ({
        account: l.account.key as AccountKey,
        debit: l.creditPaise,
        credit: l.debitPaise,
        memo: `Reversal: ${l.memo ?? ''}`.trim(),
      })),
    });
    await tx.journalEntry.update({
      where: { id: original.id },
      data: { reversedByEntryId: reversal!.id },
    });
    return reversal!;
  }

  async assertDayOpen(tx: Tx, tenantId: string, businessDate: string) {
    const closing = await tx.dailyClosing.findUnique({
      where: { tenantId_businessDate: { tenantId, businessDate: toDate(businessDate) } },
    });
    if (closing && (closing.status === 'CLOSED' || closing.status === 'REOPEN_REQUESTED')) {
      throw new AppError(
        'DAY_CLOSED',
        `${businessDate} is closed. Reopen the day to post changes.`,
        { businessDate },
      );
    }
  }

  /** Signed balances (debit-normal accounts positive when debit > credit; credit-normal the reverse). */
  async balances(tx: Tx, tenantId: string, opts: { asOf?: string; before?: string } = {}) {
    const rows = await tx.$queryRaw<
      { key: string; type: string; name: string; code: string; debit: bigint; credit: bigint }[]
    >`
      SELECT a.key, a.type, a.name, a.code,
             coalesce(sum(l."debitPaise"), 0)::bigint AS debit,
             coalesce(sum(l."creditPaise"), 0)::bigint AS credit
      FROM ledger_accounts a
      LEFT JOIN journal_lines l ON l."accountId" = a.id AND l."tenantId" = a."tenantId"
        AND (${opts.asOf ?? null}::date IS NULL OR l."businessDate" <= ${opts.asOf ?? null}::date)
        AND (${opts.before ?? null}::date IS NULL OR l."businessDate" < ${opts.before ?? null}::date)
      WHERE a."tenantId" = ${tenantId}::uuid
      GROUP BY a.key, a.type, a.name, a.code
      ORDER BY a.code`;
    return rows.map((r) => {
      const debitNormal = r.type === 'ASSET' || r.type === 'EXPENSE';
      return {
        key: r.key as AccountKey,
        code: r.code,
        name: r.name,
        type: r.type,
        debitPaise: r.debit,
        creditPaise: r.credit,
        balancePaise: debitNormal ? r.debit - r.credit : r.credit - r.debit,
      };
    });
  }

  async balanceOf(
    tx: Tx,
    tenantId: string,
    key: AccountKey,
    opts: { asOf?: string; before?: string } = {},
  ) {
    return (await this.balances(tx, tenantId, opts)).find((b) => b.key === key)?.balancePaise ?? 0n;
  }

  /** Debit/credit totals per account within [from, to]. */
  async movements(tx: Tx, tenantId: string, from: string, to: string) {
    const rows = await tx.$queryRaw<{ key: string; debit: bigint; credit: bigint }[]>`
      SELECT a.key, coalesce(sum(l."debitPaise"),0)::bigint AS debit, coalesce(sum(l."creditPaise"),0)::bigint AS credit
      FROM ledger_accounts a
      LEFT JOIN journal_lines l ON l."accountId" = a.id AND l."tenantId" = a."tenantId"
        AND l."businessDate" BETWEEN ${from}::date AND ${to}::date
      WHERE a."tenantId" = ${tenantId}::uuid
      GROUP BY a.key`;
    return Object.fromEntries(
      rows.map((r) => [r.key, { debit: r.debit, credit: r.credit }]),
    ) as Record<AccountKey, { debit: bigint; credit: bigint }>;
  }
}
