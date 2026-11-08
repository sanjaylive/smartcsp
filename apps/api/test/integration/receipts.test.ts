import { memoryOutbox } from '../../src/modules/email/email.service';
import { addStaff, dmtRecord, onboard, setup, type Client, type TestCtx } from '../helpers';

let t: TestCtx;
let owner: Client;
let recordId: string;

beforeAll(async () => {
  t = await setup();
  ({ client: owner } = await onboard(t, ['DMT', 'AEPS'], 'Receipt Kendra'));
  const c = (
    await owner
      .post('/v1/customers', {
        name: 'Geeta Devi',
        phone: '9876543210',
        email: 'geeta@example.test',
      })
      .expect(201)
  ).body;
  recordId = (
    await owner
      .post(
        '/v1/records',
        dmtRecord({
          walkInName: null,
          customerId: c.id,
          amountCollectedPaise: 250000,
          principalPaise: 250000,
          customerFeePaise: 3000,
          externalRef: 'TXN12345',
        }),
      )
      .expect(201)
  ).body.id;
});
afterAll(async () => t.close());

describe('Customer receipts', () => {
  it('builds a receipt with masked details and the amount still due', async () => {
    const r = (await owner.get(`/v1/records/${recordId}/receipt`).expect(200)).body;
    expect(r.shop.name).toBe('Receipt Kendra');
    expect(r.receiptNo).toMatch(/^R-\d{5}$/);
    expect(r.customer).toMatchObject({ name: 'Geeta Devi' });
    expect(r.customer.phone).not.toContain('98765'); // masked
    expect(r.amounts).toMatchObject({
      principalPaise: 250000,
      feePaise: 3000,
      totalPaise: 253000,
      paidPaise: 250000,
      duePaise: 3000,
    });
    // Account numbers only ever as last 4; sender mobile (sensitive) is left out.
    const values = r.details.map((d: { value: string }) => d.value).join(' ');
    expect(values).toContain('••••4321');
    expect(r.text).toContain('Balance due');
    expect(r.text).toContain('TXN12345');
    expect(r).toMatchObject({ canEmailCustomer: true, canMessageCustomer: true });
  });

  it('emails the receipt to the customer by default, or to a given address', async () => {
    const before = memoryOutbox.length;
    const sent = (
      await owner.post(`/v1/records/${recordId}/receipt/send`, { channel: 'email' }).expect(200)
    ).body;
    expect(sent).toMatchObject({ sent: true, channel: 'email' });
    expect(sent.to).not.toBe('geeta@example.test'); // masked in the response
    const msg = memoryOutbox.at(-1)!;
    expect(memoryOutbox.length).toBe(before + 1);
    expect(msg.to).toBe('geeta@example.test');
    expect(msg.subject).toContain('Receipt Kendra');
    expect(msg.html).toContain('Balance due');
    await owner
      .post(`/v1/records/${recordId}/receipt/send`, { channel: 'email', to: 'not-an-email' })
      .expect(422);
  });

  it('reports when WhatsApp sending is not connected', async () => {
    const r = await owner.post(`/v1/records/${recordId}/receipt/send`, { channel: 'whatsapp' });
    expect(r.body.error?.code).toBe('MESSAGING_NOT_CONFIGURED');
  });

  it('only people who can see the record can get its receipt', async () => {
    const { client: operator } = await addStaff(t, owner, 'OPERATOR', {
      revokes: ['records.view_all'],
    });
    await operator.get(`/v1/records/${recordId}/receipt`).expect(404);
    const { client: other } = await onboard(t, ['DMT'], 'Other Kendra');
    await other.get(`/v1/records/${recordId}/receipt`).expect(404);
  });
});
