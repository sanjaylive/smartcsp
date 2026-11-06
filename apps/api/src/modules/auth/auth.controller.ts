import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  selectTenantSchema,
} from '@csp2all/shared';
import { Auth, Public, UserAuth, type AppRequest, type AuthState } from '../../common/access';
import { ApiDoc, parse } from '../../common/http';
import { Db } from '../../common/db';
import { AppError, notFound } from '../../common/errors';
import { hashIp } from '../../common/crypto';
import { clientIp } from '../../common/security.guard';
import { AuditService } from '../../common/audit';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { MeService } from './me.service';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly meService: MeService,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  @Public()
  @ApiDoc({
    summary: 'Request an email sign-in code',
    tags: ['Auth'],
    body: otpRequestSchema,
    description:
      'Always returns 202 with a challenge id; the response does not reveal whether an account exists.',
  })
  async requestOtp(@Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(otpRequestSchema, body);
    return this.otp.request(dto.email, 'LOGIN', hashIp(clientIp(req)));
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
    if (user.status !== 'ACTIVE') throw new AppError('UNAUTHENTICATED', 'This account is disabled');

    // Pre-select the only shop, if the user has exactly one active membership.
    const memberships = await this.db.asUser(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'INVITED'] } },
        select: { tenantId: true },
      }),
    );
    const activeTenantId = memberships.length === 1 ? memberships[0].tenantId : null;

    const kind = dto.client === 'mobile' ? 'MOBILE' : 'WEB';
    const created = await this.sessions.create(
      user.id,
      kind,
      { userAgent: req.headers['user-agent'], ipHash, deviceName: dto.deviceName },
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
