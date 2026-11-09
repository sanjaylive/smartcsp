/*
 * Pay2All Live connector against a fake Pay2All (fetch is replaced): no real request is ever sent.
 */
import { IntegrationsService } from '../../src/modules/integrations/integrations.service';
import { createAdmin, onboard, setup, today, type Client, type TestCtx } from '../helpers';

let t: TestCtx;
let c: Client;
let tenantId: string;
let svc: IntegrationsService;

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}
const calls: Call[] = [];
/** Per-path canned responses: [httpStatus, json] or a function of the request body. */
let routes: Record<string, (b: Record<string, unknown> | null) => [number, unknown] | 'timeout'> =
  {};

const fakeFetch = (async (input: URL | string, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname.replace('/api/v1', '');
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({
    method: init?.method ?? 'GET',
    path: path + url.search,
    headers: init?.headers as Record<string, string>,
    body,
  });
  const key = Object.keys(routes).find((k) => path === k || path.startsWith(k + '/'));
  const r = key ? routes[key]!(body) : ([404, { message: 'no route' }] as [number, unknown]);
  if (r === 'timeout') {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  }
  return new Response(JSON.stringify(r[1]), {
    status: r[0],
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

const recharge = (principalPaise: number, live: Record<string, unknown> = { providerId: 11 }) => ({
  serviceCode: 'RECHARGE',
  txnDate: today(),
  walkInName: 'Live Customer',
  principalPaise,
  customerFeePaise: 0,
  amountCollectedPaise: principalPaise,
  paymentMethod: 'CASH',
  details: { rechargeType: 'PREPAID', operator: 'JIO', subscriberNumber: '9876543210' },
  confirmed: true,
  live,
});

beforeAll(async () => {
  t = await setup();
  svc = t.app.get(IntegrationsService);
  svc.fetchImpl = fakeFetch;
  ({ client: c, tenantId } = await onboard(t, ['RECHARGE', 'BILL_PAYMENT', 'DMT']));
  const admin = await (await createAdmin(t)).session();
  await admin
    .post(`/v1/admin/tenants/${tenantId}/entitlement-overrides`, {
      key: 'connectorEligible',
      value: true,
      reason: 'Pay2All test',
    })
    .expect(201);
});
afterAll(async () => t.close());
beforeEach(() => {
  calls.length = 0;
  routes = {
    '/balance': () => [200, { status_id: 1, data: { organization: 'My Shop', balance: 1234.5 } }],
  };
});

describe('Pay2All Live connector', () => {
  let callbackUrl: string;

  it('needs a token for Live; stores it encrypted and masked; only documented services go Live', async () => {
    await c
      .put('/v1/integrations/pay2all', { mode: 'LIVE', enabledServices: ['RECHARGE'] })
      .expect(422);
    const cfg = (
      await c
        .put('/v1/integrations/pay2all', {
          mode: 'LIVE',
          enabledServices: ['RECHARGE', 'BILL_PAYMENT', 'DMT'],
          credentials: { apiToken: 'p2a_live_SECRET987654' },
        })
        .expect(200)
    ).body;
    expect(cfg.enabledServices).toEqual(['RECHARGE', 'BILL_PAYMENT']); // DMT not documented yet
    expect(cfg.credentialsMasked).toEqual({ apiToken: '****7654' });
    expect(cfg.callbackUrl).toMatch(/\/v1\/webhooks\/pay2all\/[\w-]{20,}$/);
    callbackUrl = new URL(cfg.callbackUrl).pathname;
    const row = await t.owner.connectorConfig.findFirstOrThrow({ where: { tenantId } });
    expect(row.credentialsEnc).not.toContain('SECRET');

    const h = (await c.post('/v1/integrations/pay2all/health').expect(200)).body;
    expect(h).toMatchObject({ ok: true, balancePaise: 123450 });
    expect(calls[0]!.headers.authorization).toBe('Bearer p2a_live_SECRET987654');
    expect(calls[0]!.headers['x-mode']).toBeUndefined();
  });

  it('runs a recharge: success, failure and pending, with the right request', async () => {
    routes['/recharge'] = (b) =>
      Number(b!.amount) === 199
        ? [200, { status_id: 1, message: 'Success', data: { txn_id: 'P2A1', utr: 'OPR9' } }]
        : Number(b!.amount) === 299
          ? [200, { status_id: 2, message: 'Operator down' }]
          : [200, { status_id: 3, message: 'Pending', data: { txn_id: 'P2A3' } }];

    const ok = (await c.post('/v1/provider-operations', recharge(19900), 'p2a-ok-1').expect(200))
      .body;
    expect(ok).toMatchObject({ status: 'CONFIRMED', mode: 'LIVE', providerRef: 'P2A1' });
    expect(ok.record).toMatchObject({ opStatus: 'SUCCESSFUL', source: 'PROVIDER' });
    const sent = calls.find((x) => x.path === '/recharge')!;
    expect(sent.body).toMatchObject({
      client_id: 'p2a-ok-1',
      provider_id: 11,
      number: '9876543210',
      amount: '199.00',
    });

    const failed = (
      await c.post('/v1/provider-operations', recharge(29900), 'p2a-fail-1').expect(200)
    ).body;
    expect(failed).toMatchObject({ status: 'FAILED', message: 'Operator down' });
    expect(failed.record.opStatus).toBe('FAILED');

    const pending = (
      await c.post('/v1/provider-operations', recharge(39900), 'p2a-pend-1').expect(200)
    ).body;
    expect(pending.status).toBe('PENDING');

    // Same key, same body → the original operation, no second call to Pay2All.
    const before = calls.filter((x) => x.path === '/recharge').length;
    await c.post('/v1/provider-operations', recharge(19900), 'p2a-ok-1').expect(200);
    expect(calls.filter((x) => x.path === '/recharge').length).toBe(before);
  });

  it('a timeout is UNKNOWN (never retried) and a missing operator fails before sending', async () => {
    routes['/recharge'] = () => 'timeout';
    const u = (await c.post('/v1/provider-operations', recharge(49900), 'p2a-timeout').expect(200))
      .body;
    expect(u.status).toBe('UNKNOWN');
    expect(u.message).toMatch(/Do NOT repeat/);

    const before = calls.length;
    const noOp = (
      await c.post('/v1/provider-operations', recharge(5900, {}), 'p2a-noop').expect(200)
    ).body;
    expect(noOp.status).toBe('FAILED');
    expect(calls.length).toBe(before);
  });

  it('accepts callbacks only on the shop URL, for its own operations, with a matching amount', async () => {
    await t.http().post('/v1/webhooks/pay2all/not-a-real-token-123456').send({}).expect(404);
    await t
      .http()
      .post(callbackUrl)
      .send({ client_id: 'p2a-pend-1', status_id: 1, amount: '1.00', txn_id: 'P2A3' })
      .expect(200);
    let op = await t.owner.providerOperation.findFirstOrThrow({
      where: { idempotencyKey: 'p2a-pend-1' },
    });
    expect(op.status).toBe('PENDING'); // amount mismatch → ignored

    await t
      .http()
      .post(callbackUrl)
      .send({ client_id: 'p2a-pend-1', status_id: 1, amount: '399.00', txn_id: 'P2A3', utr: 'U1' })
      .expect(200);
    op = await t.owner.providerOperation.findFirstOrThrow({
      where: { idempotencyKey: 'p2a-pend-1' },
    });
    expect(op.status).toBe('CONFIRMED');
    const rec = await t.owner.serviceRecord.findFirstOrThrow({ where: { id: op.recordId } });
    expect(rec.opStatus).toBe('SUCCESSFUL');

    // Unknown client_id → rejected, nothing changes.
    const r = (
      await t
        .http()
        .post(callbackUrl)
        .send({ client_id: 'someone-else', status_id: 1, amount: '10' })
        .expect(200)
    ).body;
    expect(r.ok).toBe(false);
  });

  it('pays a bill: fetch, then pay; the callback is re-checked with the status API', async () => {
    routes['/bbps/fetch'] = () => [
      200,
      { status_id: 1, data: { amount: 845, customerName: 'R KUMAR', referenceId: 'REF77' } },
    ];
    routes['/bbps/pay'] = () => [200, { status_id: 3, data: { id: 'B1', statusId: 3 } }];
    let statusNow = 3;
    routes['/bbps/transactions'] = () => [
      200,
      { status_id: 1, data: { statusId: statusNow, id: 'B1' } },
    ];

    const bill = (
      await c
        .post('/v1/pay2all/bbps/fetch', {
          billerId: 'BESCOM01',
          params: { 'Consumer Number': '1234567' },
          mobile: '9876543210',
        })
        .expect(200)
    ).body;
    expect(bill).toMatchObject({ amount: 845, referenceId: 'REF77' });

    const op = (
      await c
        .post(
          '/v1/provider-operations',
          {
            serviceCode: 'BILL_PAYMENT',
            txnDate: today(),
            walkInName: 'R Kumar',
            principalPaise: 84500,
            customerFeePaise: 1000,
            amountCollectedPaise: 85500,
            paymentMethod: 'CASH',
            details: { billCategory: 'ELECTRICITY', billerName: 'BESCOM', consumerId: '1234567' },
            confirmed: true,
            live: {
              billerId: 'BESCOM01',
              referenceId: 'REF77',
              params: { 'Consumer Number': '1234567' },
              mobile: '9876543210',
            },
          },
          'p2a-bill-1',
        )
        .expect(200)
    ).body;
    expect(op.status).toBe('PENDING');
    expect(calls.find((x) => x.path === '/bbps/pay')!.body).toMatchObject({
      client_id: 'p2a-bill-1',
      biller_id: 'BESCOM01',
      reference_id: 'REF77',
      amount: '845.00',
      mobile: '9876543210',
    });

    // A forged "success" callback while Pay2All still says pending changes nothing.
    await t.http().post(callbackUrl).send({ client_id: 'p2a-bill-1', status_id: 1 }).expect(200);
    expect(
      (
        await t.owner.providerOperation.findFirstOrThrow({
          where: { idempotencyKey: 'p2a-bill-1' },
        })
      ).status,
    ).toBe('PENDING');
    statusNow = 1;
    await t.http().post(callbackUrl).send({ client_id: 'p2a-bill-1', status_id: 1 }).expect(200);
    expect(
      (
        await t.owner.providerOperation.findFirstOrThrow({
          where: { idempotencyKey: 'p2a-bill-1' },
        })
      ).status,
    ).toBe('CONFIRMED');
  });

  it('UAT test mode sends X-Mode: UAT, allows Recharge only and refuses bill lookups', async () => {
    const cfg = (
      await c
        .put('/v1/integrations/pay2all', {
          mode: 'UAT',
          enabledServices: ['RECHARGE', 'BILL_PAYMENT'],
        })
        .expect(200)
    ).body;
    expect(cfg.enabledServices).toEqual(['RECHARGE']); // token kept from before
    routes['/recharge'] = () => [200, { status_id: 1, data: { txn_id: 'UAT1' } }];
    const r = (await c.post('/v1/provider-operations', recharge(1000), 'p2a-uat-1').expect(200))
      .body;
    expect(r).toMatchObject({ status: 'CONFIRMED', mode: 'UAT' });
    expect(calls.find((x) => x.path === '/recharge')!.headers['x-mode']).toBe('UAT');
    await c.get('/v1/pay2all/bbps/categories').expect(409);
  });
});
