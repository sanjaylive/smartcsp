import request from 'supertest';
import { SimulatorAdapter } from '../../src/modules/integrations/providers';
import {
  aepsRecord,
  createAdmin,
  onboard,
  setup,
  signIn,
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

const SECRET = 'test-simulator-webhook-secret';
const rechargeOp = (principalPaise: number) => ({
  serviceCode: 'RECHARGE',
  txnDate: today(),
  walkInName: 'Provider Customer',
  principalPaise,
  customerFeePaise: 0,
  amountCollectedPaise: principalPaise,
  paymentMethod: 'CASH',
  details: { rechargeType: 'PREPAID', operator: 'JIO', subscriberNumber: '9876543210' },
  confirmed: true,
});

describe('Pay2All connector boundary and simulator', () => {
  let c: Client;
  let tenantId: string;
  beforeAll(async () => {
    ({ client: c, tenantId } = await onboard(t, ['RECHARGE', 'AEPS']));
  });

  it('is unavailable until entitled, configured and permitted; Live needs an API token', async () => {
    const ov = (await c.get('/v1/integrations').expect(200)).body.providers[0];
    expect(ov).toMatchObject({
      mode: 'DISABLED',
      liveAvailable: true,
      liveServices: ['RECHARGE', 'BILL_PAYMENT'],
      pendingServices: ['DMT', 'AEPS'],
    });
    expect(
      (await c.post('/v1/provider-operations', rechargeOp(10000), 'op-key-blocked-1').expect(409))
        .body.error.code,
    ).toBe('CONNECTOR_UNAVAILABLE');
    expect(
      (
        await c
          .put('/v1/integrations/pay2all', { mode: 'SIMULATOR', enabledServices: ['RECHARGE'] })
          .expect(402)
      ).body.error.code,
    ).toBe('ENTITLEMENT_REQUIRED');
    await c
      .put('/v1/integrations/pay2all', { mode: 'LIVE', enabledServices: ['RECHARGE'] })
      .expect(422);
    await admin
      .post(`/v1/admin/tenants/${tenantId}/entitlement-overrides`, {
        key: 'connectorEligible',
        value: true,
        reason: 'Simulator test',
      })
      .expect(201);
    const cfg = (
      await c
        .put('/v1/integrations/pay2all', {
          mode: 'SIMULATOR',
          enabledServices: ['RECHARGE', 'PAN'],
          credentials: { apiKey: 'sk_test_ABCDEFGH1234' },
        })
        .expect(200)
    ).body;
    expect(cfg.credentialsMasked).toEqual({ apiKey: '****1234' });
    expect(cfg.enabledServices).toEqual(['RECHARGE', 'PAN']);
    const row = await t.owner.connectorConfig.findFirstOrThrow({ where: { tenantId } });
    expect(row.credentialsEnc).not.toContain('ABCDEFGH');
    const avail = (await c.get('/v1/services').expect(200)).body.items;
    expect(
      avail.find((s: { code: string }) => s.code === 'RECHARGE').providerExecution.available,
    ).toBe(true);
    expect(avail.find((s: { code: string }) => s.code === 'AEPS').providerExecution).toMatchObject({
      available: false,
      reason: 'SERVICE_NOT_ENABLED',
    });
  });

  it('requires explicit confirmation and an Idempotency-Key', async () => {
    await c
      .post(
        '/v1/provider-operations',
        { ...rechargeOp(10000), confirmed: false },
        'op-key-unconfirmed',
      )
      .expect(422);
    await c.post('/v1/provider-operations', rechargeOp(10000)).expect(422);
  });

  it('confirmed outcome updates the provider-linked record; duplicate requests return the same operation', async () => {
    const r1 = (
      await c.post('/v1/provider-operations', rechargeOp(10000), 'op-key-confirmed-1').expect(200)
    ).body;
    expect(r1).toMatchObject({ status: 'CONFIRMED', outcomeKnown: true, mode: 'SIMULATOR' });
    expect(r1.record).toMatchObject({
      source: 'PROVIDER',
      isManual: false,
      opStatus: 'SUCCESSFUL',
      connectorStatus: 'CONFIRMED',
      postingStatus: 'UNPOSTED',
    });
    const r2 = (
      await c.post('/v1/provider-operations', rechargeOp(10000), 'op-key-confirmed-1').expect(200)
    ).body;
    expect(r2.id).toBe(r1.id);
    expect(
      await t.owner.providerOperation.count({
        where: { tenantId, idempotencyKey: 'op-key-confirmed-1' },
      }),
    ).toBe(1);
    expect(
      (await c.post('/v1/provider-operations', rechargeOp(20000), 'op-key-confirmed-1').expect(422))
        .body.error.code,
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('a timeout is recorded as UNKNOWN (never retried) and reconciliation resolves it', async () => {
    const r = (
      await c.post('/v1/provider-operations', rechargeOp(10013), 'op-key-timeout-1').expect(200)
    ).body;
    expect(r).toMatchObject({ status: 'UNKNOWN', outcomeKnown: false });
    expect(r.message).toMatch(/Do NOT repeat/);
    expect(r.record).toMatchObject({ opStatus: 'PENDING', connectorStatus: 'UNKNOWN' });
    await c
      .post(`/v1/records/${r.record.id}/transitions`, {
        version: r.record.version,
        to: 'SUCCESSFUL',
      })
      .expect(409); // unresolved
    const resolved = (await c.post(`/v1/provider-operations/${r.id}/reconcile`).expect(200)).body;
    expect(resolved).toMatchObject({ status: 'CONFIRMED' });
    expect(resolved.record.opStatus).toBe('SUCCESSFUL');
    expect(resolved.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'INITIATED',
      'UNKNOWN',
      'CONFIRMED',
    ]);
  });

  it('failed outcome marks the record failed', async () => {
    const r = (
      await c.post('/v1/provider-operations', rechargeOp(10099), 'op-key-failed-1').expect(200)
    ).body;
    expect(r).toMatchObject({ status: 'FAILED' });
    expect(r.record.opStatus).toBe('FAILED');
  });

  it('webhooks: signature verified on raw body, duplicates ignored, terminal states never overwritten', async () => {
    const pending = (
      await c.post('/v1/provider-operations', rechargeOp(10055), 'op-key-pending-1').expect(200)
    ).body;
    expect(pending.status).toBe('PENDING');
    const send = (body: object, sig?: string) => {
      const raw = JSON.stringify(body);
      return request(t.app.getHttpServer())
        .post('/v1/webhooks/simulator')
        .set('content-type', 'application/json')
        .set('x-sim-signature', sig ?? SimulatorAdapter.sign(SECRET, raw))
        .send(raw);
    };
    const evt = { deliveryId: 'dlv-0001', providerRef: pending.providerRef, status: 'CONFIRMED' };
    await send(evt, SimulatorAdapter.sign('wrong-secret', JSON.stringify(evt))).expect(401);
    await send(
      evt,
      SimulatorAdapter.sign(SECRET, JSON.stringify(evt), Math.floor(Date.now() / 1000) - 3600),
    ).expect(401); // replay window
    expect((await send(evt).expect(200)).body).toMatchObject({ duplicate: false });
    expect((await send(evt).expect(200)).body).toMatchObject({ duplicate: true });
    const op = (await c.get(`/v1/provider-operations/${pending.id}`).expect(200)).body;
    expect(op.status).toBe('CONFIRMED');
    // A conflicting late "FAILED" report becomes a reconciliation exception, not an overwrite.
    await send({
      deliveryId: 'dlv-0002',
      providerRef: pending.providerRef,
      status: 'FAILED',
    }).expect(200);
    expect((await c.get(`/v1/provider-operations/${pending.id}`).expect(200)).body.status).toBe(
      'CONFIRMED',
    );
    const ops = (await c.get('/v1/provider-operations').expect(200)).body;
    expect(
      ops.exceptions.some(
        (e: { kind: string; operationId: string }) =>
          e.kind === 'STATUS_MISMATCH' && e.operationId === pending.id,
      ),
    ).toBe(true);
    expect(
      await t.owner.webhookReceipt.count({ where: { signatureValid: false } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('manual records never create provider operations', async () => {
    const before = await t.owner.providerOperation.count({ where: { tenantId } });
    await c
      .post('/v1/records', { ...rechargeOp(5000), confirmed: undefined, opStatus: 'SUCCESSFUL' })
      .expect(201);
    expect(await t.owner.providerOperation.count({ where: { tenantId } })).toBe(before);
  });
});

describe('Exports', () => {
  it('are formula-safe, asynchronous and downloadable only by the requester', async () => {
    const { client: owner, tenantId } = await onboard(t, ['AEPS']);
    await admin
      .post(`/v1/admin/tenants/${tenantId}/entitlement-overrides`, {
        key: 'exportsEnabled',
        value: true,
        reason: 'Export test',
      })
      .expect(201);
    await owner
      .post('/v1/customers', {
        name: '=HYPERLINK("http://evil.example","click")',
        phone: '9811111111',
      })
      .expect(201);
    await owner.post('/v1/records', aepsRecord({ notes: '@SUM(1+1)' })).expect(201);

    const job = (await owner.post('/v1/exports', { type: 'CUSTOMERS' }).expect(201)).body;
    expect(job.status).toBe('QUEUED');
    await t.jobs.drain();
    const ready = (await owner.get(`/v1/exports/${job.id}`).expect(200)).body;
    expect(ready).toMatchObject({ status: 'READY', rowCount: 1 });
    const link = (await owner.get(`/v1/exports/${job.id}/download`).expect(200)).body;
    const token = new URL(link.url).pathname.split('/').pop()!;
    const file = await t.http().get(`/v1/files/${token}`).expect(200);
    const csv = file.text ?? file.body.toString();
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m);

    const recJob = (await owner.post('/v1/exports', { type: 'RECORDS' }).expect(201)).body;
    await t.jobs.drain();
    const recLink = (await owner.get(`/v1/exports/${recJob.id}/download`).expect(200)).body;
    const recCsv = (
      await t
        .http()
        .get(`/v1/files/${new URL(recLink.url).pathname.split('/').pop()}`)
        .expect(200)
    ).text;
    expect(recCsv).toContain(`"'@SUM(1+1)"`);
    expect(recCsv).toContain('"5000.00"'); // money exported as exact decimal rupees

    const { client: other } = await onboard(t, ['AEPS']);
    await other.get(`/v1/exports/${job.id}`).expect(404);
    await other.get(`/v1/exports/${job.id}/download`).expect(404);
    await t
      .http()
      .get(`/v1/files/${token.slice(0, -2)}xx`)
      .expect(403); // tampered signature
  });
});

describe('Attachments', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

  it('sniffs content, quarantines until scanned, and checks permission before issuing links', async () => {
    const { client: owner } = await onboard(t, ['AEPS']);
    const rec = (await owner.post('/v1/records', aepsRecord()).expect(201)).body;
    const upload = (cl: Client, buf: Buffer, name: string, ownerId = rec.id) =>
      t
        .http()
        .post('/v1/attachments')
        .set('authorization', `Bearer ${cl.token}`)
        .field('ownerType', 'RECORD')
        .field('ownerId', ownerId)
        .attach('file', buf, name);

    const bad = await upload(owner, Buffer.from('<script>alert(1)</script>'), 'receipt.png').expect(
      422,
    );
    expect(bad.body.error.code).toBe('FILE_REJECTED');
    const att = (await upload(owner, PNG, 'receipt.png').expect(201)).body;
    expect(att.scanStatus).toBe('PENDING');
    await owner.get(`/v1/attachments/${att.id}/url`).expect(409); // quarantined
    await t.jobs.drain(); // scan job (no scanner configured → SKIPPED)
    const link = (await owner.get(`/v1/attachments/${att.id}/url`).expect(200)).body;
    expect(link.expiresInSeconds).toBeLessThanOrEqual(3600);

    const { client: stranger } = await onboard(t, ['AEPS']);
    await stranger.get(`/v1/attachments/${att.id}/url`).expect(404);
    await upload(stranger, PNG, 'x.png').expect(404);
    const outsider = await signIn(t);
    await outsider.get(`/v1/attachments/${att.id}/url`).expect(409); // no shop selected
  });
});
