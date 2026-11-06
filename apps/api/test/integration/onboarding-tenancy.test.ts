import { PrismaClient } from '@prisma/client';
import {
  aepsRecord,
  onboard,
  setup,
  signIn,
  today,
  uniqueEmail,
  type Client,
  type TestCtx,
} from '../helpers';

let t: TestCtx;
beforeAll(async () => (t = await setup()));
afterAll(async () => t.close());

describe('Onboarding', () => {
  it('is resumable: progress is kept between sessions', async () => {
    const email = uniqueEmail();
    const c1 = await signIn(t, email);
    expect((await c1.get('/v1/auth/me').expect(200)).body.onboarding).toEqual({ step: 'SHOP' });
    await c1
      .put('/v1/onboarding/shop', {
        shopName: 'Resume Kendra',
        ownerName: 'Asha',
        state: 'Rajasthan',
        district: 'Jaipur',
      })
      .expect(200);
    const c2 = await signIn(t, email); // new device / session
    const me = await c2.get('/v1/auth/me').expect(200);
    expect(me.body.onboarding).toEqual({ step: 'SERVICES' });
    const draft = await c2.get('/v1/onboarding').expect(200);
    expect(draft.body.shop.shopName).toBe('Resume Kendra');
  });

  it('enforces the starting plan service limit', async () => {
    const c = await signIn(t);
    await c
      .put('/v1/onboarding/shop', {
        shopName: 'Limit Kendra',
        ownerName: 'Arun',
        state: 'Goa',
        district: 'Panaji',
      })
      .expect(200);
    const r = await c
      .put('/v1/onboarding/services', {
        services: ['AEPS', 'DMT', 'PAN', 'RECHARGE', 'BILL_PAYMENT'],
      })
      .expect(402);
    expect(r.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('provisions exactly once under retries and concurrent requests', async () => {
    const c = await signIn(t);
    await c
      .put('/v1/onboarding/shop', {
        shopName: 'Retry Kendra',
        ownerName: 'Bina',
        state: 'Kerala',
        district: 'Kochi',
      })
      .expect(200);
    await c.put('/v1/onboarding/services', { services: ['AEPS', 'DMT', 'PAN'] }).expect(200);
    const results = await Promise.all([1, 2, 3].map(() => c.post('/v1/onboarding/complete')));
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(ok.map((r) => r.body.tenantId));
    expect(ids.size).toBe(1);
    const again = await c.post('/v1/onboarding/complete').expect(200);
    expect(again.body.tenantId).toBe([...ids][0]);
    expect(await t.owner.tenant.count({ where: { name: 'Retry Kendra' } })).toBe(1);
    // tenant, owner membership, subscription, services and ledger created transactionally
    const tenantId = again.body.tenantId;
    expect(await t.owner.membership.count({ where: { tenantId, role: 'OWNER' } })).toBe(1);
    expect(await t.owner.subscription.count({ where: { tenantId } })).toBe(1);
    expect(await t.owner.tenantService.count({ where: { tenantId } })).toBe(3);
    expect(await t.owner.ledgerAccount.count({ where: { tenantId } })).toBe(10);
  });

  it('dashboard and navigation are driven by the selected services', async () => {
    const { client } = await onboard(t, ['AEPS', 'DMT', 'PAN']);
    const ctx = await client.get('/v1/tenant/context').expect(200);
    expect(ctx.body.quickActions.map((q: { code: string }) => q.code).sort()).toEqual([
      'AEPS',
      'DMT',
      'PAN',
    ]);
    expect(ctx.body.serviceNavigation.map((q: { code: string }) => q.code).sort()).toEqual([
      'AEPS',
      'DMT',
      'PAN',
    ]);
    expect(ctx.body.dashboardWidgets).toEqual(
      expect.arrayContaining(['volume', 'cashPayout', 'pendingApplications']),
    );
    expect(ctx.body.membership.role).toBe('OWNER');
    const dash = await client.get('/v1/dashboard').expect(200);
    expect(dash.body.checklist).toEqual({
      firstCustomer: false,
      firstRecord: false,
      openingCash: false,
      staffInvited: false,
    });
    expect(dash.body.serviceVolume.meaning).toMatch(/NOT income/);
  });

  it('backend refuses records for services the shop did not select', async () => {
    const { client } = await onboard(t, ['AEPS']);
    const r = await client
      .post('/v1/records', {
        serviceCode: 'RECHARGE',
        txnDate: today(),
        opStatus: 'SUCCESSFUL',
        principalPaise: 19900,
        details: { rechargeType: 'PREPAID', operator: 'JIO', subscriberNumber: '9876543210' },
      })
      .expect(403);
    expect(r.body.error).toMatchObject({
      code: 'SERVICE_NOT_AVAILABLE',
      details: { reason: 'TENANT' },
    });
  });
});

describe('Tenant isolation', () => {
  let a: Client;
  let b: Client;
  let aTenant: string;
  let aRecord: { id: string; version: number };
  let aCustomer: string;

  beforeAll(async () => {
    const A = await onboard(t, ['AEPS', 'DMT', 'PAN'], 'Shop A');
    const B = await onboard(t, ['AEPS', 'DMT', 'PAN'], 'Shop B');
    a = A.client;
    b = B.client;
    aTenant = A.tenantId;
    aCustomer = (
      await a.post('/v1/customers', { name: 'Private Customer', phone: '9876500000' }).expect(201)
    ).body.id;
    aRecord = (
      await a
        .post(
          '/v1/records',
          aepsRecord({ customerId: aCustomer, walkInName: null, notes: 'secret note A' }),
        )
        .expect(201)
    ).body;
  });

  it('guessed ids return 404, never data', async () => {
    await b.get(`/v1/records/${aRecord.id}`).expect(404);
    await b.get(`/v1/customers/${aCustomer}`).expect(404);
    await b
      .patch(`/v1/records/${aRecord.id}`, { version: aRecord.version, notes: 'hijack' })
      .expect(404);
    await b
      .post(`/v1/records/${aRecord.id}/transitions`, {
        version: aRecord.version,
        to: 'FAILED',
        reason: 'x',
        reversePosting: true,
      })
      .expect(404);
    await b
      .post(`/v1/records/${aRecord.id}/reverse`, { version: aRecord.version, reason: 'hijack' })
      .expect(404);
  });

  it('lists and search never include another tenant', async () => {
    const recs = await b.get('/v1/records?q=Private').expect(200);
    expect(recs.body.total).toBe(0);
    const cust = await b.get('/v1/customers?q=private').expect(200);
    expect(cust.body.total).toBe(0);
    expect((await b.get('/v1/dues').expect(200)).body.items).toEqual([]);
  });

  it('nested references to another tenant are rejected', async () => {
    const r = await b
      .post('/v1/records', aepsRecord({ customerId: aCustomer, walkInName: null }))
      .expect(422);
    expect(r.body.error.fields.customerId).toBeDefined();
    await b
      .post('/v1/collections', {
        method: 'CASH',
        receivedOn: today(),
        allocations: [{ recordId: aRecord.id, amountPaise: 100 }],
      })
      .expect(404);
    await b
      .post('/v1/follow-ups', { title: 'Steal', dueDate: today(), recordId: aRecord.id })
      .expect(404);
    await b
      .post('/v1/commissions/receipts', {
        method: 'FLOAT',
        receivedOn: today(),
        allocations: [{ recordId: aRecord.id, amountPaise: 100 }],
      })
      .expect(404);
  });

  it('selecting a tenant you are not a member of is refused', async () => {
    await b.post('/v1/auth/select-tenant', { tenantId: aTenant }).expect(404);
  });

  it('PostgreSQL RLS blocks the app role without (or with the wrong) tenant context', async () => {
    const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      expect(await app.serviceRecord.count({ where: { id: aRecord.id } })).toBe(0);
      const other = await t.owner.tenant.findFirstOrThrow({ where: { name: 'Shop B' } });
      const seen = await app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${other.id}, true)`;
        return tx.serviceRecord.findMany({ where: { id: aRecord.id } });
      });
      expect(seen).toEqual([]);
      await expect(
        app.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${other.id}, true)`;
          await tx.customer.create({
            data: { tenantId: aTenant, name: 'x', nameLower: 'x', createdByUserId: aRecord.id },
          });
        }),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await app.$disconnect();
    }
  });

  it('composite foreign keys stop cross-tenant references even for privileged writes', async () => {
    const other = await t.owner.tenant.findFirstOrThrow({ where: { name: 'Shop B' } });
    await expect(
      t.owner.followUpTask.create({
        data: {
          tenantId: other.id,
          customerId: aCustomer,
          title: 'x',
          dueDate: new Date(),
          createdByUserId: aRecord.id,
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
  });
});

describe('Additional shops', () => {
  it('an owner can create a second shop; both stay isolated and selectable', async () => {
    const { client, tenantId: first } = await onboard(t, ['AEPS'], 'First Kendra');
    expect(
      (
        await client
          .put('/v1/onboarding/shop', {
            shopName: 'Second Kendra',
            ownerName: 'Test Owner',
            state: 'Bihar',
            district: 'Gaya',
          })
          .expect(409)
      ).body.error.details.next,
    ).toMatch(/new-shop/);
    await client.post('/v1/onboarding/new-shop').expect(200);
    await client
      .put('/v1/onboarding/shop', {
        shopName: 'Second Kendra',
        ownerName: 'Test Owner',
        state: 'Bihar',
        district: 'Gaya',
      })
      .expect(200);
    await client.put('/v1/onboarding/services', { services: ['DMT'] }).expect(200);
    const second = (await client.post('/v1/onboarding/complete').expect(200)).body;
    expect(second.tenantId).not.toBe(first);
    expect((await client.post('/v1/onboarding/complete').expect(200)).body.tenantId).toBe(
      second.tenantId,
    );
    expect(second.tenants.map((x: { name: string }) => x.name).sort()).toEqual([
      'First Kendra',
      'Second Kendra',
    ]);
    expect((await client.get('/v1/tenant/context').expect(200)).body.tenant.name).toBe(
      'Second Kendra',
    );
    await client.post('/v1/auth/select-tenant', { tenantId: first }).expect(200);
    expect((await client.get('/v1/tenant/context').expect(200)).body.tenant.name).toBe(
      'First Kendra',
    );
  });
});
