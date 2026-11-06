import { createHmac, randomUUID } from 'node:crypto';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://localhost:4610';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:56626';
export const SUPER_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'dev.admin@example.test';
export const SUPER_ADMIN_TOTP = process.env.E2E_ADMIN_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DP';
export const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

// ----------------------------------------------------------------------------- TOTP (RFC 6238)

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret: string, at = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString();
  return code.padStart(digits, '0');
}

/** Waits until the start of the next 30-second TOTP window (codes are single-use per window). */
export async function nextTotpWindow(): Promise<void> {
  const ms = 30_000 - (Date.now() % 30_000) + 300;
  await new Promise((r) => setTimeout(r, ms));
}

// ----------------------------------------------------------------------------- Mailpit

/** Polls Mailpit for the newest code sent to `email` after `since` (Subject starts with the code). */
export async function mailCode(email: string, since: number, timeoutMs = 20_000): Promise<string> {
  const ctx = await request.newContext();
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await ctx.get(`${MAILPIT_URL}/api/v1/search`, {
        params: { query: `to:${email}` },
      });
      if (res.ok()) {
        const body = (await res.json()) as { messages: { Subject: string; Created: string }[] };
        const fresh = body.messages
          .filter((m) => new Date(m.Created).getTime() >= since - 2000)
          .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
        const m = fresh[0]?.Subject.match(/^(\d{6})/);
        if (m) return m[1];
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`No sign-in code email for ${email} in Mailpit`);
  } finally {
    await ctx.dispose();
  }
}

// ----------------------------------------------------------------------------- admin login via UI

/**
 * Full admin sign-in through the UI: email → Mailpit code → TOTP (enrol via the displayed secret if
 * needed). Returns the TOTP secret used.
 */
export async function loginViaUi(page: Page, email: string, knownSecret?: string): Promise<string> {
  await page.goto('/login');
  await expect(page.getByTestId('admin-badge').first()).toBeVisible();
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel(/authorised CSP2All administrator/).check();
  const since = Date.now();
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
  await expect(page.getByLabel('Email code')).toBeVisible();
  const code = await mailCode(email, since);
  await page.getByLabel('Email code').fill(code);
  await page.getByRole('button', { name: 'Verify code' }).click();

  const totpInput = page.getByLabel('Authenticator code');
  await expect(totpInput).toBeVisible();
  let secret = knownSecret;
  const enrol = page.getByTestId('totp-secret');
  if (await enrol.isVisible()) {
    // Enrolment: the QR code and the text secret are shown.
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    secret = (await enrol.getAttribute('data-secret')) ?? undefined;
  }
  if (!secret) throw new Error('No TOTP secret available');

  for (let attempt = 0; attempt < 2; attempt++) {
    await totpInput.fill(totp(secret));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
    const ok = await page
      .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    if (attempt === 1) throw new Error('TOTP verification failed twice');
    // The code for this window may already have been used (replay protection) — wait for the next.
    await nextTotpWindow();
  }
  await expect(page.getByTestId('admin-role')).toBeVisible();
  return secret;
}

// ----------------------------------------------------------------------------- direct API helpers

/** Calls the admin API through the app's proxy using the page's cookies (+ CSRF double-submit). */
export async function adminApi(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'csp2all_csrf')?.value ?? '';
  const res = await page.request.fetch(`/api${path}`, {
    method,
    data,
    headers: method === 'GET' ? {} : { 'X-CSRF-Token': csrf },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${JSON.stringify(body)}`);
  return body;
}

export interface TestTenant {
  id: string;
  name: string;
  ownerEmail: string;
  recordId: string | null;
}

/** Creates a fresh shop through the tenant API (mobile bearer flow) with one record. */
export async function createTenant(name: string): Promise<TestTenant> {
  const api: APIRequestContext = await request.newContext({ baseURL: API_URL });
  try {
    const email = `e2e-owner-${RUN_ID}@example.test`;
    const since = Date.now();
    const req = await api.post('/v1/auth/otp/request', { data: { email, consent: true } });
    expect(req.status(), await req.text()).toBe(202);
    const { challengeId } = (await req.json()) as { challengeId: string };
    const code = await mailCode(email, since);
    const ver = await api.post('/v1/auth/otp/verify', {
      data: { challengeId, email, code, client: 'mobile', deviceName: 'e2e' },
    });
    expect(ver.ok(), await ver.text()).toBeTruthy();
    const token = ((await ver.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const shop = await api.put('/v1/onboarding/shop', {
      headers: auth,
      data: { shopName: name, ownerName: 'E2E Owner', state: 'Karnataka', district: 'Mysuru' },
    });
    expect(shop.ok(), await shop.text()).toBeTruthy();
    const svc = await api.put('/v1/onboarding/services', {
      headers: auth,
      data: { services: ['RECHARGE'] },
    });
    expect(svc.ok(), await svc.text()).toBeTruthy();
    const done = await api.post('/v1/onboarding/complete', { headers: auth, data: {} });
    expect(done.ok(), await done.text()).toBeTruthy();
    const tenantId = ((await done.json()) as { tenantId: string }).tenantId;

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const rec = await api.post('/v1/records', {
      headers: { ...auth, 'Idempotency-Key': `e2e-${randomUUID()}` },
      data: {
        serviceCode: 'RECHARGE',
        txnDate: today,
        opStatus: 'SUCCESSFUL',
        principalPaise: 19900,
        customerFeePaise: 0,
        paymentMethod: 'CASH',
        amountCollectedPaise: 19900,
        walkInName: 'E2E Walk-in',
        details: { rechargeType: 'PREPAID', operator: 'JIO', subscriberNumber: '9876543210' },
      },
    });
    const recordId = rec.ok() ? ((await rec.json()) as { id: string }).id : null;
    if (!rec.ok()) console.warn(`Record creation failed (${rec.status()}): ${await rec.text()}`);
    return { id: tenantId, name, ownerEmail: email, recordId };
  } finally {
    await api.dispose();
  }
}
