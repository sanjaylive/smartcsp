import {
  cashEffect,
  paymentStatusFor,
  receivableFor,
  recordPostingLines,
  type RecordAmounts,
} from '../../src/modules/records/posting';
import { normaliseLines } from '../../src/modules/ledger/ledger.service';

const sum = (lines: ReturnType<typeof recordPostingLines>, side: 'debit' | 'credit') =>
  lines.reduce((a, l) => a + (l[side] ?? 0n), 0n);
const base: RecordAmounts = {
  direction: 'PAYOUT',
  principal: 0n,
  fee: 0n,
  expectedCommission: 0n,
  collected: 0n,
  paymentMethod: 'CASH',
  principalMethod: 'CASH',
};

describe('record posting rules (docs/FINANCE.md)', () => {
  it('AEPS cash payout: wallet credited, cash paid out, fee is the only income', () => {
    const a = {
      ...base,
      direction: 'PAYOUT' as const,
      principal: 500000n,
      fee: 1000n,
      collected: 1000n,
      expectedCommission: 1250n,
    };
    const lines = recordPostingLines(a);
    expect(lines).toEqual([
      { account: 'FLOAT', debit: 500000n, memo: expect.any(String) },
      { account: 'CASH', credit: 500000n, memo: expect.any(String) },
      { account: 'CASH', debit: 1000n, memo: expect.any(String) },
      { account: 'FEE_INCOME', credit: 1000n, memo: expect.any(String) },
      { account: 'COMMISSION_RECEIVABLE', debit: 1250n, memo: expect.any(String) },
      { account: 'COMMISSION_INCOME', credit: 1250n, memo: expect.any(String) },
    ]);
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
    expect(cashEffect(a)).toBe(-499000n); // hands ₹4,990 net to the customer
  });

  it('DMT cash collection: principal leaves wallet, principal + fee collected', () => {
    const a = {
      ...base,
      direction: 'COLLECT' as const,
      principal: 300000n,
      fee: 3000n,
      collected: 303000n,
    };
    const lines = recordPostingLines(a);
    expect(lines.find((l) => l.account === 'FLOAT')).toMatchObject({ credit: 300000n });
    expect(lines.find((l) => l.account === 'CASH')).toMatchObject({ debit: 303000n });
    expect(lines.find((l) => l.account === 'FEE_INCOME')).toMatchObject({ credit: 3000n });
    expect(lines.some((l) => l.account === 'RECEIVABLE')).toBe(false);
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
  });

  it('partial collection creates a receivable for the remainder', () => {
    const a = {
      ...base,
      direction: 'COLLECT' as const,
      principal: 100000n,
      fee: 2000n,
      collected: 50000n,
    };
    const lines = recordPostingLines(a);
    expect(lines.find((l) => l.account === 'RECEIVABLE')).toMatchObject({ debit: 52000n });
    expect(paymentStatusFor(receivableFor('COLLECT', 100000n, 2000n), 50000n)).toBe('PARTIAL');
  });

  it('balance enquiry with no fee has nothing to post', () => {
    expect(recordPostingLines({ ...base, direction: 'NONE' })).toEqual([]);
    expect(paymentStatusFor(0n, 0n)).toBe('NOT_APPLICABLE');
  });

  it('rejects collecting more than owed and principal on a no-principal operation', () => {
    expect(() =>
      recordPostingLines({
        ...base,
        direction: 'COLLECT',
        principal: 100n,
        fee: 0n,
        collected: 101n,
      }),
    ).toThrow(/more than the customer owes/);
    expect(() => recordPostingLines({ ...base, direction: 'NONE', principal: 100n })).toThrow(
      /no transaction amount/,
    );
  });

  it('UPI collection posts to the bank account, not cash', () => {
    const lines = recordPostingLines({
      ...base,
      direction: 'NONE',
      fee: 5000n,
      collected: 5000n,
      paymentMethod: 'UPI',
    });
    expect(lines[0]).toMatchObject({ account: 'BANK', debit: 5000n });
  });

  it('ledger refuses unbalanced or two-sided lines', () => {
    expect(() =>
      normaliseLines([
        { account: 'CASH', debit: 100n },
        { account: 'FEE_INCOME', credit: 99n },
      ]),
    ).toThrow(/does not balance/);
    expect(() => normaliseLines([{ account: 'CASH', debit: 100n, credit: 100n }])).toThrow(
      /exactly one positive side/,
    );
    expect(
      normaliseLines([
        { account: 'CASH', debit: 0n },
        { account: 'BANK', credit: 0n },
      ]),
    ).toEqual([]);
  });
});
