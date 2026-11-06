import {
  addStaff,
  aepsRecord,
  createAdmin,
  onboard,
  setup,
  today,
  type Client,
  type TestCtx,
} from '../helpers';

let t: TestCtx;
let admin: Awaited<ReturnType<Awaited<ReturnType<typeof createAdmin>>['session']>>;
beforeAll(async () => {
  t = await setup();
  admin = await (await createAdmin(t)).session();
});
afterAll(async () => t.close());

describe('Quotas, upgrade and downgrade', () => {
  let owner: Client;
  let tenantId: string;
  beforeAll(async () => ({ client: owner, tenantId } = await onboard(t, ['AEPS', 'DMT', 'PAN'])));

  it('enforces the monthly record limit atomically under concurrency', async () => {
    await admin
      .post(`/v1/admin/tenants/${tenantId}/entitlement-overrides`, {
        key: 'monthlyRecordLimit',
        value: 5,
        reason: 'Concurrency test',
      })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => owner.post('/v1/records', aepsRecord({ post: false }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    const rejected = results.filter((r) => r.status === 402);
    expect(rejected).toHaveLength(7);
    expect(rejected[0].body.error).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      details: { metric: 'RECORDS_CREATED', limit: 5 },
    });
    const usage = (await owner.get('/v1/subscription').expect(200)).body.usage;
    expect(usage.recordsThisPeriod).toBe(5);
    expect(usage.periodTimezone).toBe('Asia/Kolkata');
  });

  it('usage adjustments are idempotent', async () => {
    const period = (await owner.get('/v1/subscription').expect(200)).body.usage.periodKey;
    const body = {
      periodKey: period,
      delta: -2,
      reason: 'Support credit',
      idempotencyKey: 'credit-0001',
    };
    expect(
      (await admin.post(`/v1/admin/tenants/${tenantId}/usage-adjustments`, body).expect(201)).body
        .applied,
    ).toBe(true);
    expect(
      (await admin.post(`/v1/admin/tenants/${tenantId}/usage-adjustments`, body).expect(201)).body
        .applied,
    ).toBe(false);
    expect((await owner.get('/v1/subscription').expect(200)).body.usage.recordsThisPeriod).toBe(3);
  });

  it('manual upgrade: submit payment → admin approves → entitlements change', async () => {
    const plans = (await owner.get('/v1/plans').expect(200)).body.items;
    const growth = plans.find((p: { code: string }) => p.code === 'GROWTH');
    expect(growth.current.isDemoDefault).toBe(true);
    expect(growth.quotes.MONTHLY.totalPaise).toBe(49900 + 8982); // ₹499 + 18% GST
    await owner.post('/v1/exports', { type: 'RECORDS' }).expect(402); // Free: no exports

    const sub = (
      await owner
        .post('/v1/subscription/payment-submissions', {
          planCode: 'GROWTH',
          billingCycle: 'MONTHLY',
          method: 'UPI',
          payerReference: 'UPI-REF-778899',
          paidOn: today(),
          amountPaise: growth.quotes.MONTHLY.totalPaise,
        })
        .expect(201)
    ).body;
    expect(sub).toMatchObject({ status: 'SUBMITTED', amountMatchesQuote: true });
    const queue = (await admin.get('/v1/admin/payment-submissions').expect(200)).body.items;
    expect(queue.find((q: { id: string }) => q.id === sub.id)).toMatchObject({
      planCode: 'GROWTH',
      amountMatches: true,
    });

    await admin
      .post(`/v1/admin/payment-submissions/${sub.id}/review`, {
        decision: 'APPROVE',
        notes: 'UPI verified',
      })
      .expect(200);
    await admin
      .post(`/v1/admin/payment-submissions/${sub.id}/review`, { decision: 'APPROVE' })
      .expect(409); // no double approval

    const after = (await owner.get('/v1/subscription').expect(200)).body;
    expect(after.plan.planCode ?? after.effective.planCode).toBe('GROWTH');
    expect(after.subscription).toMatchObject({ status: 'ACTIVE', billingCycle: 'MONTHLY' });
    expect(after.effective.entitlements.exportsEnabled).toBe(true);
    expect(after.events.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['CREATED', 'ACTIVATED']),
    );
    await owner.post('/v1/exports', { type: 'RECORDS' }).expect(201);
    const notes = (await owner.get('/v1/notifications').expect(200)).body.items.map(
      (n: { title: string }) => n.title,
    );
    expect(notes.join(' ')).toMatch(/Growth plan activated/);
  });

  it('expiry → grace → downgrade to Free keeps all history readable', async () => {
    const before = (await owner.get('/v1/records?pageSize=100').expect(200)).body.total;
    await t.owner.subscription.update({
      where: { tenantId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    await admin.post('/v1/admin/subscriptions/run-lifecycle').expect(200);
    let s = (await owner.get('/v1/subscription').expect(200)).body;
    expect(s.subscription.status).toBe('GRACE');
    expect(s.effective.entitlements.exportsEnabled).toBe(true); // still paid features during grace

    await t.owner.subscription.update({
      where: { tenantId },
      data: { graceEndsAt: new Date(Date.now() - 1000) },
    });
    await admin.post('/v1/admin/subscriptions/run-lifecycle').expect(200);
    s = (await owner.get('/v1/subscription').expect(200)).body;
    expect(s.effective.planCode).toBe('FREE');
    expect(s.events.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['GRACE_STARTED', 'EXPIRED', 'DOWNGRADED']),
    );
    expect((await owner.get('/v1/records?pageSize=100').expect(200)).body.total).toBe(before);
    await owner.post('/v1/exports', { type: 'RECORDS' }).expect(402);
    expect(s.historyPolicy).toMatch(/stay readable/);
  });

  it('plan changes are versioned; existing subscribers keep their version unless migrated', async () => {
    const plans = (await admin.get('/v1/admin/plans').expect(200)).body.items;
    const pro = plans.find((p: { code: string }) => p.code === 'PRO');
    const cur = pro.versions[0];
    const v2 = (
      await admin
        .post('/v1/admin/plans/PRO/versions', {
          ...cur,
          name: 'Pro',
          monthlyPricePaise: 179900,
          annualPricePaise: 1799000,
          existingSubscribers: 'KEEP_CURRENT_VERSION',
        })
        .expect(201)
    ).body;
    expect(v2.version).toBe(cur.version + 1);
    const after = (await admin.get('/v1/admin/plans').expect(200)).body.items.find(
      (p: { code: string }) => p.code === 'PRO',
    );
    expect(after.currentVersionId).toBe(v2.id);
    expect(after.versions).toHaveLength(pro.versions.length + 1);
  });

  it('staff limit is enforced', async () => {
    const { client } = await onboard(t, ['AEPS']);
    await addStaff(t, client, 'OPERATOR'); // Free: 2 staff incl. owner
    const r = await client
      .post('/v1/staff/invite', {
        email: 'third@example.test',
        displayName: 'Third',
        role: 'OPERATOR',
      })
      .expect(402);
    expect(r.body.error.details.metric).toBe('STAFF');
  });
});

describe('Role and permission enforcement', () => {
  let owner: Client;
  let operator: Client;
  let ownerRecord: { id: string; version: number };
  let permTenant: string;
  beforeAll(async () => {
    ({ client: owner, tenantId: permTenant } = await onboard(t, ['AEPS', 'DMT', 'PAN']));
    await owner.post('/v1/customers', { name: 'Masked Customer', phone: '9123456789' }).expect(201);
    ownerRecord = (await owner.post('/v1/records', aepsRecord()).expect(201)).body;
    ({ client: operator } = await addStaff(t, owner, 'OPERATOR'));
  });

  it('operators see only their own records', async () => {
    await operator.get(`/v1/records/${ownerRecord.id}`).expect(404);
    const own = (await operator.post('/v1/records', aepsRecord()).expect(201)).body;
    const list = (await operator.get('/v1/records').expect(200)).body;
    expect(list.items.map((r: { id: string }) => r.id)).toEqual([own.id]);
    expect((await operator.get('/v1/dashboard').expect(200)).body.scope).toBe('MY_RECORDS');
  });

  it('operators cannot reach financial, staff, export or settings functions', async () => {
    for (const p of [
      '/v1/cashbook',
      '/v1/expenses',
      '/v1/commissions',
      `/v1/reports/summary?from=${today()}&to=${today()}`,
      '/v1/audit',
    ]) {
      expect((await operator.get(p).expect(403)).body.error.code).toBe('PERMISSION_DENIED');
    }
    await operator
      .post('/v1/staff/invite', { email: 'x@example.test', displayName: 'X', role: 'OPERATOR' })
      .expect(403);
    await operator.post('/v1/exports', { type: 'RECORDS' }).expect(403);
    await operator.patch('/v1/tenant/profile', { version: 0, shopName: 'Hacked' }).expect(403);
    await operator.post('/v1/closings', { businessDate: today(), countedCashPaise: 0 }).expect(403);
    const own = (await operator.post('/v1/records', aepsRecord()).expect(201)).body;
    await operator
      .post(`/v1/records/${own.id}/reverse`, { version: own.version, reason: 'try' })
      .expect(403);
    const nav = (await operator.get('/v1/tenant/context').expect(200)).body.navigation.map(
      (n: { key: string }) => n.key,
    );
    expect(nav).not.toEqual(expect.arrayContaining(['cashbook']));
    expect(nav).not.toContain('staff');
  });

  it('sensitive customer fields are masked without customers.view_sensitive', async () => {
    const list = (await operator.get('/v1/customers?q=masked').expect(200)).body.items;
    expect(list[0].phone).toBe('******6789');
    expect(list[0].phoneMasked).toBe(true);
    const ownerView = (await owner.get('/v1/customers?q=masked').expect(200)).body.items;
    expect(ownerView[0].phone).toBe('9123456789');
    await operator
      .patch(`/v1/customers/${list[0].id}`, { version: list[0].version, phone: '9000000000' })
      .expect(403);
  });

  it('owner-only permissions cannot be granted; owners cannot be demoted; no self-modification', async () => {
    const staff = (await owner.get('/v1/staff').expect(200)).body.items;
    const op = staff.find((s: { role: string }) => s.role === 'OPERATOR');
    const ownerM = staff.find((s: { role: string }) => s.role === 'OWNER');
    expect(
      (
        await owner
          .patch(`/v1/staff/${op.id}`, { version: op.version, grants: ['staff.manage'] })
          .expect(403)
      ).body.error.code,
    ).toBe('PERMISSION_DENIED');
    await owner
      .patch(`/v1/staff/${ownerM.id}`, { version: ownerM.version, role: 'OPERATOR' })
      .expect(403);
    // grant view_all → operator can now see the owner's record
    await owner
      .patch(`/v1/staff/${op.id}`, { version: op.version, grants: ['records.view_all'] })
      .expect(200);
    await operator.get(`/v1/records/${ownerRecord.id}`).expect(200);
  });

  it('disabling a member cuts access immediately', async () => {
    await admin
      .post(`/v1/admin/tenants/${permTenant}/entitlement-overrides`, {
        key: 'staffLimit',
        value: 5,
        reason: 'Test needs a third member',
      })
      .expect(201);
    const { client: acct, membershipId } = await addStaff(t, owner, 'ACCOUNTANT');
    await acct.get('/v1/cashbook').expect(200); // accountant: read-only finance access
    await acct
      .post('/v1/expenses', { category: 'RENT', amountPaise: 100, method: 'CASH', paidOn: today() })
      .expect(403);
    const m = (await owner.get('/v1/staff').expect(200)).body.items.find(
      (s: { id: string }) => s.id === membershipId,
    );
    await owner
      .patch(`/v1/staff/${membershipId}`, { version: m.version, status: 'DISABLED' })
      .expect(200);
    await acct.get('/v1/tenant/context').expect(403);
  });
});

describe('Platform admin context', () => {
  it('admin and tenant security contexts are separate', async () => {
    const { client } = await onboard(t, ['AEPS']);
    await admin.get('/v1/tenant/context').expect(401);
    await client.get('/v1/admin/overview').expect(401);
  });

  it('support role is restricted; the last super admin is protected', async () => {
    const support = await (await createAdmin(t, 'SUPPORT')).session();
    await support.get('/v1/admin/plans').expect(200); // platform.view
    expect(
      (await support.post('/v1/admin/plans/PRO/versions', {}).expect(403)).body.error.code,
    ).toBe('PERMISSION_DENIED');
    await support.get('/v1/admin/admins').expect(403);

    const admins = (await admin.get('/v1/admin/admins').expect(200)).body.items;
    const supers = admins.filter(
      (a: { role: string; status: string }) => a.role === 'SUPER_ADMIN' && a.status === 'ACTIVE',
    );
    for (const s of supers.slice(1))
      await admin.patch(`/v1/admin/admins/${s.id}`, { status: 'DISABLED' }).expect(200);
    const last = (
      await admin.patch(`/v1/admin/admins/${supers[0].id}`, { role: 'SUPPORT' }).expect(409)
    ).body;
    expect(last.error.code).toBe('LAST_SUPER_ADMIN');
  });

  it('support sessions are time-limited, read-only, audited and visible to the tenant', async () => {
    const { client, tenantId } = await onboard(t, ['AEPS']);
    const rec = (await client.post('/v1/records', aepsRecord()).expect(201)).body;
    const support = await (await createAdmin(t, 'SUPPORT')).session();
    await support.post('/v1/admin/support-sessions', { tenantId, reason: 'short' }).expect(422);
    const s = (
      await support
        .post('/v1/admin/support-sessions', {
          tenantId,
          reason: 'Owner reported a missing record',
          durationMinutes: 15,
        })
        .expect(201)
    ).body;
    const list = (await support.get(`/v1/admin/support-sessions/${s.id}/records`).expect(200)).body;
    expect(list.items.map((r: { id: string }) => r.id)).toContain(rec.id);
    const ctx = (await client.get('/v1/tenant/context').expect(200)).body;
    expect(ctx.supportAccessActive).toHaveLength(1);
    const audit = (await client.get('/v1/audit?action=support.').expect(200)).body.items;
    expect(audit.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['support.session_started', 'support.records_listed']),
    );
    expect(audit[0].actor).toBe('CSP2All support');
    await support.post(`/v1/admin/support-sessions/${s.id}/end`).expect(200);
    await support.get(`/v1/admin/support-sessions/${s.id}/records`).expect(403);
  });

  it('suspension blocks tenant operations but keeps subscription access', async () => {
    const { client, tenantId } = await onboard(t, ['AEPS']);
    await admin
      .post(`/v1/admin/tenants/${tenantId}/status`, {
        status: 'SUSPENDED',
        reason: 'Payment dispute review',
      })
      .expect(200);
    expect((await client.get('/v1/records').expect(423)).body.error.code).toBe('TENANT_SUSPENDED');
    await client.get('/v1/tenant/context').expect(200);
    await client.get('/v1/subscription').expect(200);
    await admin
      .post(`/v1/admin/tenants/${tenantId}/status`, {
        status: 'ACTIVE',
        reason: 'Dispute resolved',
      })
      .expect(200);
    await client.get('/v1/records').expect(200);
  });
});

describe('Platform settings enforcement', () => {
  it('signupsEnabled=false blocks new shop creation; existing shops unaffected', async () => {
    await admin.put('/v1/admin/settings/signupsEnabled', { value: false }).expect(200);
    const { signIn } = await import('../helpers');
    const c = await signIn(t);
    await c
      .put('/v1/onboarding/shop', {
        shopName: 'Paused Kendra',
        ownerName: 'Paused Owner',
        state: 'Assam',
        district: 'Guwahati',
      })
      .expect(200);
    await c.put('/v1/onboarding/services', { services: ['AEPS'] }).expect(200);
    expect((await c.post('/v1/onboarding/complete').expect(403)).body.error.code).toBe('FORBIDDEN');
    await t.owner.platformSetting.delete({ where: { key: 'signupsEnabled' } });
    await c.post('/v1/onboarding/complete').expect(200);
  });
});
