import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { otpRequestSchema, otpVerifySchema, totpCodeSchema } from '@csp2all/shared';
import { AdminPreMfa, Auth, Public, type AppRequest, type AuthState } from '../../common/access';
import { Db } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashIp,
  verifyTotp,
} from '../../common/crypto';
import { RedisService } from '../../common/redis';
import { clientIp } from '../../common/security.guard';
import { OtpService } from '../auth/otp.service';
import { SessionService } from '../auth/session.service';

/**
 * Platform admin authentication is a separate security context:
 * email OTP (purpose ADMIN_LOGIN) → ADMIN session without MFA → TOTP enrolment/verification.
 * Only after TOTP does the session gain access to admin APIs.
 */
@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    private readonly db: Db,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  @Public()
  @ApiDoc({
    summary: 'Request an admin sign-in code (response is identical for non-admins)',
    tags: ['Admin auth'],
    body: otpRequestSchema,
  })
  request(@Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(otpRequestSchema, body);
    return this.otp.request(dto.email, 'ADMIN_LOGIN', hashIp(clientIp(req)), async (email) => {
      const user = await this.db.user.findUnique({
        where: { email },
        include: { platformAdmin: true },
      });
      return !!user && user.status === 'ACTIVE' && user.platformAdmin?.status === 'ACTIVE';
    });
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary: 'Verify admin code; returns the required MFA step',
    tags: ['Admin auth'],
    body: otpVerifySchema,
  })
  async verify(
    @Body() body: unknown,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = parse(otpVerifySchema, body);
    const ipHash = hashIp(clientIp(req));
    const email = await this.otp.verify(
      dto.challengeId,
      dto.email,
      'ADMIN_LOGIN',
      dto.code,
      ipHash,
    );
    const user = await this.db.user.findUnique({
      where: { email },
      include: { platformAdmin: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.platformAdmin?.status !== 'ACTIVE')
      throw new AppError('OTP_INVALID', 'That code is not correct');
    const created = await this.sessions.create(user.id, 'ADMIN', {
      userAgent: req.headers['user-agent'],
      ipHash,
    });
    this.sessions.setSessionCookie(res, 'ADMIN', created.token);
    const csrfToken = this.sessions.setCsrfCookie(res);
    await this.db.asSystem((tx) =>
      this.audit.platform(
        tx,
        { userId: user.id, actorType: 'ADMIN', requestId: req.requestId, ipHash },
        { action: 'admin.login_otp', targetType: 'session', targetId: created.session.id },
      ),
    );
    return { mfa: user.platformAdmin.totpEnabledAt ? 'VERIFY' : 'ENROLL', csrfToken };
  }

  @Get('me')
  @AdminPreMfa()
  @ApiDoc({ summary: 'Current admin and MFA state', tags: ['Admin auth'] })
  me(@Auth() auth: AuthState) {
    return {
      userId: auth.user.id,
      email: auth.user.email,
      role: auth.admin!.role,
      permissions: [...auth.admin!.permissions],
      mfaEnrolled: !!auth.admin!.totpEnabledAt,
      mfaVerified: !!auth.session.mfaVerifiedAt,
    };
  }

  @Post('totp/setup')
  @HttpCode(200)
  @AdminPreMfa()
  @ApiDoc({ summary: 'Start TOTP enrolment (only before MFA is enabled)', tags: ['Admin auth'] })
  async setup(@Auth() auth: AuthState) {
    if (auth.admin!.totpEnabledAt)
      throw new AppError('CONFLICT', 'Two-factor authentication is already enabled');
    const secret = base32Encode(randomBytes(20));
    await this.db.platformAdmin.update({
      where: { id: auth.admin!.id },
      data: { totpSecretEnc: encryptSecret(secret) },
    });
    const label = encodeURIComponent(`CSP2All Admin:${auth.user.email}`);
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=CSP2All&algorithm=SHA1&digits=6&period=30`,
    };
  }

  @Post('totp/verify')
  @HttpCode(200)
  @AdminPreMfa()
  @ApiDoc({
    summary: 'Verify a TOTP code (enables MFA on first use) and unlock the admin session',
    tags: ['Admin auth'],
    body: totpCodeSchema,
  })
  async verifyTotp(
    @Body() body: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { code } = parse(totpCodeSchema, body);
    await this.redis.enforce(`totp:${auth.session.id}`, 5, 300, 'OTP_ATTEMPTS_EXCEEDED');
    const admin = auth.admin!;
    if (!admin.totpSecretEnc)
      throw new AppError('CONFLICT', 'Set up two-factor authentication first');
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), code);
    if (step === null || (admin.totpLastStep !== null && BigInt(step) <= admin.totpLastStep))
      throw new AppError('OTP_INVALID', 'That code is not correct');
    // Conditional update prevents two concurrent requests using the same code.
    const claimed = await this.db.platformAdmin.updateMany({
      where: { id: admin.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }] },
      data: { totpLastStep: BigInt(step), totpEnabledAt: admin.totpEnabledAt ?? new Date() },
    });
    if (claimed.count !== 1) throw new AppError('OTP_INVALID', 'That code is not correct');
    await this.db.session.update({
      where: { id: auth.session.id },
      data: { mfaVerifiedAt: new Date() },
    });
    const token = await this.sessions.rotate(auth.session);
    this.sessions.setSessionCookie(res, 'ADMIN', token);
    await this.db.asSystem((tx) =>
      this.audit.platform(
        tx,
        { userId: auth.user.id, actorType: 'ADMIN', requestId: req.requestId },
        { action: admin.totpEnabledAt ? 'admin.mfa_verified' : 'admin.mfa_enrolled' },
      ),
    );
    return { mfaVerified: true };
  }

  @Post('logout')
  @HttpCode(200)
  @AdminPreMfa()
  @ApiDoc({ summary: 'End the admin session', tags: ['Admin auth'] })
  async logout(@Auth() auth: AuthState, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(auth.session.id, 'LOGOUT');
    this.sessions.clearSessionCookie(res, 'ADMIN');
    return { ok: true };
  }
}
