import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRupeesToPaise,
  formatINR,
  paiseToDecimalString,
  detectSensitiveNumber,
  verhoeffValid,
  buildDetailsSchema,
  SERVICE_REGISTRY,
  effectivePermissions,
  canTransition,
  localDate,
  monthPeriodKey,
  en,
  hi,
  recordCreateSchema,
} from '../dist/index.js';

test('parses rupees into integer paise without floats', () => {
  assert.equal(parseRupeesToPaise('1,23,456.78'), 12345678);
  assert.equal(parseRupeesToPaise('₹ 0.1'), 10);
  assert.equal(parseRupeesToPaise('0.29'), 29);
  assert.equal(parseRupeesToPaise('1.005'), null);
  assert.equal(parseRupeesToPaise('-5'), null);
  assert.equal(parseRupeesToPaise('abc'), null);
});

test('formats INR with Indian grouping', () => {
  assert.equal(formatINR(12345678), '₹1,23,456.78');
  assert.equal(formatINR(100), '₹1.00');
  assert.equal(formatINR(-50000), '−₹500.00');
  assert.equal(formatINR(1234567890123n), '₹12,34,56,78,901.23');
  assert.equal(paiseToDecimalString(-5), '-0.05');
});

test('detects Aadhaar-like (Verhoeff) and card-like (Luhn) numbers only', () => {
  assert.equal(verhoeffValid('234123412346'), true);
  assert.equal(detectSensitiveNumber('aadhaar 2341 2341 2346'), 'AADHAAR_NUMBER');
  assert.equal(detectSensitiveNumber('RRN 234123412345'), null); // fails Verhoeff
  assert.equal(detectSensitiveNumber('card 4111 1111 1111 1111'), 'CARD_NUMBER');
  assert.equal(detectSensitiveNumber('call 9876543210'), null);
});

test('service detail schemas are strict and validated', () => {
  const dmt = buildDetailsSchema(SERVICE_REGISTRY.DMT.fields);
  const ok = dmt.safeParse({
    beneficiaryName: 'Asha',
    bankName: 'Demo Bank',
    accountNumber: '1234 5678 9012',
  });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.accountNumber, '123456789012');
  assert.equal(
    dmt.safeParse({ beneficiaryName: 'Asha', bankName: 'Demo Bank', accountNumber: '1234' })
      .success,
    false,
  );
  assert.equal(
    dmt.safeParse({ beneficiaryName: 'Asha', bankName: 'X', accountNumber: '123456789', pin: '1' })
      .success,
    false,
  );
  const aeps = buildDetailsSchema(SERVICE_REGISTRY.AEPS.fields);
  assert.equal(
    aeps.safeParse({ operationType: 'CASH_WITHDRAWAL', fingerprint: 'x' }).success,
    false,
  );
  assert.equal(
    SERVICE_REGISTRY.AEPS.principalDirection({ operationType: 'CASH_WITHDRAWAL' }),
    'PAYOUT',
  );
  assert.equal(
    SERVICE_REGISTRY.AEPS.principalDirection({ operationType: 'BALANCE_ENQUIRY' }),
    'NONE',
  );
});

test('record schema rejects floating point money', () => {
  const r = recordCreateSchema.safeParse({
    serviceCode: 'AEPS',
    txnDate: '2026-11-06',
    opStatus: 'SUCCESSFUL',
    principalPaise: 10.5,
  });
  assert.equal(r.success, false);
});

test('permissions: owner-only powers cannot be granted', () => {
  const p = effectivePermissions(
    'OPERATOR',
    ['staff.manage', 'records.view_all'],
    ['records.post'],
  );
  assert.equal(p.has('staff.manage'), false);
  assert.equal(p.has('records.view_all'), true);
  assert.equal(p.has('records.post'), false);
});

test('status transitions', () => {
  assert.equal(canTransition('TRANSACTION', 'SUCCESSFUL', 'FAILED'), true);
  assert.equal(canTransition('TRANSACTION', 'FAILED', 'SUCCESSFUL'), false);
  assert.equal(canTransition('APPLICATION', 'REJECTED', 'SUBMITTED'), true);
});

test('tenant timezone dates', () => {
  const instant = new Date('2026-11-05T19:00:00Z'); // 00:30 IST on 6 Nov
  assert.equal(localDate(instant, 'Asia/Kolkata'), '2026-11-06');
  assert.equal(monthPeriodKey(new Date('2026-10-31T19:00:00Z')), '2026-11');
});

test('Hindi dictionary covers every English key', () => {
  for (const k of Object.keys(en)) assert.ok(hi[k], `missing hi key ${k}`);
});
