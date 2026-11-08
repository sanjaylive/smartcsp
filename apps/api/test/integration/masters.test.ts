import {
  addStaff,
  aepsRecord,
  dmtRecord,
  onboard,
  setup,
  today,
  type Client,
  type TestCtx,
} from '../helpers';

let t: TestCtx;
let owner: Client;
let tenantId: string;

beforeAll(async () => {
  t = await setup();
  ({ client: owner, tenantId } = await onboard(t, ['AEPS', 'DMT', 'PAN']));
  const m = await t.owner.membership.findFirstOrThrow({ where: { tenantId, role: 'OWNER' } });
  await t.owner.entitlementOverride.create({
    data: {
      tenantId,
      key: 'monthlyRecordLimit',
      value: 10000,
      reason: 'test',
      createdByUserId: m.userId,
    },
  });
});
afterAll(async () => t.close());

const add = (c: Client, body: Record<string, unknown>) => c.post('/v1/masters', body);

describe('Shop masters', () => {
  it('creates, lists, renames and turns off entries; names are unique per list', async () => {
    const cat = (
      await add(owner, { kind: 'EXPENSE_CATEGORY', name: 'Tea & snacks', data: {} }).expect(201)
    ).body;
    expect(cat).toMatchObject({
      kind: 'EXPENSE_CATEGORY',
      name: 'Tea & snacks',
      active: true,
      version: 0,
    });

    const dup = await add(owner, {
      kind: 'EXPENSE_CATEGORY',
      name: 'Tea & snacks',
      data: {},
    }).expect(409);
    expect(dup.body.error.fields.name).toBeDefined();
    // Built-in names are refused so reports don't show two "Rent" rows.
    await add(owner, { kind: 'EXPENSE_CATEGORY', name: 'rent', data: {} }).expect(409);
    // Same name in a different list is fine.
    await add(owner, { kind: 'PROVIDER', name: 'Tea & snacks', data: {} }).expect(201);

    const renamed = (
      await owner.patch(`/v1/masters/${cat.id}`, { version: 0, name: 'Tea and snacks' }).expect(200)
    ).body;
    expect(renamed).toMatchObject({ name: 'Tea and snacks', version: 1 });
    await owner.patch(`/v1/masters/${cat.id}`, { version: 0, active: false }).expect(409); // stale

    const list = (await owner.get('/v1/masters').expect(200)).body.items;
    expect(list.map((m: { name: string }) => m.name)).toEqual(
      expect.arrayContaining(['Tea and snacks', 'Tea & snacks']),
    );
  });

  it('validates payment-mode accounts and fee-preset slabs', async () => {
    await add(owner, { kind: 'PAYMENT_MODE', name: 'Mystery', data: { account: 'WALLET' } }).expect(
      422,
    );
    await add(owner, {
      kind: 'FEE_PRESET',
      name: 'Bad slabs',
      data: {
        serviceCode: 'AEPS',
        slabs: [
          { upToPaise: null, feePaise: 10 },
          { upToPaise: 500, feePaise: 20 },
        ],
      },
    }).expect(422);
    const preset = (
      await add(owner, {
        kind: 'FEE_PRESET',
        name: 'AEPS standard',
        data: {
          serviceCode: 'AEPS',
          slabs: [
            { upToPaise: 200000, feePaise: 1000 },
            { upToPaise: null, feePaise: 2000 },
          ],
        },
      }).expect(201)
    ).body;
    // Edits to data are validated against the entry's kind.
    await owner
      .patch(`/v1/masters/${preset.id}`, { version: 0, data: { account: 'CASH' } })
      .expect(422);
  });

  it('only settings managers can change lists; every member can read them', async () => {
    const { client: operator } = await addStaff(t, owner, 'OPERATOR');
    await operator.get('/v1/masters').expect(200);
    await add(operator, { kind: 'PROVIDER', name: 'Spice Money', data: {} }).expect(403);
  });

  it('records keep a payment mode and provider without changing the ledger account', async () => {
    await add(owner, { kind: 'PAYMENT_MODE', name: 'PhonePe', data: { account: 'BANK' } }).expect(
      201,
    );
    await add(owner, { kind: 'PROVIDER', name: 'PayNearby', data: { services: ['DMT'] } }).expect(
      201,
    );

    // Label must match the fund account of the method.
    const bad = await owner
      .post('/v1/records', dmtRecord({ paymentMethod: 'CASH', paymentMode: 'PhonePe' }))
      .expect(422);
    expect(bad.body.error.fields.paymentMode).toBeDefined();
    await owner.post('/v1/records', dmtRecord({ provider: 'Unknown Portal' })).expect(422);

    const rec = (
      await owner
        .post(
          '/v1/records',
          // Unposted, so the payment method can still be edited below.
          dmtRecord({
            paymentMethod: 'UPI',
            paymentMode: 'PhonePe',
            provider: 'PayNearby',
            post: false,
          }),
        )
        .expect(201)
    ).body;
    expect(rec).toMatchObject({
      paymentMethod: 'UPI',
      paymentMode: 'PhonePe',
      provider: 'PayNearby',
    });

    // Changing the method without a mode clears the stale label.
    const changed = (
      await owner
        .patch(`/v1/records/${rec.id}`, { version: rec.version, paymentMethod: 'CASH' })
        .expect(200)
    ).body;
    expect(changed.paymentMode).toBeNull();
    expect(changed.provider).toBe('PayNearby');
  });

  it('turned-off entries cannot be used for new transactions', async () => {
    const p = (await add(owner, { kind: 'PROVIDER', name: 'Old Portal', data: {} }).expect(201))
      .body;
    await owner.patch(`/v1/masters/${p.id}`, { version: 0, active: false }).expect(200);
    await owner.post('/v1/records', aepsRecord({ provider: 'Old Portal' })).expect(422);
  });

  it('expenses accept shop categories and payment modes', async () => {
    await add(owner, { kind: 'EXPENSE_CATEGORY', name: 'Printer ink', data: {} }).expect(201);
    await add(owner, {
      kind: 'PAYMENT_MODE',
      name: 'Petty cash box',
      data: { account: 'CASH' },
    }).expect(201);
    const e = (
      await owner
        .post('/v1/expenses', {
          category: 'Printer ink',
          amountPaise: 15000,
          method: 'CASH',
          paymentMode: 'Petty cash box',
          paidOn: today(),
        })
        .expect(201)
    ).body;
    expect(e).toMatchObject({ category: 'Printer ink', paymentMode: 'Petty cash box' });
    await owner
      .post('/v1/expenses', {
        category: 'Made up',
        amountPaise: 100,
        method: 'CASH',
        paidOn: today(),
      })
      .expect(422);
    // Built-in categories keep working.
    await owner
      .post('/v1/expenses', { category: 'RENT', amountPaise: 100, method: 'CASH', paidOn: today() })
      .expect(201);
  });

  it('lists are isolated between shops', async () => {
    const { client: other } = await onboard(t, ['AEPS'], 'Other Kendra');
    const items = (await other.get('/v1/masters').expect(200)).body.items;
    expect(items).toEqual([]);
    await other.post('/v1/records', aepsRecord({ provider: 'PayNearby' })).expect(422);
  });
});
