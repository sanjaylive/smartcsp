import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../config/config';

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

export const hmac = (key: string, s: string) => createHmac('sha256', key).update(s).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 256-bit URL-safe random token. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const numericCode = (digits = 6) =>
  randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');

export const hashIp = (ip: string | undefined) =>
  ip ? hmac(config().IP_HASH_SALT, ip).slice(0, 32) : null;

/** AES-256-GCM with the separately managed SECRETS_ENCRYPTION_KEY. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(config().SECRETS_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1') throw new Error('Unsupported secret format');
  const key = Buffer.from(config().SECRETS_ENCRYPTION_KEY, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}

// ---------------------------------------------------------------------------- TOTP (RFC 6238)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Returns the matched time step (for replay protection) or null. Accepts ±1 step of drift. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): number | null {
  const step = Math.floor(now / 1000 / 30);
  for (const s of [step, step - 1, step + 1]) {
    const expected = totpAt(secretB32, s);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code.padStart(6, '0').slice(0, 6))))
      return s;
  }
  return null;
}
