import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { adminApi, apiSend, browserApi, signInUI, todayIST, uniqueEmail } from './helpers';

/**
 * Acceptance steps 1–16 as one serial journey. Every run uses fresh, unique email addresses so it
 * never depends on earlier data. Plans are never changed globally: the quota step uses a
 * per-tenant entitlement override that is removed again after the upgrade.
 */
test.describe.configure({ mode: 'serial' });

const owner = { email: uniqueEmail('owner'), shop: `E2E Seva Kendra ${Date.now().toString(36)}` };
const operator = { email: uniqueEmail('operator'), name: 'Ravi Operator' };
const other = { email: uniqueEmail('other') };
const customerName = `Sunita Devi ${Date.now().toString(36)}`;

let ownerCtx: BrowserContext;
let page: Page;
let admin: APIRequestContext;
const ids: {
  tenant?: string;
  customer?: string;
  aeps?: string;
  pan?: string;
  dmt?: string;
  override?: string;
} = {};

test.beforeAll(async ({ browser }) => {
  ownerCtx = await browser.newContext();
  page = await ownerCtx.newPage();
});

test.afterAll(async () => {
  await ownerCtx?.close();
  await admin?.dispose();
});

async function onboard(p: Page, shopName: string, services: RegExp[]) {
  await expect(p).toHaveURL(/\/onboarding/);
  await expect(p.getByRole('heading', { name: 'Set up your shop' })).toBeVisible();
  await p.getByLabel('Shop name').fill(shopName);
  await p.getByLabel('Your name').fill('Asha Kumari');
  await p.getByLabel('State').selectOption('Bihar');
  await p.getByLabel('District / city').fill('Patna');
  await p.getByLabel(/Contact phone/).fill('9876543210');
  await expect(p.getByText('Unverified', { exact: true })).toBeVisible();
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByRole('heading', { name: 'Which services do you offer?' })).toBeVisible();
  await expect(p.getByText('does not authorise you to provide regulated services')).toBeVisible();
  for (const s of services) await p.getByRole('checkbox', { name: s }).click();
  await expect(p.getByText(`${services.length} selected`)).toBeVisible();
  await p.getByRole('button', { name: 'Create my shop' }).click();
  await expect(p).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test('1. register via email OTP', async () => {
  await signInUI(page, owner.email);
  // A brand-new email has no shop yet, so /me routes to onboarding.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
  const cookies = await ownerCtx.cookies();
  expect(cookies.find((c) => c.name === 'csp2all_sid')?.httpOnly).toBe(true);
  // Tokens are never kept in web storage.
  const stored = await page.evaluate(
    () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  );
  expect(stored).not.toMatch(/csp2all_sid|token/i);
});

test('2–3. create shop and select AEPS, DMT, PAN', async () => {
  await onboard(page, owner.shop, [/^AEPS/, /^Money Transfer \(DMT\)/, /^PAN Services/]);
});

test('4. dashboard shows the selected services', async () => {
  await expect(page.getByTestId('shop-name')).toHaveText(owner.shop);
  const qa = page.getByTestId('quick-actions');
  await expect(qa.getByRole('link', { name: 'AEPS' })).toBeVisible();
  await expect(qa.getByRole('link', { name: 'Money Transfer (DMT)' })).toBeVisible();
  await expect(qa.getByRole('link', { name: 'PAN Services' })).toBeVisible();
  await expect(qa.getByRole('link')).toHaveCount(3);
  await expect(
    page
      .getByText('Transaction value processed for customers')
      .or(page.getByText('This is not your income'))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
  const ctx = await (await browserApi(ownerCtx, 'GET', '/v1/tenant/context')).json();
  ids.tenant = ctx.tenant.id;
  expect(
    ctx.services
      .filter((s: { selected: boolean }) => s.selected)
      .map((s: { code: string }) => s.code)
      .sort(),
  ).toEqual(['AEPS', 'DMT', 'PAN']);
});

test('5. add a customer and a manual AEPS record', async () => {
  await page.getByRole('link', { name: 'Customers' }).first().click();
  await page.getByRole('button', { name: 'Add customer' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill(customerName);
  await dlg.getByLabel(/Phone/).fill('9123456780');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: customerName })).toBeVisible();
  ids.customer = page.url().split('/').pop();

  await page.goto('/app/records/new?service=AEPS');
  await expect(page.getByRole('heading', { name: 'New AEPS record' })).toBeVisible();
  await expect(page.getByText('This is a manual record entered by your shop')).toBeVisible();
  await page.getByRole('combobox', { name: 'Find a customer' }).fill(customerName.split(' ')[0]);
  await page.getByRole('option').getByRole('button', { name: customerName }).click();
  await expect(page.getByTestId('selected-customer')).toHaveText(customerName);
  await page.getByLabel('Operation').selectOption('CASH_WITHDRAWAL');
  await page.getByLabel("Customer's bank").fill('Demo Gramin Bank');
  await page.getByLabel('Transaction amount').fill('5000');
  await page.getByLabel('Customer fee (your charge)').fill('10');
  await page.getByLabel('Expected commission').fill('12.50');
  await expect(page.getByLabel('Amount collected now')).toHaveValue('10');
  await expect(page.getByLabel(/Post to cashbook/)).toBeChecked();
  // Live posting preview: ₹5,000 handed to the customer, ₹10 fee received in cash.
  const preview = page.getByTestId('posting-preview');
  await expect(preview.getByTestId('cash-to-customer')).toHaveText('₹5,000.00');
  await expect(preview.getByTestId('cash-from-customer')).toHaveText('₹10.00');
  await expect(preview).toContainText('−₹4,990.00');
  await page.getByRole('button', { name: 'Save and post to cashbook' }).click();
  await expect(page.getByTestId('record-created')).toBeVisible();
  ids.aeps = page.url().split('/').pop()!.split('?')[0];
  await expect(page.getByText('Successful (reported)').first()).toBeVisible();
  await expect(page.getByTestId('manual-notice')).toBeVisible();
  await expect(page.getByText('Posted to cashbook').first()).toBeVisible();
});

test('6. cash movement is recorded correctly in the cashbook', async () => {
  await page.goto('/app/cashbook');
  await page.getByRole('button', { name: 'Set opening balance' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Amount').fill('20000');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg).toBeHidden();
  const table = page.getByTestId('cashbook-table');
  await expect(table.getByRole('row', { name: /Paid out to customer/ })).toContainText('₹5,000.00');
  await expect(table.getByRole('row', { name: /Collected from customer/ })).toContainText('₹10.00');
  await expect(table.getByRole('row', { name: /Opening balance/ }).first()).toContainText(
    '₹20,000.00',
  );
  // Opening ₹20,000 − payout ₹5,000 + fee ₹10.
  await expect(page.getByTestId('closing-balance')).toHaveText('₹15,010.00');
  const cb = await (
    await browserApi(ownerCtx, 'GET', `/v1/cashbook?date=${todayIST()}&account=CASH`)
  ).json();
  expect(cb.totalOutPaise).toBe(500000);
  expect(cb.totalInPaise).toBe(2000000 + 1000);
});

test('7. PAN application with a follow-up', async () => {
  await page.goto('/app/records/new?service=PAN');
  await page.getByRole('combobox', { name: 'Find a customer' }).fill(customerName.split(' ')[0]);
  await page.getByRole('option').getByRole('button', { name: customerName }).click();
  await page.getByLabel('Application type').selectOption('NEW');
  await page.getByLabel('Applicant name').fill(customerName);
  await page.getByLabel('Acknowledgement number').fill('ACK8812345');
  await expect(page.getByLabel('Status')).toHaveValue('SUBMITTED');
  await page.getByLabel('Government / provider fee').fill('107');
  await page.getByLabel('Customer fee (your charge)').fill('50');
  await page.getByLabel('Follow-up date').fill(todayIST(3));
  await page.getByRole('button', { name: 'Save and post to cashbook' }).click();
  await expect(page.getByTestId('record-created')).toBeVisible();
  ids.pan = page.url().split('/').pop()!.split('?')[0];
  await expect(page.getByText('Submitted').first()).toBeVisible();
  await expect(page.getByText(/Follow up on record #\d+/)).toBeVisible();
  // Move the application along with an allowed transition.
  await page.getByRole('button', { name: 'Mark as In progress' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Status changed to In progress')).toBeVisible();
  await page.goto('/app/follow-ups');
  await expect(page.getByText(/Follow up on record #\d+/)).toBeVisible();
});

test('8. a due and a partial collection', async () => {
  await page.goto('/app/records/new?service=DMT');
  await page.getByRole('combobox', { name: 'Find a customer' }).fill(customerName.split(' ')[0]);
  await page.getByRole('option').getByRole('button', { name: customerName }).click();
  await page.getByLabel('Beneficiary name').fill('Mohan Lal');
  await page.getByLabel('Bank name').fill('State Bank of India');
  // Client-side validation from the shared schema: the full account number is required.
  await page.getByLabel('Account number').fill('4321');
  await page.getByLabel('Transfer amount').fill('2000');
  await page.getByLabel('Customer fee (your charge)').fill('20');
  await page.getByRole('button', { name: 'Save and post to cashbook' }).click();
  await expect(page.getByText('Enter the full account number (9–18 digits)')).toBeVisible();
  await page.getByLabel('Account number').fill('30912345674321');
  await expect(page.getByLabel('Amount collected now')).toHaveValue('2020');
  await page.getByLabel('Amount collected now').fill('1000');
  await expect(page.getByTestId('due-hint')).toContainText('₹1,020.00');
  await page.getByRole('button', { name: 'Save and post to cashbook' }).click();
  await expect(page.getByTestId('record-created')).toBeVisible();
  ids.dmt = page.url().split('/').pop()!.split('?')[0];
  await expect(page.getByText('Partly paid').first()).toBeVisible();

  await page.goto('/app/dues');
  await expect(page.getByTestId('total-dues')).toHaveText('₹1,020.00');
  await page.getByRole('button', { name: 'Record collection' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Collect now').fill('500');
  await dlg.getByRole('button', { name: /^Record/ }).click();
  await expect(page.getByText(/Receipt #\d+ recorded/)).toBeVisible();
  await expect(page.getByTestId('total-dues')).toHaveText('₹520.00');
  await expect(page.getByTestId('receipts-table')).toContainText('₹500.00');
  const rec = await (await browserApi(ownerCtx, 'GET', `/v1/records/${ids.dmt}`)).json();
  expect(rec.amountDuePaise).toBe(52000);
  expect(rec.paymentStatus).toBe('PARTIAL');
});

test('9. invite a restricted operator', async () => {
  await page.goto('/app/staff');
  await expect(page.getByTestId('permission-matrix')).toBeVisible();
  await page.getByRole('button', { name: 'Invite staff' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Email address').fill(operator.email);
  await dlg.getByLabel('Name').fill(operator.name);
  await dlg.getByLabel('Role').selectOption('OPERATOR');
  await dlg.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByTestId('staff-table')).toContainText(operator.email);
  await expect(page.getByTestId('staff-table')).toContainText('Invited');
});

test('10. operator signs in and is limited', async ({ browser }) => {
  const ctx = await browser.newContext();
  const op = await ctx.newPage();
  try {
    await signInUI(op, operator.email);
    await expect(op).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(op.getByTestId('shop-name')).toHaveText(owner.shop);
    const nav = op.getByRole('navigation', { name: 'Main navigation' }).first();
    await expect(nav.getByRole('link', { name: 'Records' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Cashbook' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Staff & permissions' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Subscription' })).toHaveCount(0);
    // Only own records are visible — the owner's three records are not.
    await op.goto('/app/records');
    await expect(op.getByText('No records yet')).toBeVisible();
    // The UI explains denied pages; the API enforces them.
    await op.goto('/app/cashbook');
    await expect(op.getByText('You do not have permission to view this')).toBeVisible();
    const cb = await browserApi(ctx, 'GET', '/v1/cashbook');
    expect(cb.status()).toBe(403);
    expect((await cb.json()).error.code).toBe('PERMISSION_DENIED');
    const staff = await browserApi(ctx, 'GET', '/v1/staff');
    expect(staff.status()).toBe(403);
    const ownerRecord = await browserApi(ctx, 'GET', `/v1/records/${ids.aeps}`);
    expect(ownerRecord.status()).toBe(404);
    const invite = await browserApi(ctx, 'POST', '/v1/staff/invite', {
      email: 'x@example.test',
      displayName: 'X',
      role: 'MANAGER',
    });
    expect(invite.status()).toBe(403);
    // Operators can record work, without cashbook posting rights shown as a choice they lack.
    await op.goto('/app/records/new?service=AEPS');
    await op.getByLabel('Operation').selectOption('BALANCE_ENQUIRY');
    await op.getByRole('button', { name: /Save/ }).first().click();
    await expect(op.getByTestId('record-created')).toBeVisible();
    await op.goto('/app/records');
    await expect(op.getByTestId('records-table').locator('tbody tr')).toHaveCount(1);
  } finally {
    await ctx.close();
  }
});

test('11. reaching a Free-plan limit shows the quota UI', async () => {
  test.setTimeout(15 * 60_000); // may wait out an admin OTP rate-limit window
  admin = await adminApi();
  const ctx = await (await browserApi(ownerCtx, 'GET', '/v1/tenant/context')).json();
  expect(ctx.plan.code).toBe('FREE');
  const used = ctx.usage.recordsThisPeriod;
  const o = await apiSend(admin, 'POST', `/v1/admin/tenants/${ids.tenant}/entitlement-overrides`, {
    key: 'monthlyRecordLimit',
    value: used,
    reason: 'E2E: simulate reaching the monthly record limit',
  });
  expect(o.ok(), await o.text()).toBe(true);
  ids.override = (await o.json()).id;

  await page.goto('/app/records/new?service=AEPS');
  await page.getByLabel('Operation').selectOption('BALANCE_ENQUIRY');
  await page.getByRole('button', { name: /^Save/ }).click();
  await expect(page.getByTestId('quota-reached')).toBeVisible();
  await expect(page.getByTestId('quota-reached')).toContainText('records this month');
  await expect(page.getByRole('link', { name: 'Upgrade' }).first()).toBeVisible();
});

test('12. submit a manual upgrade payment request', async () => {
  await page.goto('/app/subscription');
  await expect(page.getByTestId('current-plan')).toContainText('Free');
  await expect(page.getByTestId('demo-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Growth' }).click();
  const form = page.locator('#pay');
  await expect(form.getByLabel('Plan')).toHaveValue('GROWTH');
  await expect(form.getByLabel('Amount paid')).not.toHaveValue('');
  await form.getByLabel('UTR / transaction reference').fill(`UTR${Date.now()}`);
  await form.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByTestId('payment-submitted')).toBeVisible();
  await expect(page.getByTestId('submissions-table')).toContainText('Under review');
});

test('13. super admin approves the payment', async () => {
  const list = await admin.get('/v1/admin/payment-submissions?status=SUBMITTED&pageSize=100');
  expect(list.ok(), await list.text()).toBe(true);
  const sub = (await list.json()).items.find(
    (s: { tenantId: string }) => s.tenantId === ids.tenant,
  );
  expect(sub, 'submission for this tenant').toBeTruthy();
  expect(sub.planCode).toBe('GROWTH');
  const review = await apiSend(admin, 'POST', `/v1/admin/payment-submissions/${sub.id}/review`, {
    decision: 'APPROVE',
    notes: 'E2E approval',
  });
  expect(review.ok(), await review.text()).toBe(true);
  expect((await review.json()).status).toBe('APPROVED');
  // Remove the temporary limit so the Growth plan's own limits apply.
  const del = await apiSend(
    admin,
    'DELETE',
    `/v1/admin/tenants/${ids.tenant}/entitlement-overrides/${ids.override}`,
  );
  expect(del.ok(), await del.text()).toBe(true);
});

test('14. the UI reflects the upgraded entitlement', async () => {
  await page.goto('/app/subscription');
  await expect(page.getByTestId('current-plan')).toContainText('Growth');
  await expect(page.getByTestId('submissions-table')).toContainText('Approved');
  await expect(page.getByTestId('features')).toContainText('CSV exports');
  await page.goto('/app/reports');
  await page.getByRole('tab', { name: 'Exports' }).click();
  await expect(page.getByTestId('feature-locked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare export' }).click();
  await expect(page.getByTestId('exports-list')).toContainText('Ready', { timeout: 30_000 });
  await expect(
    page.getByTestId('exports-list').getByRole('button', { name: 'Download' }).first(),
  ).toBeVisible();
  const dl = await browserApi(ownerCtx, 'GET', `/v1/exports`);
  const job = (await dl.json()).items[0];
  const link = await browserApi(ownerCtx, 'GET', `/v1/exports/${job.id}/download`);
  expect(link.ok()).toBe(true);
  expect((await link.json()).url).toMatch(/^https?:\/\//);
  // New records are allowed again on the paid plan.
  const ctx = await (await browserApi(ownerCtx, 'GET', '/v1/tenant/context')).json();
  expect(ctx.plan.code).toBe('GROWTH');
  expect(ctx.plan.entitlements.monthlyRecordLimit).toBe(3000);
});

test('15. close the day and inspect reports', async () => {
  await page.goto('/app/closing');
  const expected = await page.getByTestId('expected-cash').innerText();
  await page.getByLabel('Cash counted').fill(expected.replace(/[₹,]/g, ''));
  await expect(page.getByTestId('variance')).toHaveText('₹0.00');
  await page.getByRole('button', { name: 'Close day' }).click();
  await expect(page.getByTestId('day-closed')).toContainText('Day closed');
  // A closed day rejects new postings.
  const late = await browserApi(ownerCtx, 'POST', '/v1/cashbook/adjustments', {
    account: 'CASH',
    direction: 'IN',
    amountPaise: 100,
    businessDate: todayIST(),
    reason: 'after close',
  });
  expect(late.status()).toBe(409);
  expect((await late.json()).error.code).toBe('DAY_CLOSED');

  await page.goto('/app/reports');
  await expect(page.getByText('Income is not the same as money handled')).toBeVisible();
  // Fees ₹10 + ₹50 + ₹20, commission ₹12.50 accrued; principal is excluded.
  await expect(page.getByTestId('net-income')).toHaveText('₹92.50');
  await page.getByRole('tab', { name: 'Trial balance' }).click();
  await expect(page.getByTestId('trial-balance')).toBeVisible();
  await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Day book' }).click();
  await expect(page.getByTestId('daybook')).toContainText('Service record');
  await page.getByRole('tab', { name: 'Operations' }).click();
  await expect(page.getByTestId('ops-table')).toContainText('AEPS');
});

test('16. a second tenant cannot access this data', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await signInUI(p, other.email);
    await onboard(p, `E2E Other Shop ${Date.now().toString(36)}`, [/^Recharge/]);
    for (const path of [`/app/records/${ids.aeps}`, `/app/customers/${ids.customer}`]) {
      await p.goto(path);
      await expect(p.getByText('Not found', { exact: true })).toBeVisible();
    }
    for (const path of [
      `/v1/records/${ids.aeps}`,
      `/v1/records/${ids.dmt}`,
      `/v1/customers/${ids.customer}`,
    ]) {
      const r = await browserApi(ctx, 'GET', path);
      expect(r.status(), path).toBe(404);
    }
    const list = await (await browserApi(ctx, 'GET', '/v1/records')).json();
    expect(list.total).toBe(0);
    const customers = await (
      await browserApi(ctx, 'GET', `/v1/customers?q=${encodeURIComponent(customerName)}`)
    ).json();
    expect(customers.total).toBe(0);
    const edit = await browserApi(ctx, 'PATCH', `/v1/customers/${ids.customer}`, {
      version: 1,
      name: 'Hijacked',
    });
    expect(edit.status()).toBe(404);
    const collect = await browserApi(ctx, 'POST', '/v1/collections', {
      method: 'CASH',
      receivedOn: todayIST(),
      allocations: [{ recordId: ids.dmt, amountPaise: 100 }],
    });
    expect(collect.status()).toBe(404);
    const select = await browserApi(ctx, 'POST', '/v1/auth/select-tenant', {
      tenantId: ids.tenant,
    });
    expect(select.status()).toBe(404);
  } finally {
    await ctx.close();
  }
});
