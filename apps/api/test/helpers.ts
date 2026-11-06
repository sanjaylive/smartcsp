import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { localDate, type ServiceCode } from '@csp2all/shared';
import { resetConfigForTests } from '../src/config/config';
import { createApp } from '../src/bootstrap';
import { memoryOutbox } from '../src/modules/email/email.service';
import { JobsService } from '../src/jobs/jobs.service';
import { totpAt } from '../src/common/crypto';

export const OWNER_DB_URL =
  process.env.TEST_OWNER_DATABASE_URL ??
  'postgresql://csp2all_owner:owner_dev_only@127.0.0.1:56632/csp2all_test';
export const today = () => localDate(new Date(), 'Asia/Kolkata');

let counter = 0;
export const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${Date.now().toString(36)}.${++counter}.${randomUUID().slice(0, 6)}@example.test`;

export interface TestCtx {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  jobs: JobsService;
  owner: PrismaClient;
  close: () => Promise<void>;
}

export async function setup(): Promise<TestCtx> {
  resetConfigForTests(process.env);
  const app = await createApp({ logger: false });
  await app.init();
  const owner = new PrismaClient({ datasources: { db: { url: OWNER_DB_URL } } });
  return {
    app,
    http: () => request(app.getHttpServer()),
    jobs: app.get(JobsService),
    owner,
    close: async () => {
      await owner.$disconnect();
      await app.close();
    },
  };
}

export function lastCodeFor(email: string): string {
  const msg = [...memoryOutbox].reverse().find((m) => m.to === email);
  if (!msg) throw new Error(`No email for ${email}`);
  return msg.subject.slice(0, 6);
}

/** API client bound to a bearer token (mobile-style auth: no CSRF needed). */
export class Client {
  constructor(
    private readonly t: TestCtx,
    public token: string,
    public readonly email: string,
    public refreshToken?: string,
  ) {}
  private with(r: request.Test, idem?: string) {
    r.set('authorization', `Bearer ${this.token}`);
    if (idem) r.set('idempotency-key', idem);
    return r;
  }
  get(path: string) {
    return this.with(this.t.http().get(path));
  }
  post(path: string, body: unknown = {}, idem?: string) {
    return this.with(
      this.t
        .http()
        .post(path)
        .send(body as object),
      idem,
    );
  }
  put(path: string, body: unknown = {}) {
    return this.with(
      this.t
        .http()
        .put(path)
        .send(body as object),
    );
  }
  patch(path: string, body: unknown = {}) {
    return this.with(
      this.t
        .http()
        .patch(path)
        .send(body as object),
    );
  }
  delete(path: string) {
    return this.with(this.t.http().delete(path));
  }
}

export async function signIn(t: TestCtx, email = uniqueEmail()): Promise<Client> {
  const r1 = await t.http().post('/v1/auth/otp/request').send({ email, consent: true }).expect(202);
  const r2 = await t
    .http()
    .post('/v1/auth/otp/verify')
    .send({
      challengeId: r1.body.challengeId,
      email,
      code: lastCodeFor(email),
      client: 'mobile',
      deviceName: 'jest',
    })
    .expect(200);
  return new Client(t, r2.body.tokens.accessToken, email, r2.body.tokens.refreshToken);
}

export async function onboard(
  t: TestCtx,
  services: ServiceCode[] = ['AEPS', 'DMT', 'PAN'],
  shopName = 'Test Seva Kendra',
) {
  const c = await signIn(t, uniqueEmail('owner'));
  await c
    .put('/v1/onboarding/shop')
    .send({
      shopName,
      ownerName: 'Test Owner',
      state: 'Uttar Pradesh',
      district: 'Agra',
      preferredLanguage: 'en',
    })
    .expect(200);
  await c.put('/v1/onboarding/services').send({ services }).expect(200);
  const done = await c.post('/v1/onboarding/complete').expect(200);
  return { client: c, tenantId: done.body.tenantId as string };
}

/** Adds a staff member and returns a signed-in client with that membership selected. */
export async function addStaff(
  t: TestCtx,
  ownerClient: Client,
  role: 'MANAGER' | 'OPERATOR' | 'ACCOUNTANT',
  opts: { grants?: string[]; revokes?: string[] } = {},
) {
  const email = uniqueEmail(role.toLowerCase());
  const inv = await ownerClient.post('/v1/staff/invite', {
    email,
    displayName: `Test ${role}`,
    role,
    grants: opts.grants ?? [],
    revokes: opts.revokes ?? [],
  });
  if (inv.status !== 201)
    throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`);
  const c = await signIn(t, email);
  return { client: c, membershipId: inv.body.id as string, userId: inv.body.userId as string };
}

export function aepsRecord(overrides: Record<string, unknown> = {}) {
  return {
    serviceCode: 'AEPS',
    walkInName: 'Ramesh Kumar',
    txnDate: today(),
    opStatus: 'SUCCESSFUL',
    principalPaise: 500000,
    customerFeePaise: 1000,
    expectedCommissionPaise: 1250,
    paymentMethod: 'CASH',
    amountCollectedPaise: 1000,
    principalMethod: 'CASH',
    details: { operationType: 'CASH_WITHDRAWAL', bankLabel: 'Demo Gramin Bank' },
    post: true,
    ...overrides,
  };
}

export function dmtRecord(overrides: Record<string, unknown> = {}) {
  return {
    serviceCode: 'DMT',
    walkInName: 'Sunita Devi',
    txnDate: today(),
    opStatus: 'SUCCESSFUL',
    principalPaise: 300000,
    customerFeePaise: 3000,
    expectedCommissionPaise: 600,
    paymentMethod: 'CASH',
    amountCollectedPaise: 303000,
    details: {
      beneficiaryName: 'Anil Kumar',
      bankName: 'Demo Bank',
      accountLast4: '4321',
      transferMode: 'IMPS',
    },
    post: true,
    ...overrides,
  };
}

/** Signs in the given platform admin (pre-enrolled TOTP) and returns a cookie-bearing agent with CSRF. */
export async function adminSession(t: TestCtx, email: string, secret: string) {
  const agent = request.agent(t.app.getHttpServer());
  const r1 = await agent
    .post('/v1/admin/auth/otp/request')
    .send({ email, consent: true })
    .expect(202);
  const r2 = await agent
    .post('/v1/admin/auth/otp/verify')
    .send({ challengeId: r1.body.challengeId, email, code: lastCodeFor(email) })
    .expect(200);
  const csrf = r2.body.csrfToken as string;
  const code = totpAt(secret, Math.floor(Date.now() / 30000));
  await agent
    .post('/v1/admin/auth/totp/verify')
    .set('x-csrf-token', csrf)
    .send({ code })
    .expect(200);
  return {
    agent,
    get: (p: string) => agent.get(p),
    post: (p: string, b: object = {}) => agent.post(p).set('x-csrf-token', csrf).send(b),
    patch: (p: string, b: object = {}) => agent.patch(p).set('x-csrf-token', csrf).send(b),
    put: (p: string, b: object = {}) => agent.put(p).set('x-csrf-token', csrf).send(b),
    del: (p: string) => agent.delete(p).set('x-csrf-token', csrf),
  };
}

export async function createAdmin(t: TestCtx, role: 'SUPER_ADMIN' | 'SUPPORT' = 'SUPER_ADMIN') {
  const { encryptSecret } = await import('../src/common/crypto');
  const email = uniqueEmail('admin');
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DP';
  const user = await t.owner.user.create({ data: { email } });
  await t.owner.platformAdmin.create({
    data: {
      userId: user.id,
      role,
      totpSecretEnc: encryptSecret(secret),
      totpEnabledAt: new Date(),
    },
  });
  return { email, secret, userId: user.id, session: () => adminSession(t, email, secret) };
}
