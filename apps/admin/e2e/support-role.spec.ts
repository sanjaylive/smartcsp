import { expect, test } from '@playwright/test';
import { adminApi, loginViaUi, RUN_ID } from './helpers';

/**
 * A SUPPORT-role admin (created here, enrolling TOTP through the QR/secret screen) must not see
 * admin management or plan publishing, and the API must refuse those routes.
 */
test('SUPPORT admin cannot see admin management or plan actions', async ({ page, browser }) => {
  const email = `e2e-support-${RUN_ID}@example.test`;
  const created = (await adminApi(page, 'POST', '/v1/admin/admins', {
    email,
    role: 'SUPPORT',
  })) as { id: string };

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const sp = await ctx.newPage();
  try {
    await loginViaUi(sp, email); // first sign-in → enrolment path (QR + secret)
    await expect(sp.getByTestId('admin-role')).toHaveText(/support/i);

    const nav = sp.getByRole('navigation', { name: 'Admin sections' });
    await expect(nav.getByRole('link', { name: 'Support sessions' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible();
    for (const hidden of [
      'Admins',
      'Users',
      'Payments',
      'Connectors & health',
      'Background jobs',
    ]) {
      await expect(nav.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
    }

    await sp.goto('/admins');
    await expect(sp.getByText('Permission denied')).toBeVisible();
    await expect(sp.getByRole('button', { name: 'Add admin' })).toHaveCount(0);

    await sp.goto('/plans');
    await expect(sp.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await expect(sp.locator('[id^="plan-"]').first()).toBeVisible();
    await expect(sp.getByRole('button', { name: 'Publish new version' })).toHaveCount(0);
    await expect(sp.getByRole('switch')).toHaveCount(0);
    await expect(sp.getByRole('button', { name: 'Run lifecycle' })).toHaveCount(0);

    await sp.goto('/settings');
    await expect(sp.getByText('Read-only for your role')).toBeVisible();

    // The API enforces it too.
    const res = await sp.request.get('/api/v1/admin/admins');
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'PERMISSION_DENIED',
    );
  } finally {
    await ctx.close();
    // Clean up: disable the temporary support admin.
    await adminApi(page, 'PATCH', `/v1/admin/admins/${created.id}`, { status: 'DISABLED' });
  }
});
