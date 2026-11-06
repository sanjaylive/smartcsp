import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  expect,
  request,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://localhost:4610';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:56626';
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'dev.admin@example.test';
export const ADMIN_TOTP_SECRET = process.env.E2E_ADMIN_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DP';

export const RUN_ID = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
export const uniqueEmail = (who: string) => `e2e.${who}.${RUN_ID}@example.test`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls Mailpit for the newest message to `email` created after `since`; the subject starts with the code. */
export async function readOtp(email: string, since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const json = (await res.json()) as { messages: Array<{ Subject: string; Created: string }> };
    const msg = json.messages.find(
      (m) => new Date(m.Created).getTime() >= since - 2000 && /^\d{6}/.test(m.Subject),
    );
    if (msg) return msg.Subject.slice(0, 6);
    await sleep(500);
  }
  throw new Error(`No OTP email for ${email}`);
}

/** Email OTP sign-in through the UI (step 1 of the acceptance flow). */
export async function signInUI(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('checkbox').check();
  const since = Date.now();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  await expect(page.getByText('If this email can be used, a code has been sent')).toBeVisible();
  const code = await readOtp(email, since);
  // Filling the first box with the whole code exercises the paste/autofill path.
  await page.getByLabel('Digit 1 of 6').fill(code);
}

// ------------------------------------------------------------------------------------- TOTP

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, step = Math.floor(Date.now() / 1000 / 30)): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// ------------------------------------------------------------------------------------- API helpers

async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const state = await ctx.storageState();
  let c = state.cookies.find((x) => x.name === 'csp2all_csrf')?.value;
  if (!c) {
    await ctx.get('/v1/auth/csrf');
    c = (await ctx.storageState()).cookies.find((x) => x.name === 'csp2all_csrf')?.value;
  }
  return c!;
}

/** Unsafe API call with the double-submit CSRF header, using a request context's cookies. */
export async function apiSend(
  ctx: APIRequestContext,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
) {
  const headers = { 'X-CSRF-Token': await csrfOf(ctx) };
  return ctx.fetch(path, { method, data, headers });
}

/** Same as apiSend but through a browser context (cookies are those of the signed-in page). */
export async function browserApi(
  context: BrowserContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
) {
  const csrf = (await context.cookies()).find((c) => c.name === 'csp2all_csrf')?.value ?? '';
  return context.request.fetch(`/api${path}`, {
    method,
    data,
    headers: method === 'GET' ? {} : { 'X-CSRF-Token': csrf },
  });
}

const ADMIN_STATE = join(__dirname, '.auth', 'admin.json');

/**
 * Super-admin API session: email OTP (read from Mailpit) + TOTP computed here. The cookie jar is
 * cached under e2e/.auth so repeated runs do not hit the hourly OTP limit.
 */
export async function adminApi(): Promise<APIRequestContext> {
  if (existsSync(ADMIN_STATE)) {
    const cached = await request.newContext({
      baseURL: API_URL,
      storageState: JSON.parse(readFileSync(ADMIN_STATE, 'utf8')),
    });
    const me = await cached.get('/v1/admin/auth/me');
    if (me.ok() && (await me.json()).mfaVerified) return cached;
    await cached.dispose();
  }
  const ctx = await request.newContext({ baseURL: API_URL });
  let since = Date.now();
  let r = await ctx.post('/v1/admin/auth/otp/request', {
    data: { email: ADMIN_EMAIL, consent: true },
  });
  // The shared dev admin may be rate-limited by other activity; wait out short windows.
  for (let i = 0; i < 3 && r.status() === 429; i++) {
    const wait = Number((await r.json()).error?.details?.retryAfterSeconds ?? 60);
    if (wait > 300) break;
    await sleep((wait + 2) * 1000);
    since = Date.now();
    r = await ctx.post('/v1/admin/auth/otp/request', {
      data: { email: ADMIN_EMAIL, consent: true },
    });
  }
  expect(r.status(), await r.text()).toBe(202);
  const { challengeId } = await r.json();
  const code = await readOtp(ADMIN_EMAIL, since);
  const v = await ctx.post('/v1/admin/auth/otp/verify', {
    data: { challengeId, email: ADMIN_EMAIL, code, client: 'web' },
  });
  expect(v.status(), await v.text()).toBe(200);
  // A TOTP step can be used once; if this step was already consumed, wait for the next one.
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const t = await apiSend(ctx, 'POST', '/v1/admin/auth/totp/verify', {
      code: totp(ADMIN_TOTP_SECRET),
    });
    ok = t.ok();
    if (!ok) await sleep(31_000 - (Date.now() % 30_000));
  }
  expect(ok, 'admin TOTP verification').toBe(true);
  mkdirSync(dirname(ADMIN_STATE), { recursive: true });
  writeFileSync(ADMIN_STATE, JSON.stringify(await ctx.storageState()));
  return ctx;
}

export function todayIST(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
