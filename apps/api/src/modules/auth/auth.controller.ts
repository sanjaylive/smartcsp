import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  otpRequestSchema,
  otpVerifySchema,
  phoneRequestSchema,
  phoneVerifySchema,
  refreshSchema,
  selectTenantSchema,
} from '@csp2all/shared';
import type { ErrorCode } from '@csp2all/shared';
import { Auth, Public, UserAuth, type AppRequest, type AuthState } from '../../common/access';
import { ApiDoc, parse } from '../../common/http';
import { Db } from '../../common/db';
import { AppError, notFound } from '../../common/errors';
import { hashIp } from '../../common/crypto';
import { clientIp } from '../../common/security.guard';
import { AuditService } from '../../common/audit';
import { OtpService, normalizeEmail } from './otp.service';
import { SessionService } from './session.service';
import { MeService } from './me.service';
import { Sms21Service } from '../messaging/sms21.service';
import type { User } from '@prisma/client';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly meService: MeService,
    private readonly sms21: Sms21Service,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  @Public()
  @ApiDoc({
    summary: 'Request an email sign-in code',
    tags: ['Auth'],
    body: otpRequestSchema,
    description: 'Always returns 202 with a challenge id and account existence indicator.',
  })
  async requestOtp(@Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(otpRequestSchema, body);
    const challenge = await this.otp.request(dto.email, 'LOGIN', hashIp(clientIp(req)));
    const email = normalizeEmail(dto.email);
    const user = await this.db.user.findFirst({
      where: { email, status: 'ACTIVE' },
      select: {
        id: true,
        memberships: {
          where: { status: { in: ['ACTIVE', 'INVITED'] } },
          select: { tenantId: true },
        },
      },
    });
    const exists = !!user && user.memberships.length > 0;
    return { ...challenge, exists };
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary: 'Verify the code and start a session',
    tags: ['Auth'],
    body: otpVerifySchema,
    description:
      'Web: sets an httpOnly session cookie and a CSRF cookie. Mobile: returns access + refresh tokens.',
  })
  async verifyOtp(
    @Body() body: unknown,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = parse(otpVerifySchema, body);
    const ipHash = hashIp(clientIp(req));
    const email = await this.otp.verify(dto.challengeId, dto.email, 'LOGIN', dto.code, ipHash);
    const user = await this.db.user.upsert({ where: { email }, create: { email }, update: {} });
    return this.completeLogin(user, dto.client, dto.deviceName, req, res);
  }

  @Post('phone/request')
  @HttpCode(202)
  @Public()
  @ApiDoc({
    summary: 'Request a sign-in code by SMS/WhatsApp (SMS21)',
    tags: ['Auth'],
    body: phoneRequestSchema,
  })
  async requestPhoneOtp(@Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(phoneRequestSchema, body);
    await this.ensurePhoneSignIn();
    const out = await this.sms21.sendOtp({
      mobile: `91${dto.phone}`,
      purpose: 'login',
      ip: clientIp(req),
    });
    const mobile = `91${dto.phone}`;
    const user = await this.db.user.findFirst({
      where: { phone: mobile, status: 'ACTIVE' },
      select: {
        id: true,
        memberships: {
          where: { status: { in: ['ACTIVE', 'INVITED'] } },
          select: { tenantId: true },
        },
      },
    });
    const exists = !!user && user.memberships.length > 0;
    return {
      challengeId: out.requestId,
      expiresInSeconds: out.expiresIn,
      resendAfterSeconds: out.resendAfter,
      exists,
    };
  }

  @Post('phone/verify')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary: 'Verify a phone code and start a session',
    tags: ['Auth'],
    body: phoneVerifySchema,
  })
  async verifyPhoneOtp(
    @Body() body: unknown,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = parse(phoneVerifySchema, body);
    await this.ensurePhoneSignIn();
    const mobile = `91${dto.phone}`;
    let verified = false;
    try {
      const r = await this.sms21.verifyOtp({ requestId: dto.challengeId, otp: dto.code, mobile });
      verified = r.verified === true;
    } catch (e) {
      // Map SMS21's OTP failures onto our auth error codes for a clean client message.
      const code = (e as AppError).details?.providerCode;
      const map: Record<string, ErrorCode> = {
        OTP_INVALID: 'OTP_INVALID',
        OTP_EXPIRED: 'OTP_EXPIRED',
        OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
      };
      if (typeof code === 'string' && map[code])
        throw new AppError(map[code], 'That code is not correct');
      throw e;
    }
    if (!verified) throw new AppError('OTP_INVALID', 'That code is not correct');
    const user = await this.db.user.upsert({
      where: { phone: mobile },
      create: { phone: mobile },
      update: {},
    });
    return this.completeLogin(user, dto.client, dto.deviceName, req, res);
  }

  private async ensurePhoneSignIn() {
    const cfg = await this.sms21.config();
    if (!cfg.apiKeyEnc || !cfg.otpEnabled)
      throw new AppError('MESSAGING_NOT_CONFIGURED', 'Phone sign-in is not available.');
  }

  /** Shared tail of email/phone sign-in: pre-select the sole shop, open a session, audit, respond. */
  private async completeLogin(
    user: User,
    client: 'web' | 'mobile',
    deviceName: string | undefined,
    req: AppRequest,
    res: Response,
  ) {
    const ipHash = hashIp(clientIp(req));
    if (user.status !== 'ACTIVE') throw new AppError('UNAUTHENTICATED', 'This account is disabled');
    const memberships = await this.db.asUser(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'INVITED'] } },
        select: { tenantId: true },
      }),
    );
    const activeTenantId = memberships.length === 1 ? memberships[0].tenantId : null;

    const kind = client === 'mobile' ? 'MOBILE' : 'WEB';
    const created = await this.sessions.create(
      user.id,
      kind,
      { userAgent: req.headers['user-agent'], ipHash, deviceName },
      activeTenantId,
    );
    if (activeTenantId) await this.acceptInvite(user.id, activeTenantId);
    await this.db.asSystem((tx) =>
      this.audit.platform(
        tx,
        { userId: user.id, actorType: 'USER', requestId: req.requestId, ipHash },
        {
          action: 'auth.login',
          targetType: 'session',
          targetId: created.session.id,
          data: { kind },
        },
      ),
    );

    if (kind === 'WEB') {
      this.sessions.setSessionCookie(res, 'WEB', created.token);
      const csrfToken = this.sessions.setCsrfCookie(res);
      return { ...(await this.meService.get(user.id, activeTenantId)), csrfToken };
    }
    return {
      ...(await this.meService.get(user.id, activeTenantId)),
      tokens: {
        accessToken: created.token,
        refreshToken: created.refreshToken,
        accessTokenExpiresAt: created.accessTokenExpiresAt.toISOString(),
      },
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary: 'Rotate mobile tokens',
    tags: ['Auth'],
    body: refreshSchema,
    description: 'Each refresh token works once. Reusing one revokes the session.',
  })
  async refresh(@Body() body: unknown) {
    const dto = parse(refreshSchema, body);
    const t = await this.sessions.refresh(dto.refreshToken);
    return {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      accessTokenExpiresAt: t.accessTokenExpiresAt.toISOString(),
    };
  }

  @Get('csrf')
  @Public()
  @ApiDoc({ summary: 'Issue a CSRF token cookie (web)', tags: ['Auth'] })
  csrf(@Res({ passthrough: true }) res: Response) {
    return { csrfToken: this.sessions.setCsrfCookie(res) };
  }

  @Get('me')
  @UserAuth()
  @ApiDoc({ summary: 'Current user, shops and onboarding state', tags: ['Auth'] })
  async getMe(@Auth() auth: AuthState) {
    return this.meService.get(auth.user.id, auth.session.activeTenantId);
  }

  @Post('select-tenant')
  @HttpCode(200)
  @UserAuth()
  @ApiDoc({
    summary: 'Choose the active shop for this session',
    tags: ['Auth'],
    body: selectTenantSchema,
  })
  async selectTenant(
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tenantId } = parse(selectTenantSchema, body);
    const m = await this.db.asUser(auth.user.id, (tx) =>
      tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: auth.user.id } } }),
    );
    if (!m || !['ACTIVE', 'INVITED'].includes(m.status)) throw notFound('Shop');
    await this.acceptInvite(auth.user.id, tenantId);
    await this.db.session.update({
      where: { id: auth.session.id },
      data: { activeTenantId: tenantId },
    });
    if (auth.via === 'cookie') {
      const token = await this.sessions.rotate(auth.session);
      this.sessions.setSessionCookie(res, 'WEB', token);
    }
    return this.meService.get(auth.user.id, tenantId);
  }

  @Post('logout')
  @HttpCode(200)
  @UserAuth()
  @ApiDoc({ summary: 'Sign out of this device', tags: ['Auth'] })
  async logout(@Auth() auth: AuthState, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(auth.session.id, 'LOGOUT');
    if (auth.via === 'cookie') this.sessions.clearSessionCookie(res, 'WEB');
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UserAuth()
  @ApiDoc({ summary: 'Sign out of all devices', tags: ['Auth'] })
  async logoutAll(
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const count = await this.sessions.revokeAllForUser(auth.user.id, 'LOGOUT_ALL');
    if (auth.via === 'cookie') this.sessions.clearSessionCookie(res, 'WEB');
    await this.db.asSystem((tx) =>
      this.audit.platform(
        tx,
        { userId: auth.user.id, actorType: 'USER', requestId: req.requestId },
        { action: 'auth.logout_all', data: { count } },
      ),
    );
    return { revoked: count };
  }

  @Get('sessions')
  @UserAuth()
  @ApiDoc({ summary: 'List active sessions', tags: ['Auth'] })
  async listSessions(@Auth() auth: AuthState) {
    const items = await this.sessions.list(auth.user.id);
    return { items: items.map((s) => ({ ...s, current: s.id === auth.session.id })) };
  }

  @Delete('sessions/:id')
  @UserAuth()
  @ApiDoc({ summary: 'Sign out a specific session', tags: ['Auth'] })
  async revokeSession(@Param('id') id: string, @Auth() auth: AuthState) {
    const s = await this.db.session.findFirst({ where: { id, userId: auth.user.id } });
    if (!s) throw notFound('Session');
    await this.sessions.revoke(id, 'USER_REVOKED');
    return { ok: true };
  }

  private async acceptInvite(userId: string, tenantId: string) {
    await this.db.asUser(userId, (tx) =>
      tx.membership.updateMany({
        where: { tenantId, userId, status: 'INVITED' },
        data: { status: 'ACTIVE' },
      }),
    );
  }
}
