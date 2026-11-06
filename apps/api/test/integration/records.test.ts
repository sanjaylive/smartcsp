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
beforeAll(async () => {
  t = await setup();
  ({ client: c } = await onboard(t, ['AEPS', 'DMT', 'PAN', 'CUSTOM']));
  // Free plan allows 4 services; lift the record quota so this suite isn't limited by it.
  const tenant = await t.owner.membership.findFirstOrThrow({ where: { user: { email: c.email } } });
  await t.owner.entitlementOverride.create({
    data: {
      tenantId: tenant.tenantId,
      key: 'monthlyRecordLimit',
      value: 10000,
      reason: 'test',
      createdByUserId: tenant.userId,
    },
  });
  await t.owner.entitlementOverride.create({
    data: {
      tenantId: tenant.tenantId,
      key: 'enabledServiceLimit',
      value: 10,
      reason: 'test',
      createdByUserId: tenant.userId,
    },
  });
  for (const s of [
    'RECHARGE',
    'BILL_PAYMENT',
    'AADHAAR',
    'DOCUMENT',
    'MICRO_ATM',
    'ACCOUNT_OPENING',
  ])
    await c.put(`/v1/services/${s}`, { enabled: true }).expect(200);
});
afterAll(async () => t.close());

const base = { txnDate: today(), walkInName: 'Walk In', paymentMethod: 'CASH' };

describe('Core workflow for every service', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'RECHARGE',
      {
        opStatus: 'SUCCESSFUL',
        principalPaise: 23900,
        customerFeePaise: 0,
        amountCollectedPaise: 23900,
        expectedCommissionPaise: 700,
        details: { rechargeType: 'PREPAID', operator: 'AIRTEL', subscriberNumber: '9876543210' },
      },
    ],
    [
      'DMT',
      {
        opStatus: 'PENDING',
        principalPaise: 500000,
        customerFeePaise: 5000,
        amountCollectedPaise: 505000,
        details: {
          beneficiaryName: 'Anil',
          bankName: 'Demo Bank',
          accountLast4: '1234',
          ifsc: 'demo0001234',
        },
      },
    ],
    [
      'BILL_PAYMENT',
      {
        opStatus: 'SUCCESSFUL',
        principalPaise: 145000,
        customerFeePaise: 1000,
        amountCollectedPaise: 146000,
        details: {
          billCategory: 'ELECTRICITY',
          billerName: 'Demo Power',
          consumerId: 'CN123456789',
          billDueDate: today(),
        },
      },
    ],
    [
      'PAN',
      {
        opStatus: 'SUBMITTED',
        principalPaise: 10700,
        customerFeePaise: 5000,
        amountCollectedPaise: 15700,
        details: {
          applicationType: 'NEW',
          applicantName: 'Priya Sharma',
          acknowledgmentNo: 'ACK-0001',
        },
        followUpDate: today(),
      },
    ],
    [
      'AADHAAR',
      {
        opStatus: 'SUBMITTED',
        customerFeePaise: 5000,
        amountCollectedPaise: 5000,
        details: { serviceCategory: 'DEMOGRAPHIC_UPDATE', referenceNo: 'URN-778899' },
      },
    ],
    [
      'DOCUMENT',
      {
        opStatus: 'SUBMITTED',
        principalPaise: 3000,
        customerFeePaise: 2000,
        amountCollectedPaise: 5000,
        details: {
          documentCategory: 'INCOME_CERTIFICATE',
          department: 'Tehsil Office',
          checklist: [{ label: 'Photo', done: true }],
        },
      },
    ],
    [
      'AEPS',
      {
        opStatus: 'SUCCESSFUL',
        principalPaise: 0,
        customerFeePaise: 0,
        amountCollectedPaise: 0,
        paymentMethod: 'NONE',
        details: { operationType: 'BALANCE_ENQUIRY' },
      },
    ],
    [
      'MICRO_ATM',
      {
        opStatus: 'SUCCESSFUL',
        principalPaise: 200000,
        customerFeePaise: 1000,
        amountCollectedPaise: 1000,
        expectedCommissionPaise: 800,
        details: { operationType: 'CASH_WITHDRAWAL', terminalRef: 'TID-1' },
      },
    ],
    [
      'ACCOUNT_OPENING',
      {
        opStatus: 'SUBMITTED',
        customerFeePaise: 0,
        expectedCommissionPaise: 5000,
        details: { bankLabel: 'Demo Bank', applicantName: 'Ravi', accountLast4: '9876' },
      },
    ],
  ];

  it.each(cases)('%s: create, post, view', async (code, body) => {
    const r = await c
      .post('/v1/records', { ...base, serviceCode: code, post: code !== 'AEPS', ...body })
      .expect(201);
    expect(r.body).toMatchObject({ serviceCode: code, isManual: true, source: 'MOBILE_SYNC' }); // bearer-auth clients are tagged as mobile manual entries
    if (code === 'AEPS')
      expect(r.body.postingStatus).toBe('NOT_REQUIRED'); // enquiry: nothing to post
    else expect(r.body.postingStatus).toBe('POSTED');
    const detail = await c.get(`/v1/records/${r.body.id}`).expect(200);
    expect(detail.body.events[0]).toMatchObject({
      dimension: 'OPERATIONAL',
      toStatus: body.opStatus,
    });
    if (code === 'DMT') expect(detail.body.details.ifsc).toBe('DEMO0001234');
    if (code === 'PAN') expect(detail.body.followUps).toHaveLength(1);
  });

  it('custom services validate their bounded field definitions', async () => {
    const cs = await c
      .post('/v1/custom-services', {
        name: 'Photocopy',
        category: 'Printing',
        workflowType: 'TRANSACTION',
        defaultFeePaise: 200,
        fields: [{ key: 'pages', label: 'Pages', type: 'number', required: true }],
      })
      .expect(201);
    await c
      .post('/v1/records', {
        ...base,
        serviceCode: 'CUSTOM',
        customServiceId: cs.body.id,
        opStatus: 'SUCCESSFUL',
        customerFeePaise: 1000,
        amountCollectedPaise: 1000,
        details: { pages: 5 },
        post: true,
      })
      .expect(201);
    const bad = await c
      .post('/v1/records', {
        ...base,
        serviceCode: 'CUSTOM',
        customServiceId: cs.body.id,
        opStatus: 'SUCCESSFUL',
        details: { pages: 'five', script: 'x' },
      })
      .expect(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['details.pages']));
    await c
      .post('/v1/custom-services', {
        name: 'Bad',
        category: 'x1',
        workflowType: 'TRANSACTION',
        fields: [{ key: 'a b', label: 'x', type: 'eval' }],
      })
      .expect(422);
  });
});

describe('Validation and privacy', () => {
  it('rejects unknown detail keys (no biometric/PIN smuggling)', async () => {
    const r = await c
      .post(
        '/v1/records',
        aepsRecord({
          details: { operationType: 'CASH_WITHDRAWAL', fingerprintTemplate: 'xxx', pin: '1234' },
        }),
      )
      .expect(422);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });
  it('rejects Aadhaar and card numbers in free text', async () => {
    const r = await c
      .post('/v1/records', aepsRecord({ notes: 'aadhaar 2341 2341 2346' }))
      .expect(422);
    expect(r.body.error.code).toBe('SENSITIVE_DATA_REJECTED');
    await c
      .post('/v1/records', {
        ...base,
        serviceCode: 'AADHAAR',
        opStatus: 'SUBMITTED',
        details: { serviceCategory: 'OTHER', referenceNo: '234123412346' },
      })
      .expect(422);
    await c.post('/v1/customers', { name: 'Card 4111 1111 1111 1111' }).expect(422);
  });
  it('accepts a 12-digit bank RRN as an external reference', async () => {
    await c.post('/v1/records', aepsRecord({ externalRef: '234123412346' })).expect(201);
  });
  it('requires full-account details to be only the last 4 digits', async () => {
    await c
      .post(
        '/v1/records',
        dmtRecord({
          details: { beneficiaryName: 'A', bankName: 'B', accountLast4: '123456789012' },
        }),
      )
      .expect(422);
  });
  it('rejects fractional paise and over-collection', async () => {
    await c.post('/v1/records', aepsRecord({ customerFeePaise: 10.5 })).expect(422);
    const r = await c.post('/v1/records', dmtRecord({ amountCollectedPaise: 400000 })).expect(422);
    expect(r.body.error.code).toBe('AMOUNT_EXCEEDS_DUE');
  });
});

describe('Status, posting and corrections', () => {
  it('follows allowed transitions only and requires reasons for corrections', async () => {
    const r = (
      await c.post('/v1/records', dmtRecord({ opStatus: 'PENDING', post: false })).expect(201)
    ).body;
    const bad = await c
      .post(`/v1/records/${r.id}/transitions`, { version: r.version, to: 'COMPLETED' })
      .expect(409);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');
    const ok = await c
      .post(`/v1/records/${r.id}/transitions`, { version: r.version, to: 'SUCCESSFUL' })
      .expect(200);
    await c
      .post(`/v1/records/${r.id}/transitions`, { version: ok.body.version, to: 'FAILED' })
      .expect(422);
  });

  it('a posted record that failed must explicitly choose to reverse its cash entries', async () => {
    const r = (await c.post('/v1/records', dmtRecord()).expect(201)).body;
    const ask = await c
      .post(`/v1/records/${r.id}/transitions`, {
        version: r.version,
        to: 'FAILED',
        reason: 'Bank reversed transfer',
      })
      .expect(409);
    expect(ask.body.error.details.requires).toBe('reversePosting');
    const done = await c
      .post(`/v1/records/${r.id}/transitions`, {
        version: r.version,
        to: 'FAILED',
        reason: 'Bank reversed transfer',
        reversePosting: true,
      })
      .expect(200);
    expect(done.body).toMatchObject({ opStatus: 'FAILED', postingStatus: 'REVERSED' });
    const detail = await c.get(`/v1/records/${r.id}`).expect(200);
    const [orig, rev] = detail.body.journal;
    expect(orig.reversedByEntryId).toBe(rev.id);
    for (const line of orig.lines) {
      const mirror = rev.lines.find(
        (l: { account: string; debitPaise: number }) =>
          l.account === line.account && l.debitPaise === line.creditPaise,
      );
      expect(mirror).toBeDefined();
    }
  });

  it('locks amounts once posted; non-financial edits still work; reverse then correct then re-post', async () => {
    let r = (await c.post('/v1/records', aepsRecord()).expect(201)).body;
    const locked = await c
      .patch(`/v1/records/${r.id}`, { version: r.version, principalPaise: 400000 })
      .expect(409);
    expect(locked.body.error.code).toBe('RECORD_LOCKED');
    r = (
      await c
        .patch(`/v1/records/${r.id}`, {
          version: r.version,
          notes: 'Customer satisfied',
          externalRef: 'RRN1',
        })
        .expect(200)
    ).body;
    r = (
      await c
        .post(`/v1/records/${r.id}/reverse`, { version: r.version, reason: 'Wrong amount entered' })
        .expect(200)
    ).body;
    r = (
      await c
        .patch(`/v1/records/${r.id}`, { version: r.version, principalPaise: 400000 })
        .expect(200)
    ).body;
    r = (await c.post(`/v1/records/${r.id}/post`, { version: r.version }).expect(200)).body;
    expect(r).toMatchObject({ postingStatus: 'POSTED', principalPaise: 400000 });
    const detail = await c.get(`/v1/records/${r.id}`).expect(200);
    expect(detail.body.journal).toHaveLength(3); // original, reversal, corrected posting — history kept
  });

  it('optimistic concurrency: stale versions are rejected', async () => {
    const r = (await c.post('/v1/records', aepsRecord({ post: false })).expect(201)).body;
    await c.patch(`/v1/records/${r.id}`, { version: r.version, notes: 'first' }).expect(200);
    const stale = await c
      .patch(`/v1/records/${r.id}`, { version: r.version, notes: 'second' })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('cannot post the same record twice, even concurrently', async () => {
    const r = (await c.post('/v1/records', aepsRecord({ post: false })).expect(201)).body;
    const results = await Promise.all(
      [1, 2, 3].map(() => c.post(`/v1/records/${r.id}/post`, { version: r.version })),
    );
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(await t.owner.journalEntry.count({ where: { sourceId: r.id } })).toBe(1);
  });
});

describe('Mobile draft sync and idempotency', () => {
  it('clientRef returns the original record on retry (no duplicates)', async () => {
    const body = aepsRecord({ clientRef: 'draft-0f9c1d2e-0001' });
    const first = await c.post('/v1/records', body).expect(201);
    const retry = await c.post('/v1/records', body).expect(201);
    expect(retry.body).toMatchObject({ id: first.body.id, duplicate: true });
    const concurrent = await Promise.all(
      [1, 2, 3].map(() => c.post('/v1/records', aepsRecord({ clientRef: 'draft-0f9c1d2e-0002' }))),
    );
    const ids = new Set(concurrent.filter((x) => x.status === 201).map((x) => x.body.id));
    expect(ids.size).toBe(1);
    expect(await t.owner.serviceRecord.count({ where: { clientRef: 'draft-0f9c1d2e-0002' } })).toBe(
      1,
    );
  });

  it('Idempotency-Key replays the stored response and rejects a different body', async () => {
    const key = 'idem-key-records-0001';
    const a = await c.post('/v1/records', aepsRecord(), key).expect(201);
    const b = await c.post('/v1/records', aepsRecord(), key).expect(201);
    expect(b.body.id).toBe(a.body.id);
    const diff = await c
      .post('/v1/records', aepsRecord({ customerFeePaise: 2000, amountCollectedPaise: 2000 }), key)
      .expect(422);
    expect(diff.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('Disabled services', () => {
  it('blocks new entries but keeps history readable, with a reason', async () => {
    const r = (await c.post('/v1/records', dmtRecord()).expect(201)).body;
    await c.put('/v1/services/DMT', { enabled: false }).expect(200);
    const svc = (await c.get('/v1/services').expect(200)).body.items.find(
      (s: { code: string }) => s.code === 'DMT',
    );
    expect(svc).toMatchObject({ canCreate: false, reason: 'TENANT', hasHistory: true });
    const ctx = (await c.get('/v1/tenant/context').expect(200)).body;
    expect(ctx.quickActions.find((q: { code: string }) => q.code === 'DMT')).toBeUndefined();
    expect(ctx.serviceNavigation.find((q: { code: string }) => q.code === 'DMT')).toMatchObject({
      canCreate: false,
      reason: 'TENANT',
    });
    await c.post('/v1/records', dmtRecord()).expect(403);
    await c.get(`/v1/records/${r.id}`).expect(200);
    expect((await c.get('/v1/records?service=DMT').expect(200)).body.total).toBeGreaterThan(0);
    await c.put('/v1/services/DMT', { enabled: true }).expect(200);
  });
});
