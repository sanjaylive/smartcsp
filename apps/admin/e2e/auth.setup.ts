import { existsSync, mkdirSync } from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { loginViaUi, SUPER_ADMIN_EMAIL, SUPER_ADMIN_TOTP } from './helpers';

const STATE = 'e2e/.auth/super-admin.json';

/**
 * Signs the super admin in through the real UI (email code from Mailpit + TOTP computed here) and
 * saves the session for the other specs. A still-valid saved session is reused to stay well under
 * the API's per-email OTP rate limit when the suite is run repeatedly; set E2E_FRESH_LOGIN=1 to force.
 */
setup('super admin signs in with email code + TOTP', async ({ browser }) => {
  mkdirSync('e2e/.auth', { recursive: true });
  if (existsSync(STATE) && !process.env.E2E_FRESH_LOGIN) {
    const ctx = await browser.newContext({ storageState: STATE });
    const page = await ctx.newPage();
    const res = await page.request.get('/api/v1/admin/auth/me');
    const me = res.ok() ? ((await res.json()) as { mfaVerified: boolean; email: string }) : null;
    await ctx.close();
    if (me?.mfaVerified && me.email === SUPER_ADMIN_EMAIL) {
      setup
        .info()
        .annotations.push({ type: 'session', description: 'Reused saved super-admin session' });
      return;
    }
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginViaUi(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_TOTP);
  await expect(page.getByTestId('admin-role')).toHaveText(/super admin/i);
  await ctx.storageState({ path: STATE });
  await ctx.close();
});
