import { addStaff, dmtRecord, onboard, setup, type Client, type TestCtx } from '../helpers';

let t: TestCtx;
let owner: Client;

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

beforeAll(async () => {
  t = await setup();
  ({ client: owner } = await onboard(t, ['DMT']));
});
afterAll(async () => t.close());

const upi = {
  kind: 'UPI',
  label: 'PhonePe counter',
  upiId: 'MyShop@ybl',
  payeeName: 'My Shop',
  upiApp: 'PHONEPE',
};
const bank = {
  kind: 'BANK',
  label: 'SBI current',
  holderName: 'My Shop',
  bankName: 'State Bank of India',
  accountNumber: '3091 2345 6743',
  ifsc: 'sbin0001234',
};

describe('Shop payment accounts', () => {
  it('adds UPI and bank accounts; the first of each kind is the default; staff can read', async () => {
    const u = (await owner.post('/v1/payment-accounts', upi).expect(201)).body;
    expect(u).toMatchObject({ kind: 'UPI', upiId: 'myshop@ybl', isDefault: true, active: true });
    const b = (await owner.post('/v1/payment-accounts', bank).expect(201)).body;
    expect(b).toMatchObject({
      kind: 'BANK',
      accountNumber: '309123456743',
      ifsc: 'SBIN0001234',
      isDefault: true,
    });

    // Validation: bad UPI ID / IFSC, duplicate label.
    const badUpi = await owner
      .post('/v1/payment-accounts', { ...upi, label: 'X1', upiId: 'not-an-upi' })
      .expect(422);
    expect(badUpi.body.error.fields.upiId).toBeDefined();
    await owner.post('/v1/payment-accounts', { ...bank, label: 'B2', ifsc: '1234' }).expect(422);
    await owner.post('/v1/payment-accounts', upi).expect(409);

    // A second UPI made default takes over.
    const u2 = (
      await owner
        .post('/v1/payment-accounts', {
          ...upi,
          label: 'Paytm',
          upiId: 'shop@paytm',
          isDefault: true,
        })
        .expect(201)
    ).body;
    const list = (await owner.get('/v1/payment-accounts').expect(200)).body.items as Array<{
      id: string;
      isDefault: boolean;
    }>;
    expect(list.find((x) => x.id === u2.id)?.isDefault).toBe(true);
    expect(list.find((x) => x.id === u.id)?.isDefault).toBe(false);

    const op = await addStaff(t, owner, 'OPERATOR');
    expect((await op.client.get('/v1/payment-accounts').expect(200)).body.items).toHaveLength(3);
    await op.client.post('/v1/payment-accounts', { ...upi, label: 'Nope' }).expect(403);
  });

  it('uploads a QR image for a UPI account and serves it to staff', async () => {
    const acct = (
      await owner
        .post('/v1/payment-accounts', { ...upi, label: 'QR only', upiId: null })
        .expect(201)
    ).body;
    const upload = (ownerType: string, ownerId: string, buf = PNG) =>
      t
        .http()
        .post('/v1/attachments')
        .set('authorization', `Bearer ${owner.token}`)
        .field('ownerType', ownerType)
        .field('ownerId', ownerId)
        .attach('file', buf, 'qr.png');
    const att = (await upload('PAYMENT_QR', acct.id).expect(201)).body;
    await upload('PAYMENT_QR', acct.id, Buffer.from('%PDF-1.4 fake')).expect(422);
    await t.jobs.drain();
    const list = (await owner.get('/v1/payment-accounts').expect(200)).body.items as Array<{
      id: string;
      qrAttachmentId: string | null;
    }>;
    expect(list.find((x) => x.id === acct.id)?.qrAttachmentId).toBe(att.id);
    await owner.get(`/v1/attachments/${att.id}/url`).expect(200);

    // Bank accounts don't take QR images.
    const b = (await owner.get('/v1/payment-accounts').expect(200)).body.items.find(
      (x: { kind: string }) => x.kind === 'BANK',
    );
    await upload('PAYMENT_QR', b.id).expect(404);

    // Removing the image unlinks it.
    await owner.delete(`/v1/attachments/${att.id}`).expect(200);
    const after = (await owner.get('/v1/payment-accounts').expect(200)).body.items.find(
      (x: { id: string }) => x.id === acct.id,
    );
    expect(after.qrAttachmentId).toBeNull();
  });

  it('records which account a UPI / bank payment went into, and checks the kind', async () => {
    const items = (await owner.get('/v1/payment-accounts').expect(200)).body.items as Array<{
      id: string;
      kind: string;
      label: string;
    }>;
    const upiAcct = items.find((x) => x.kind === 'UPI')!;
    const bankAcct = items.find((x) => x.kind === 'BANK')!;

    const rec = (
      await owner
        .post('/v1/records', dmtRecord({ paymentMethod: 'UPI', paymentAccountId: upiAcct.id }))
        .expect(201)
    ).body;
    expect(rec.paymentAccountId).toBe(upiAcct.id);

    const wrongKind = await owner
      .post('/v1/records', dmtRecord({ paymentMethod: 'UPI', paymentAccountId: bankAcct.id }))
      .expect(422);
    expect(wrongKind.body.error.fields.paymentAccountId).toBeDefined();
    await owner
      .post('/v1/records', dmtRecord({ paymentMethod: 'CASH', paymentAccountId: upiAcct.id }))
      .expect(422);

    // Another shop's account is not accepted.
    const { client: other } = await onboard(t, ['DMT']);
    await other
      .post('/v1/records', dmtRecord({ paymentMethod: 'BANK', paymentAccountId: bankAcct.id }))
      .expect(422);
    expect((await other.get('/v1/payment-accounts').expect(200)).body.items).toHaveLength(0);

    // Used accounts are switched off rather than deleted.
    const del = (await owner.delete(`/v1/payment-accounts/${upiAcct.id}`).expect(200)).body;
    expect(del.deleted).toBe(false);
    const unused = items.find((x) => x.label === 'QR only')!;
    expect((await owner.delete(`/v1/payment-accounts/${unused.id}`).expect(200)).body.deleted).toBe(
      true,
    );
  });
});
