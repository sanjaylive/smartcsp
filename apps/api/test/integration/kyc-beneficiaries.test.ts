import { addStaff, dmtRecord, onboard, setup, type Client, type TestCtx } from '../helpers';

let t: TestCtx;
let owner: Client;
let customerId: string;

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

beforeAll(async () => {
  t = await setup();
  ({ client: owner } = await onboard(t, ['DMT', 'AEPS']));
  customerId = (
    await owner.post('/v1/customers', { name: 'Geeta Devi', phone: '9876543210' }).expect(201)
  ).body.id;
});
afterAll(async () => t.close());

describe('Customer KYC', () => {
  it('starts as NONE and needs ID type + last 4 to be marked verified', async () => {
    const c = (await owner.get(`/v1/customers/${customerId}`).expect(200)).body;
    expect(c.customer?.kyc ?? c.kyc).toMatchObject({ status: 'NONE' });
    const k = (await owner.get(`/v1/customers/${customerId}/kyc`).expect(200)).body;
    await owner
      .patch(`/v1/customers/${customerId}/kyc`, { version: k.version, status: 'VERIFIED' })
      .expect(422);
    // Full numbers are refused: only the last 4 characters are ever stored.
    await owner
      .patch(`/v1/customers/${customerId}/kyc`, {
        version: k.version,
        status: 'VERIFIED',
        idType: 'AADHAAR',
        idLast4: '1234 5678 9012',
      })
      .expect(422);
    const v = (
      await owner
        .patch(`/v1/customers/${customerId}/kyc`, {
          version: k.version,
          status: 'VERIFIED',
          idType: 'AADHAAR',
          idLast4: '9012',
        })
        .expect(200)
    ).body;
    expect(v.kyc).toMatchObject({ status: 'VERIFIED', idType: 'AADHAAR', idLast4: '9012' });
    expect(v.kyc.verifiedAt).toBeTruthy();
  });

  it('ID photos need customers.view_sensitive to upload or view', async () => {
    const upload = (cl: Client) =>
      t
        .http()
        .post('/v1/attachments')
        .set('authorization', `Bearer ${cl.token}`)
        .field('ownerType', 'CUSTOMER_KYC')
        .field('ownerId', customerId)
        .attach('file', PNG, 'aadhaar-front.png');
    const doc = (await upload(owner).expect(201)).body;
    const k = (await owner.get(`/v1/customers/${customerId}/kyc`).expect(200)).body;
    expect(k.documents.map((d: { id: string }) => d.id)).toContain(doc.id);

    const { client: limited } = await addStaff(t, owner, 'OPERATOR', {
      grants: ['customers.manage', 'attachments.upload'],
      revokes: ['customers.view_sensitive'],
    });
    await upload(limited).expect(403);
    await limited.get(`/v1/customers/${customerId}/kyc`).expect(403);
    await limited.get(`/v1/attachments/${doc.id}/url`).expect(403);
    // Without view_sensitive the masked ID is hidden too.
    const seen = (await limited.get(`/v1/customers/${customerId}`).expect(200)).body;
    expect((seen.customer ?? seen).kyc).toMatchObject({ status: 'VERIFIED', idLast4: null });
  });
});

describe('DMT beneficiaries', () => {
  it('saves, lists, de-duplicates and turns off beneficiaries', async () => {
    const b = (
      await owner
        .post(`/v1/customers/${customerId}/beneficiaries`, {
          name: 'Anil Kumar',
          bankName: 'Demo Bank',
          accountNumber: '501002345674321',
          ifsc: 'sbin0001234',
        })
        .expect(201)
    ).body;
    expect(b).toMatchObject({ ifsc: 'SBIN0001234', active: true });
    await owner
      .post(`/v1/customers/${customerId}/beneficiaries`, {
        name: 'Anil Kumar',
        bankName: 'Demo Bank',
        accountNumber: '501002345674321',
      })
      .expect(409);
    await owner
      .post(`/v1/customers/${customerId}/beneficiaries`, {
        name: 'Short number',
        bankName: 'Demo Bank',
        accountNumber: '4321',
      })
      .expect(422);

    // Using the beneficiary on a DMT record moves it to the top.
    await owner
      .post(
        '/v1/records',
        dmtRecord({
          walkInName: null,
          customerId,
          details: {
            beneficiaryName: 'Anil Kumar',
            bankName: 'Demo Bank',
            accountNumber: '501002345674321',
            transferMode: 'IMPS',
          },
        }),
      )
      .expect(201);
    const list = (await owner.get(`/v1/customers/${customerId}/beneficiaries`).expect(200)).body
      .items;
    expect(list[0]).toMatchObject({ id: b.id });
    expect(list[0].lastUsedAt).toBeTruthy();

    const off = (
      await owner
        .patch(`/v1/customers/${customerId}/beneficiaries/${b.id}`, {
          version: b.version,
          active: false,
        })
        .expect(200)
    ).body;
    expect(off.active).toBe(false);
  });

  it('other shops cannot see or add beneficiaries for this customer', async () => {
    const { client: other } = await onboard(t, ['DMT'], 'Other Kendra');
    await other.get(`/v1/customers/${customerId}/beneficiaries`).expect(404);
    await other
      .post(`/v1/customers/${customerId}/beneficiaries`, {
        name: 'X Y',
        bankName: 'Bank',
        accountNumber: '111122223333',
      })
      .expect(404);
  });
});
