import { expect, test, type Page } from '@playwright/test';
import { adminApi, createTenant, RUN_ID, type TestTenant } from './helpers';

test.describe.configure({ mode: 'serial' });

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await createTenant(`E2E Seva ${RUN_ID}`);
});

async function openTenant(page: Page) {
  await page.goto(`/tenants/${tenant.id}`);
  await expect(page.getByTestId('tenant-name')).toHaveText(tenant.name);
}

test('overview loads with platform figures', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(page.getByTestId('overview')).toBeVisible();
  await expect(page.getByText('Shops (tenants)')).toBeVisible();
  await expect(page.getByTestId('admin-badge').first()).toHaveText(/admin/i);
});

test('every console page renders without a load error', async ({ page }) => {
  const pages: [string, string | RegExp][] = [
    ['/tenants', 'Tenants'],
    ['/users', 'Users'],
    ['/plans', 'Plans'],
    ['/payments', 'Manual payments'],
    ['/services', 'Service catalog'],
    ['/connectors', 'Connectors & health'],
    ['/emails', 'Email delivery'],
    ['/jobs', 'Background jobs'],
    ['/announcements', 'Announcements'],
    ['/audit', 'Audit log'],
    ['/settings', 'Settings'],
    ['/admins', 'Platform admins'],
    ['/support', 'Support sessions'],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByText('Could not load this data')).toHaveCount(0);
    await expect(page.getByText('Permission denied')).toHaveCount(0);
  }
  // The Pay2All notice lists the missing prerequisites.
  await page.goto('/connectors');
  await expect(page.getByText('Pay2All live connector is disabled')).toBeVisible();
  await expect(page.getByText(/Authentication and request-signing specification/)).toBeVisible();
});

test('tenant search and detail', async ({ page }) => {
  await page.goto('/tenants');
  await page.getByLabel('Search tenants').fill(RUN_ID);
  const link = page.getByRole('link', { name: tenant.name });
  await expect(link).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2); // header + our tenant
  await link.click();
  await expect(page.getByTestId('tenant-name')).toHaveText(tenant.name);
  await expect(page.getByTestId('tenant-status')).toHaveText(/active/i);
  await expect(page.getByTestId('tenant-plan')).toBeVisible();
  await expect(page.getByText(tenant.ownerEmail)).toBeVisible();
  // Tenant details never include customer or record data.
  await expect(page.getByText('E2E Walk-in')).toHaveCount(0);
});

test('suspend and restore a tenant with a reason', async ({ page }) => {
  await openTenant(page);
  await page.getByRole('button', { name: 'Suspend' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Suspend ${tenant.name}?`);
  const confirm = dialog.getByRole('button', { name: 'Suspend shop' });
  await expect(confirm).toBeDisabled(); // reason required
  await dialog.getByLabel(/Reason/).fill('E2E smoke test suspension');
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('tenant-status')).toHaveText(/suspended/i);
  await expect(page.getByText('Reason: E2E smoke test suspension')).toBeVisible();

  await page.getByRole('button', { name: 'Restore' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Reason/)
    .fill('E2E smoke test restore');
  await page.getByRole('dialog').getByRole('button', { name: 'Restore shop' }).click();
  await expect(page.getByTestId('tenant-status')).toHaveText(/active/i);
});

test('add and revoke an entitlement override', async ({ page }) => {
  await openTenant(page);
  await page.getByRole('button', { name: 'Add override' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Entitlement').selectOption('monthlyRecordLimit');
  await dialog.getByLabel('Value', { exact: false }).first().fill('777');
  await dialog.getByLabel(/Reason/).fill('E2E support credit');
  await dialog.getByRole('button', { name: 'Add override' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByTestId('override-row').filter({ hasText: 'E2E support credit' });
  await expect(row).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('usage-records')).toContainText('/ 777');

  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke override' }).click();
  await expect(row).toHaveAttribute('data-active', 'false');
  await expect(row).toContainText('Revoked');
  await expect(page.getByTestId('usage-records')).not.toContainText('/ 777');
});

test('usage adjustment is applied once', async ({ page }) => {
  await openTenant(page);
  const before = await page.getByTestId('usage-records').innerText();
  const used = Number(before.split('/')[0].trim());
  await page.getByRole('button', { name: 'Adjust usage' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Change in record count').fill('2');
  await dialog.getByLabel(/Reason/).fill('E2E usage adjustment');
  await dialog.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('usage-records')).toContainText(`${used + 2} /`);
});

test('support session: start, view records read-only, end', async ({ page }) => {
  await openTenant(page);
  await page.getByRole('button', { name: 'Start support session' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The shop will see this');
  const start = dialog.getByRole('button', { name: 'Start read-only session' });
  await dialog.getByLabel(/Reason/).fill('short');
  await expect(start).toBeDisabled(); // reason needs ≥ 10 chars
  await dialog.getByLabel(/Reason/).fill(`E2E ticket #${RUN_ID}: verify recharge entry`);
  await dialog.getByLabel('Duration').selectOption('15');
  await start.click();

  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
  const banner = page.getByTestId('readonly-banner');
  await expect(banner).toContainText('Read-only support access — visible to the shop');
  await expect(page.getByTestId('session-countdown')).toHaveText(/1[45]:\d\d remaining/);
  await expect(page.getByTestId('support-banner')).toBeVisible(); // global header banner

  if (tenant.recordId) {
    const row = page.getByTestId('support-record-row').first();
    await expect(row).toContainText('E2E Walk-in');
    await row.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/records/${tenant.recordId}$`));
    await expect(page.getByTestId('support-record-detail')).toBeVisible();
    await expect(page.getByTestId('readonly-banner')).toBeVisible();
    // Sensitive subscriber number is masked.
    await expect(page.getByText('9876543210')).toHaveCount(0);
    // Read-only: no editing controls on the record view.
    for (const name of [/edit/i, /save/i, /post/i, /reverse/i, /delete/i])
      await expect(
        page.getByTestId('support-record-detail').getByRole('button', { name }),
      ).toHaveCount(0);
    await page.getByRole('link', { name: 'Shop records' }).click();
  } else {
    await expect(page.getByText('No records found')).toBeVisible();
  }

  await page.getByTestId('end-session').click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByTestId('support-banner')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: `E2E ticket #${RUN_ID}` })).toContainText(
    /Ended/,
  );
});

test('request deletion requires typing the shop name', async ({ page }) => {
  await openTenant(page);
  await page.getByRole('button', { name: 'Request deletion' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Request deletion' });
  await dialog.getByLabel(/Reason/).fill('E2E cleanup of the smoke-test shop');
  await dialog.getByLabel(/Type .* to confirm/).fill(`${tenant.name} (wrong)`);
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type .* to confirm/).fill(tenant.name);
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('tenant-status')).toHaveText(/pending deletion/i);
});

test('publish a new version of a non-default plan (keep current version)', async ({ page }) => {
  const plans = (await adminApi(page, 'GET', '/v1/admin/plans')) as {
    items: { code: string; isDefault: boolean; isActive: boolean; versions: unknown[] }[];
  };
  const plan =
    plans.items.find((p) => !p.isDefault && p.isActive) ?? plans.items.find((p) => !p.isDefault);
  test.skip(!plan, 'No non-default plan exists');
  const before = plan!.versions.length;

  await page.goto('/plans');
  await page.getByTestId(`publish-${plan!.code}`).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Publish new version of ${plan!.code}`);
  // Prefilled from the current version.
  await expect(dialog.getByLabel('Display name')).not.toHaveValue('');
  await dialog.getByLabel('Description').fill(`E2E smoke version ${RUN_ID}`);
  await expect(dialog.getByText('Keep their current version (grandfather)')).toBeVisible();
  await dialog.getByLabel(/Keep their current version/).check();
  await dialog.getByRole('button', { name: /^Publish v\d+$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId(`version-row-${plan!.code}`)).toHaveCount(before + 1);
  await expect(page.getByTestId(`version-row-${plan!.code}`).first()).toContainText('Current');
  await expect(page.getByTestId(`version-row-${plan!.code}`).first()).toContainText(
    'Keep current version',
  );
});
