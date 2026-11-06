import type { PrincipalDirection } from '@csp2all/shared';
import { AppError } from '../../common/errors';
import { fundAccountFor, type LineInput } from '../ledger/ledger.service';

export interface RecordAmounts {
  direction: PrincipalDirection;
  principal: bigint;
  fee: bigint;
  expectedCommission: bigint;
  collected: bigint;
  paymentMethod: string; // CASH | UPI | BANK | NONE
  principalMethod: string; // CASH | UPI | BANK
}

/**
 * What the customer owes the shop for this record:
 *   PAYOUT  (shop hands principal to customer; provider credits the shop's wallet) → fee only
 *   COLLECT (shop collects principal and pays provider from its wallet)            → principal + fee
 *   NONE                                                                            → fee only
 */
export function receivableFor(
  direction: PrincipalDirection,
  principal: bigint,
  fee: bigint,
): bigint {
  return direction === 'COLLECT' ? principal + fee : fee;
}

export function paymentStatusFor(
  receivable: bigint,
  paid: bigint,
): 'NOT_APPLICABLE' | 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (receivable === 0n) return 'NOT_APPLICABLE';
  if (paid >= receivable) return 'PAID';
  if (paid === 0n) return 'UNPAID';
  return 'PARTIAL';
}

export function validateAmounts(a: RecordAmounts) {
  const receivable = receivableFor(a.direction, a.principal, a.fee);
  if (a.collected > receivable) {
    throw new AppError(
      'AMOUNT_EXCEEDS_DUE',
      'Amount collected is more than the customer owes',
      { receivablePaise: Number(receivable) },
      { amountCollectedPaise: ['Cannot exceed the amount owed'] },
    );
  }
  if (a.collected > 0n && a.paymentMethod === 'NONE') {
    throw new AppError('VALIDATION_FAILED', 'Choose how the amount was collected', undefined, {
      paymentMethod: ['Required when an amount is collected'],
    });
  }
  if (a.direction === 'NONE' && a.principal > 0n) {
    throw new AppError('VALIDATION_FAILED', 'This service has no transaction amount', undefined, {
      principalPaise: ['Must be 0 for this operation'],
    });
  }
  return { receivable, due: receivable - a.collected };
}

/**
 * Journal lines for posting a record's explicitly recorded money movement (see docs/FINANCE.md).
 * Principal never touches income accounts; only the customer fee and commission are income.
 */
export function recordPostingLines(a: RecordAmounts): LineInput[] {
  const { due } = validateAmounts(a);
  const lines: LineInput[] = [];
  if (a.principal > 0n) {
    const principalAcct = fundAccountFor(a.principalMethod);
    if (a.direction === 'PAYOUT') {
      lines.push({
        account: 'FLOAT',
        debit: a.principal,
        memo: 'Provider credit for customer payout',
      });
      lines.push({ account: principalAcct, credit: a.principal, memo: 'Paid out to customer' });
    } else if (a.direction === 'COLLECT') {
      lines.push({ account: 'FLOAT', credit: a.principal, memo: 'Paid via provider wallet' });
    }
  }
  if (a.collected > 0n)
    lines.push({
      account: fundAccountFor(a.paymentMethod),
      debit: a.collected,
      memo: 'Collected from customer',
    });
  if (due > 0n) lines.push({ account: 'RECEIVABLE', debit: due, memo: 'Customer due' });
  if (a.fee > 0n) lines.push({ account: 'FEE_INCOME', credit: a.fee, memo: 'Customer fee' });
  if (a.expectedCommission > 0n) {
    lines.push({
      account: 'COMMISSION_RECEIVABLE',
      debit: a.expectedCommission,
      memo: 'Commission expected',
    });
    lines.push({
      account: 'COMMISSION_INCOME',
      credit: a.expectedCommission,
      memo: 'Commission accrued',
    });
  }
  return lines;
}

/** Net cash change for the counter (shown to the operator before saving). */
export function cashEffect(a: RecordAmounts) {
  let cash = 0n;
  if (a.direction === 'PAYOUT' && a.principalMethod === 'CASH') cash -= a.principal;
  if (a.paymentMethod === 'CASH') cash += a.collected;
  return cash;
}
