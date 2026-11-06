import { csvCell, toCsv } from '../../src/common/csv';
import { base32Decode, base32Encode, totpAt, verifyTotp } from '../../src/common/crypto';
import { sanitize } from '../../src/common/audit';

describe('CSV export safety', () => {
  it.each([
    ['=HYPERLINK("http://evil","x")', `"'=HYPERLINK(""http://evil"",""x"")"`],
    ['+91 98765', `"'+91 98765"`],
    ['-cmd|calc', `"'-cmd|calc"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\tTab', `"'\tTab"`],
    ['-1250.00', '"-1250.00"'],
    ['Normal, "quoted"', '"Normal, ""quoted"""'],
    [null, '""'],
  ])('%p is neutralised', (input, expected) => expect(csvCell(input)).toBe(expected));
  it('starts with a BOM and uses CRLF', () => expect(toCsv(['a'], [[1]])).toBe('﻿"a"\r\n"1"\r\n'));
});

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vector (SHA-1, T=59)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
  });
  it('round-trips base32 and accepts ±1 step only', () => {
    const s = base32Encode(Buffer.from('csp2all-secret-key!!'));
    expect(base32Decode(s).toString()).toBe('csp2all-secret-key!!');
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(s, totpAt(s, step), now)).toBe(step);
    expect(verifyTotp(s, totpAt(s, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(s, totpAt(s, step + 3), now)).toBeNull();
  });
});

describe('audit sanitisation', () => {
  it('redacts secret-looking keys', () => {
    expect(
      sanitize({ code: '123456', nested: { refreshToken: 'x', ok: 1 }, credentials: { a: 'b' } }),
    ).toEqual({
      code: '[redacted]',
      nested: { refreshToken: '[redacted]', ok: 1 },
      credentials: '[redacted]',
    });
  });
});
