import { Injectable, Logger } from '@nestjs/common';
import type { OtpChallenge } from '@prisma/client';
import { config } from '../../config/config';
import { Db } from '../../common/db';
import { AppError } from '../../common/errors';
import { hmac, numericCode, safeEqualHex, sha256 } from '../../common/crypto';
import { RedisService } from '../../common/redis';
import { EmailService } from '../email/email.service';

export type OtpPurpose = 'LOGIN' | 'ADMIN_LOGIN';

/** Normalises an email for identity purposes (trim + lowercase; no provider-specific rewriting). */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

@Injectable()
export class OtpService {
  private readonly log = new Logger('Otp');

  constructor(
    private readonly db: Db,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  private codeHash(challengeId: string, email: string, purpose: string, code: string) {
    return hmac(config().OTP_PEPPER, `${challengeId}:${email}:${purpose}:${code}`);
  }

  /**
   * Creates a challenge and emails the code. The response is identical whether or not the email
   * belongs to an account (and, for admin sign-in, whether or not it is an admin).
   */
  async request(
    rawEmail: string,
    purpose: OtpPurpose,
    ipHash: string | null,
    shouldSend: (email: string) => Promise<boolean> = async () => true,
  ) {
    const c = config();
    const email = normalizeEmail(rawEmail);
    const emailKey = sha256(email).slice(0, 32);
    await this.redis.enforce(`otp:req:ip:${ipHash ?? 'unknown'}`, c.OTP_MAX_PER_IP_PER_HOUR, 3600);
    await this.redis.enforce(
      `otp:req:email:${purpose}:${emailKey}`,
      c.OTP_MAX_PER_EMAIL_PER_HOUR,
      3600,
    );

    const latest = await this.db.otpChallenge.findFirst({
      where: { email, purpose, consumedAt: null, supersededAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < c.OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil(
        (c.OTP_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - latest.createdAt.getTime())) / 1000,
      );
      throw new AppError('OTP_RESEND_COOLDOWN', 'Please wait before requesting another code', {
        retryAfterSeconds: wait,
      });
    }

    const code = numericCode(6);
    const challenge = await this.db.$transaction(async (tx) => {
      // Invalidate superseded challenges so only the newest code works.
      await tx.otpChallenge.updateMany({
        where: { email, purpose, consumedAt: null, supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const created = await tx.otpChallenge.create({
        data: {
          email,
          purpose,
          codeHash: 'pending',
          maxAttempts: c.OTP_MAX_ATTEMPTS,
          expiresAt: new Date(Date.now() + c.OTP_TTL_SECONDS * 1000),
          ipHash,
        },
      });
      return tx.otpChallenge.update({
        where: { id: created.id },
        data: { codeHash: this.codeHash(created.id, email, purpose, code) },
      });
    });

    if (await shouldSend(email)) {
      await this.email.send(
        this.email.otpEmail(email, code, Math.round(c.OTP_TTL_SECONDS / 60), purpose),
        { containsSecret: true },
      );
    }
    return {
      challengeId: challenge.id,
      expiresInSeconds: c.OTP_TTL_SECONDS,
      resendAfterSeconds: c.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Atomically counts the attempt, checks the code, and consumes the challenge exactly once.
   * Returns the normalized email on success.
   */
  async verify(
    challengeId: string,
    rawEmail: string,
    purpose: OtpPurpose,
    code: string,
    ipHash: string | null,
  ): Promise<string> {
    const c = config();
    const email = normalizeEmail(rawEmail);
    await this.redis.enforce(
      `otp:verify:ip:${ipHash ?? 'unknown'}`,
      c.OTP_VERIFY_MAX_PER_IP_PER_10MIN,
      600,
    );

    const counted = await this.db.$queryRaw<OtpChallenge[]>`
      UPDATE otp_challenges SET attempts = attempts + 1
      WHERE id = ${challengeId}::uuid AND email = ${email} AND purpose = ${purpose}
        AND "consumedAt" IS NULL AND "supersededAt" IS NULL
        AND attempts < "maxAttempts" AND "expiresAt" > now()
      RETURNING *`;

    if (counted.length === 0) {
      const existing = await this.db.otpChallenge.findUnique({ where: { id: challengeId } });
      if (
        !existing ||
        existing.email !== email ||
        existing.purpose !== purpose ||
        existing.consumedAt ||
        existing.supersededAt
      ) {
        throw new AppError('OTP_INVALID', 'That code is not correct');
      }
      if (existing.expiresAt <= new Date())
        throw new AppError('OTP_EXPIRED', 'That code has expired');
      throw new AppError('OTP_ATTEMPTS_EXCEEDED', 'Too many attempts. Request a new code.');
    }

    const ch = counted[0];
    if (!safeEqualHex(ch.codeHash, this.codeHash(ch.id, email, purpose, code))) {
      if (ch.attempts >= ch.maxAttempts)
        throw new AppError('OTP_ATTEMPTS_EXCEEDED', 'Too many attempts. Request a new code.');
      throw new AppError('OTP_INVALID', 'That code is not correct', {
        attemptsRemaining: ch.maxAttempts - ch.attempts,
      });
    }

    const consumed = await this.db.otpChallenge.updateMany({
      where: { id: ch.id, consumedAt: null, supersededAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new AppError('OTP_INVALID', 'That code is not correct'); // lost a race / replay
    return email;
  }
}
