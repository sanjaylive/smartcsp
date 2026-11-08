import request from 'supertest';
import { memoryOutbox } from '../../src/modules/email/email.service';
import { lastCodeFor, setup, signIn, uniqueEmail, type TestCtx } from '../helpers';

let t: TestCtx;
beforeAll(async () => (t = await setup()));
afterAll(async () => t.close());

const requestOtp = (email: string) =>
  t.http().post('/v1/auth/otp/request').send({ email, consent: true });
const verify = (challengeId: string, email: string, code: string, client = 'mobile') =>
  t.http().post('/v1/auth/otp/verify').send({ challengeId, email, code, client });
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

describe('Email OTP', () => {
  it('requires consent and a valid email, with field errors', async () => {
    const r = await t
      .http()
      .post('/v1/auth/otp/request')
      .send({ email: 'nope', consent: false })
      .expect(422);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['email', 'consent']));
  });

  it('returns the same generic response for new and existing accounts and normalises email', async () => {
    const existing = await signIn(t);
    const a = await requestOtp(existing.email.toUpperCase()).expect(202);
    const b = await requestOtp(uniqueEmail('new')).expect(202);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
    expect(a.body).not.toHaveProperty('code');
    // Never reveal who owns an email address to an unauthenticated caller.
    expect(a.body).not.toHaveProperty('name');
    expect(b.body).not.toHaveProperty('name');
  });

  it('has no public account-lookup endpoint', async () => {
    await t.http().post('/v1/auth/check').send({ email: 'x@example.test' }).expect(404);
  });

  it('stores only a keyed hash, never the code', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    const code = lastCodeFor(email);
    const row = await t.owner.otpChallenge.findUniqueOrThrow({ where: { id: r.body.challengeId } });
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(code);
  });

  it('is single-use: a replayed code is rejected', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    const code = lastCodeFor(email);
    await verify(r.body.challengeId, email, code).expect(200);
    const again = await verify(r.body.challengeId, email, code).expect(400);
    expect(again.body.error.code).toBe('OTP_INVALID');
  });

  it('concurrent verification of the same code succeeds exactly once', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    const code = lastCodeFor(email);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => verify(r.body.challengeId, email, code)),
    );
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
  });

  it('is bound to the email it was issued for', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    const res = await verify(r.body.challengeId, uniqueEmail('other'), lastCodeFor(email)).expect(
      400,
    );
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('locks after the configured number of wrong attempts', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    const code = lastCodeFor(email);
    for (let i = 0; i < 4; i++)
      expect(
        (await verify(r.body.challengeId, email, wrong(code)).expect(400)).body.error.code,
      ).toBe('OTP_INVALID');
    expect((await verify(r.body.challengeId, email, wrong(code)).expect(429)).body.error.code).toBe(
      'OTP_ATTEMPTS_EXCEEDED',
    );
    expect((await verify(r.body.challengeId, email, code).expect(429)).body.error.code).toBe(
      'OTP_ATTEMPTS_EXCEEDED',
    );
  });

  it('expires', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    await t.owner.otpChallenge.update({
      where: { id: r.body.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await verify(r.body.challengeId, email, lastCodeFor(email)).expect(400)).body.error.code,
    ).toBe('OTP_EXPIRED');
  });

  it('a newer code supersedes the previous one', async () => {
    const email = uniqueEmail();
    const first = await requestOtp(email).expect(202);
    const firstCode = lastCodeFor(email);
    await requestOtp(email).expect(202);
    expect(
      (await verify(first.body.challengeId, email, firstCode).expect(400)).body.error.code,
    ).toBe('OTP_INVALID');
  });

  it('enforces the resend cooldown and the per-email hourly limit', async () => {
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
    const { resetConfigForTests } = await import('../../src/config/config');
    resetConfigForTests(process.env);
    try {
      const email = uniqueEmail();
      await requestOtp(email).expect(202);
      const r = await requestOtp(email).expect(429);
      expect(r.body.error.code).toBe('OTP_RESEND_COOLDOWN');
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
      resetConfigForTests(process.env);
    }
    const email = uniqueEmail();
    for (let i = 0; i < 20; i++) await requestOtp(email).expect(202);
    expect((await requestOtp(email).expect(429)).body.error.code).toBe('RATE_LIMITED');
  });

  it('never puts the code in API responses', async () => {
    const email = uniqueEmail();
    const r = await requestOtp(email).expect(202);
    expect(JSON.stringify(r.body)).not.toContain(lastCodeFor(email));
    expect(memoryOutbox.at(-1)?.to).toBe(email);
  });
});

describe('Web sessions (cookies + CSRF)', () => {
  async function webLogin() {
    const agent = request.agent(t.app.getHttpServer());
    const email = uniqueEmail('web');
    const r = await agent.post('/v1/auth/otp/request').send({ email, consent: true }).expect(202);
    const v = await agent
      .post('/v1/auth/otp/verify')
      .send({ challengeId: r.body.challengeId, email, code: lastCodeFor(email), client: 'web' })
      .expect(200);
    return {
      agent,
      csrf: v.body.csrfToken as string,
      setCookie: v.headers['set-cookie'] as unknown as string[],
    };
  }

  it('sets an httpOnly SameSite session cookie and returns no bearer token', async () => {
    const { setCookie } = await webLogin();
    const sid = setCookie.find((c) => c.startsWith('csp2all_sid='))!;
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);
  });

  it('rejects unsafe requests without a matching CSRF token or from a foreign origin', async () => {
    const { agent, csrf } = await webLogin();
    await agent.get('/v1/auth/me').expect(200);
    expect((await agent.put('/v1/onboarding/shop').send({}).expect(403)).body.error.code).toBe(
      'CSRF_FAILED',
    );
    expect(
      (
        await agent
          .put('/v1/onboarding/shop')
          .set('x-csrf-token', 'x'.repeat(30))
          .send({})
          .expect(403)
      ).body.error.code,
    ).toBe('CSRF_FAILED');
    expect(
      (
        await agent
          .put('/v1/onboarding/shop')
          .set('x-csrf-token', csrf)
          .set('origin', 'https://evil.example')
          .send({})
          .expect(403)
      ).body.error.code,
    ).toBe('CSRF_FAILED');
    await agent
      .put('/v1/onboarding/shop')
      .set('x-csrf-token', csrf)
      .set('origin', 'http://localhost:3610')
      .send({ shopName: 'Web Shop', ownerName: 'Owner', state: 'Bihar', district: 'Patna' })
      .expect(200);
  });

  it('logout revokes the session; logout-all revokes other devices', async () => {
    const { agent, csrf } = await webLogin();
    await agent.post('/v1/auth/logout').set('x-csrf-token', csrf).expect(200);
    await agent.get('/v1/auth/me').expect(401);

    const mobile1 = await signIn(t);
    const r = await t
      .http()
      .post('/v1/auth/otp/request')
      .send({ email: mobile1.email, consent: true });
    const v = await t
      .http()
      .post('/v1/auth/otp/verify')
      .send({
        challengeId: r.body.challengeId,
        email: mobile1.email,
        code: lastCodeFor(mobile1.email),
        client: 'mobile',
      });
    const sessions = await mobile1.get('/v1/auth/sessions').expect(200);
    expect(sessions.body.items.length).toBe(2);
    await mobile1.post('/v1/auth/logout-all').expect(200);
    await t
      .http()
      .get('/v1/auth/me')
      .set('authorization', `Bearer ${v.body.tokens.accessToken}`)
      .expect(401);
  });
});

describe('Mobile token rotation', () => {
  it('rotates refresh tokens; a just-used token is tolerated briefly (lost response), later reuse revokes the session', async () => {
    const c = await signIn(t);
    const refresh = (token: string) =>
      t.http().post('/v1/auth/refresh').send({ refreshToken: token });
    const me = (token: string) =>
      t.http().get('/v1/auth/me').set('authorization', `Bearer ${token}`);
    const r1 = (await refresh(c.refreshToken!).expect(200)).body;
    await me(r1.accessToken).expect(200);
    await me(c.token).expect(401); // old access token replaced

    // Lost response: the client retries with the same (now used) token within the grace window.
    const retry = (await refresh(c.refreshToken!).expect(200)).body;
    await me(retry.accessToken).expect(200);
    await me(r1.accessToken).expect(401); // superseded access token no longer valid
    await refresh(retry.refreshToken).expect(200); // the retry's pair continues the session normally

    // Outside the grace window, reuse of a used token revokes the session.
    const d = await signIn(t);
    const d1 = (await refresh(d.refreshToken!).expect(200)).body;
    await t.owner.refreshToken.updateMany({
      where: { session: { user: { email: d.email } }, usedAt: { not: null } },
      data: { usedAt: new Date(Date.now() - 60_000) },
    });
    await refresh(d.refreshToken!).expect(401);
    await me(d1.accessToken).expect(401);
    await refresh(d1.refreshToken).expect(401);
  });

  it('expired access tokens are rejected', async () => {
    const c = await signIn(t);
    await t.owner.session.updateMany({
      where: { user: { email: c.email } },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await c.get('/v1/auth/me').expect(401)).body.error.code).toBe('SESSION_EXPIRED');
  });
});
