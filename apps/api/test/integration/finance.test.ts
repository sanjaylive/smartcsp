import { PrismaClient } from '@prisma/client';
import {
  aepsRecord,
  dmtRecord,
  onboard,
  setup,
  today,
  type Client,
  type TestCtx,
} from '../helpers';

let t: TestCtx;
let c: Client;
let tenantId: string;

async function trialBalance(client: Client) {
  // advancedReports is a paid feature: grant it to this tenant for verification.
  return (await client.get(`/v1/reports/trial-balance?asOf=${today()}`).expect(200)).body;
}

beforeAll(async () => {
  t = await setup();
  ({ client: c, tenantId } = await onboard(t, ['AEPS', 'DMT', 'PAN']));
  const owner = await t.owner.membership.findFirstOrThrow({ where: { tenantId, role: 'OWNER' } });
  for (const [key, value] of [
    ['advancedReports', true],
    ['monthlyRecordLimit', 10000],
  ] as const) {
    await t.owner.entitlementOverride.create({
      data: { tenantId, key, value, reason: 'test', createdByUserId: owner.userId },
    });
  }
});
afterAll(async () => t.close());

describe('Documented posting examples (docs/FINANCE.md)', () => {
  it('opening cash, AEPS payout, DMT collection, fee and commission produce correct balances', async () => {
    await c
      .post('/v1/cashbook/opening', {
        account: 'CASH',
        amountPaise: 2000000,
        businessDate: today(),
      })
      .expect(201);
    await c
      .post('/v1/cashbook/opening', {
        account: 'FLOAT',
        amountPaise: 5000000,
        businessDate: today(),
      })
      .expect(201);
    await c.post('/v1/records', aepsRecord()).expect(201); // pays out ₹5,000, collects ₹10 fee, expects ₹12.50 commission
    await c.post('/v1/records', dmtRecord()).expect(201); // collects ₹3,030 for a ₹3,000 transfer

    const book = (await c.get(`/v1/cashbook?date=${today()}&account=CASH`).expect(200)).body;
    expect(book.openingBalancePaise).toBe(0);
    expect(book.totalInPaise).toBe(2000000 + 1000 + 303000);
    expect(book.totalOutPaise).toBe(500000);
    expect(book.closingBalancePaise).toBe(2000000 + 1000 + 303000 - 500000);
    const wallet = book.fundBalances.find((f: { account: string }) => f.account === 'FLOAT');
    expect(wallet.balancePaise).toBe(5000000 + 500000 - 300000);

    const summary = (await c.get(`/v1/reports/summary?from=${today()}&to=${today()}`).expect(200))
      .body;
    expect(summary.income.customerFeesPaise).toBe(1000 + 3000); // principal is never income
    expect(summary.income.commissionAccruedPaise).toBe(1250 + 600);
    expect(summary.commission.pendingAsOfEndPaise).toBe(1850);
    expect(summary.commission.receivedInRangePaise).toBe(0);
    expect(summary.openingCapitalPaise).toBe(7000000); // opening balances are capital, not income

    const tb = await trialBalance(c);
    expect(tb.balanced).toBe(true);
  });

  it('commission receipt moves pending commission into the wallet', async () => {
    const rec = (
      await c.post('/v1/records', aepsRecord({ expectedCommissionPaise: 2000 })).expect(201)
    ).body;
    const before = (await c.get('/v1/commissions').expect(200)).body.pendingPaise;
    await c
      .post('/v1/commissions/receipts', {
        method: 'FLOAT',
        receivedOn: today(),
        allocations: [{ recordId: rec.id, amountPaise: 2000 }],
        unallocatedPaise: 150,
      })
      .expect(201);
    const after = (await c.get('/v1/commissions').expect(200)).body;
    expect(after.pendingPaise).toBe(before - 2000);
    expect(after.receivedToDatePaise).toBeGreaterThanOrEqual(2150);
    await c
      .post('/v1/commissions/receipts', {
        method: 'FLOAT',
        receivedOn: today(),
        allocations: [{ recordId: rec.id, amountPaise: 1 }],
      })
      .expect(422);
    expect((await trialBalance(c)).balanced).toBe(true);
  });

  it('expense and its reversal', async () => {
    const e = (
      await c
        .post('/v1/expenses', {
          category: 'STATIONERY',
          amountPaise: 25000,
          method: 'CASH',
          paidOn: today(),
          vendor: 'Demo Stationers',
        })
        .expect(201)
    ).body;
    const list = (await c.get('/v1/expenses').expect(200)).body;
    expect(list.totalPaise).toBeGreaterThanOrEqual(25000);
    await c.post(`/v1/expenses/${e.id}/reverse`, { reason: 'Entered twice' }).expect(200);
    await c.post(`/v1/expenses/${e.id}/reverse`, { reason: 'Again' }).expect(409);
    expect((await trialBalance(c)).balanced).toBe(true);
  });
});

describe('Dues and partial collections', () => {
  it('partial collections reduce the due and update payment status; over-collection is refused', async () => {
    const cust = (
      await c.post('/v1/customers', { name: 'Kamla Devi', phone: '9800000001' }).expect(201)
    ).body;
    const rec = (
      await c
        .post(
          '/v1/records',
          dmtRecord({ customerId: cust.id, walkInName: null, amountCollectedPaise: 100000 }),
        )
        .expect(201)
    ).body;
    expect(rec).toMatchObject({ amountDuePaise: 203000, paymentStatus: 'PARTIAL' });

    const dues = (await c.get('/v1/dues').expect(200)).body;
    expect(
      dues.items.find((g: { customerId: string }) => g.customerId === cust.id).totalDuePaise,
    ).toBe(203000);

    const col = (
      await c
        .post('/v1/collections', {
          customerId: cust.id,
          method: 'UPI',
          receivedOn: today(),
          allocations: [{ recordId: rec.id, amountPaise: 3000 }],
        })
        .expect(201)
    ).body;
    let r = (await c.get(`/v1/records/${rec.id}`).expect(200)).body;
    expect(r).toMatchObject({ amountDuePaise: 200000, paymentStatus: 'PARTIAL' });
    expect(r.allocations).toHaveLength(1);

    const over = await c
      .post('/v1/collections', {
        method: 'CASH',
        receivedOn: today(),
        allocations: [{ recordId: rec.id, amountPaise: 200001 }],
      })
      .expect(422);
    expect(over.body.error.code).toBe('AMOUNT_EXCEEDS_DUE');
    await c
      .post('/v1/collections', {
        method: 'CASH',
        receivedOn: today(),
        allocations: [{ recordId: rec.id, amountPaise: 200000 }],
      })
      .expect(201);
    r = (await c.get(`/v1/records/${rec.id}`).expect(200)).body;
    expect(r).toMatchObject({ amountDuePaise: 0, paymentStatus: 'PAID' });

    // A record with allocated collections can't be reversed until the collections are reversed.
    const blocked = await c
      .post(`/v1/records/${rec.id}/reverse`, { version: r.version, reason: 'test' })
      .expect(409);
    expect(blocked.body.error.message).toMatch(/Reverse those collections first/);
    await c.post(`/v1/collections/${col.id}/reverse`, { reason: 'UPI bounced' }).expect(200);
    r = (await c.get(`/v1/records/${rec.id}`).expect(200)).body;
    expect(r).toMatchObject({ amountDuePaise: 3000, paymentStatus: 'PARTIAL' });
    expect((await trialBalance(c)).balanced).toBe(true);
  });

  it('concurrent collections can never exceed the due', async () => {
    const rec = (
      await c
        .post('/v1/records', dmtRecord({ amountCollectedPaise: 0, paymentMethod: 'NONE' }))
        .expect(201)
    ).body;
    expect(rec.amountDuePaise).toBe(303000);
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.post('/v1/collections', {
          method: 'CASH',
          receivedOn: today(),
          allocations: [{ recordId: rec.id, amountPaise: 100000 }],
        }),
      ),
    );
    expect(attempts.filter((a) => a.status === 201)).toHaveLength(3);
    const r = (await c.get(`/v1/records/${rec.id}`).expect(200)).body;
    expect(r.amountDuePaise).toBe(3000);
  });
});

describe('Daily closing', () => {
  it('closes with a counted-cash variance, blocks postings, reopens with approval, re-closes', async () => {
    const { client: shop } = await onboard(t, ['AEPS']);
    await shop
      .post('/v1/cashbook/opening', {
        account: 'CASH',
        amountPaise: 1000000,
        businessDate: today(),
      })
      .expect(201);
    await shop.post('/v1/records', aepsRecord()).expect(201);
    const preview = (await shop.get(`/v1/closings/${today()}/preview`).expect(200)).body;
    expect(preview.expectedCashPaise).toBe(1000000 - 500000 + 1000);
    expect(preview.summary.feeIncomePaise).toBe(1000);

    const closed = (
      await shop
        .post('/v1/closings', {
          businessDate: today(),
          countedCashPaise: preview.expectedCashPaise - 500,
        })
        .expect(201)
    ).body;
    expect(closed).toMatchObject({ status: 'CLOSED', variancePaise: -500 });
    const blocked = await shop.post('/v1/records', aepsRecord()).expect(409);
    expect(blocked.body.error.code).toBe('DAY_CLOSED');
    await shop.post('/v1/closings', { businessDate: today(), countedCashPaise: 1 }).expect(409);

    // An operator can request but not approve reopening.
    const { addStaff } = await import('../helpers');
    const mgr = await addStaff(t, shop, 'MANAGER');
    const req = (
      await mgr.client
        .post(`/v1/closings/${today()}/reopen-request`, { reason: 'Missed a collection entry' })
        .expect(200)
    ).body;
    expect(req.status).toBe('REOPEN_REQUESTED');
    await mgr.client.post(`/v1/closings/${today()}/reopen-approve`).expect(403);
    const reopened = (await shop.post(`/v1/closings/${today()}/reopen-approve`).expect(200)).body;
    expect(reopened.status).toBe('REOPENED');

    // Variance reversed on reopen, so expected cash is back to the pre-close figure.
    expect(
      (await shop.get(`/v1/closings/${today()}/preview`).expect(200)).body.expectedCashPaise,
    ).toBe(preview.expectedCashPaise);
    await shop.post('/v1/records', aepsRecord({ principalPaise: 100000 })).expect(201);
    const reclosed = (
      await shop
        .post('/v1/closings', {
          businessDate: today(),
          countedCashPaise: preview.expectedCashPaise - 100000 + 1000,
        })
        .expect(201)
    ).body; // payout ₹1,000 less ₹10 fee received
    expect(reclosed).toMatchObject({ status: 'CLOSED', variancePaise: 0, closeCount: 2 });
    const audit = (await shop.get('/v1/audit?action=day.').expect(200)).body.items.map(
      (i: { action: string }) => i.action,
    );
    expect(audit).toEqual(
      expect.arrayContaining(['day.closed', 'day.reopen_requested', 'day.reopened']),
    );
  });
});

describe('Database-level ledger integrity', () => {
  it('the app role cannot modify or delete posted journal lines or audit events', async () => {
    const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      await expect(
        app.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          await tx.$executeRaw`UPDATE journal_lines SET "debitPaise" = "debitPaise" + 1 WHERE "tenantId" = ${tenantId}::uuid`;
        }),
      ).rejects.toThrow(/permission denied|IMMUTABLE_ROW/);
      await expect(
        app.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          await tx.$executeRaw`DELETE FROM audit_events WHERE "tenantId" = ${tenantId}::uuid`;
        }),
      ).rejects.toThrow(/permission denied|IMMUTABLE_ROW/);
    } finally {
      await app.$disconnect();
    }
  });

  it('even the owner role cannot commit an unbalanced entry or edit posted lines', async () => {
    const acct = await t.owner.ledgerAccount.findFirstOrThrow({ where: { tenantId, key: 'CASH' } });
    await expect(
      t.owner.$transaction(async (tx) => {
        const e = await tx.journalEntry.create({
          data: {
            tenantId,
            entryNo: 999999,
            businessDate: new Date(`${today()}T00:00:00Z`),
            type: 'ADJUSTMENT',
            sourceType: 'test',
            sourceId: tenantId,
            postingKey: 'test:unbalanced',
            description: 'x',
          },
        });
        await tx.journalLine.create({
          data: {
            tenantId,
            entryId: e.id,
            accountId: acct.id,
            debitPaise: 100n,
            businessDate: e.businessDate,
          },
        });
        await tx.journalLine.create({
          data: {
            tenantId,
            entryId: e.id,
            accountId: acct.id,
            creditPaise: 99n,
            businessDate: e.businessDate,
          },
        });
      }),
    ).rejects.toThrow(/UNBALANCED_ENTRY/);
    const line = await t.owner.journalLine.findFirstOrThrow({ where: { tenantId } });
    await expect(
      t.owner.journalLine.update({ where: { id: line.id }, data: { memo: 'tampered' } }),
    ).rejects.toThrow(/IMMUTABLE_ROW/);
  });

  it('every posted entry in every test tenant balances', async () => {
    const rows = await t.owner.$queryRaw<{ unbalanced: bigint }[]>`
      SELECT count(*)::bigint AS unbalanced FROM (
        SELECT "entryId" FROM journal_lines GROUP BY "entryId" HAVING sum("debitPaise") <> sum("creditPaise")) x`;
    expect(Number(rows[0].unbalanced)).toBe(0);
  });
});
