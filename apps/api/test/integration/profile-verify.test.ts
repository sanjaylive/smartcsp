import { createAdmin, onboard, setup, type TestCtx } from '../helpers';

let t: TestCtx;
let admin: Awaited<ReturnType<Awaited<ReturnType<typeof createAdmin>>['session']>>;
beforeAll(async () => {
  t = await setup();
  admin = await (await createAdmin(t)).session();
});
afterAll(async () => t.close());

describe('own profile', () => {
  it('updates name and language, and validates input', async () => {
    const { client: c } = await onboard(t, ['DMT']);
    const me = (
      await c.patch('/v1/auth/me', { displayName: '  Ravi Kumar ', locale: 'hi' }).expect(200)
    ).body;
    expect(me.user).toMatchObject({ displayName: 'Ravi Kumar', locale: 'hi' });
    expect((await c.get('/v1/auth/me').expect(200)).body.user.displayName).toBe('Ravi Kumar');
    await c.patch('/v1/auth/me', { displayName: 'R' }).expect(422);
    await c.patch('/v1/auth/me', { locale: 'fr' }).expect(422);
    await c.patch('/v1/auth/me', {}).expect(422);
  });
});

describe('beneficiary account verification', () => {
  const acct = { accountNumber: '501002345674321', ifsc: 'SBIN0001234' };

  it('is unavailable without a connected provider', async () => {
    const { client: c } = await onboard(t, ['DMT']);
    expect((await c.get('/v1/beneficiaries/verify').expect(200)).body).toMatchObject({
      available: false,
    });
    expect((await c.post('/v1/beneficiaries/verify', acct).expect(409)).body.error.code).toBe(
      'CONNECTOR_UNAVAILABLE',
    );
  });

  it('looks up the holder name through the simulator once connected', async () => {
    const { client: c, tenantId } = await onboard(t, ['DMT']);
    await admin
      .post(`/v1/admin/tenants/${tenantId}/entitlement-overrides`, {
        key: 'connectorEligible',
        value: true,
        reason: 'Verify test',
      })
      .expect(201);
    await c
      .put('/v1/integrations/pay2all', { mode: 'SIMULATOR', enabledServices: ['DMT'] })
      .expect(200);
    expect((await c.get('/v1/beneficiaries/verify').expect(200)).body).toMatchObject({
      available: true,
      mode: 'SIMULATOR',
    });
    const r1 = (await c.post('/v1/beneficiaries/verify', acct).expect(200)).body;
    expect(r1).toMatchObject({ verified: true, mode: 'SIMULATOR' });
    expect(r1.name).toMatch(/^[A-Z]+ [A-Z]+$/);
    // Same account → same name.
    expect((await c.post('/v1/beneficiaries/verify', acct).expect(200)).body.name).toBe(r1.name);
    expect(
      (
        await c
          .post('/v1/beneficiaries/verify', { ...acct, accountNumber: '123456789000' })
          .expect(200)
      ).body,
    ).toMatchObject({ verified: false });
    await c.post('/v1/beneficiaries/verify', { ...acct, ifsc: 'BAD' }).expect(422);
    await c.post('/v1/beneficiaries/verify', { ...acct, accountNumber: '4321' }).expect(422);
    // Only the last 4 digits reach the audit log.
    const audit = await t.owner.auditEvent.findFirstOrThrow({
      where: { tenantId, action: 'beneficiary.account_verified' },
    });
    expect(JSON.stringify(audit)).not.toContain(acct.accountNumber);
  });
});
