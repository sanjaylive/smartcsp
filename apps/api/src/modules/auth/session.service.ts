import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Session } from '@prisma/client';
import { config } from '../../config/config';
import { Db } from '../../common/db';
import { AppError } from '../../common/errors';
import { randomToken, sha256 } from '../../common/crypto';
import { COOKIES } from '../../common/security.guard';

/** A just-used refresh token may be re-presented within this window (lost response). */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export type SessionKind = 'WEB' | 'MOBILE' | 'ADMIN';

interface ClientInfo {
  userAgent?: string;
  ipHash?: string | null;
  deviceName?: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly db: Db) {}

  private lifetimes(kind: SessionKind) {
    const c = config();
    const now = Date.now();
    if (kind === 'ADMIN') {
      return {
        token: now + c.ADMIN_SESSION_ABSOLUTE_HOURS * 3.6e6,
        idle: now + c.ADMIN_SESSION_IDLE_MINUTES * 6e4,
        absolute: now + c.ADMIN_SESSION_ABSOLUTE_HOURS * 3.6e6,
      };
    }
    if (kind === 'MOBILE') {
      return {
        token: now + c.MOBILE_ACCESS_TOKEN_MINUTES * 6e4,
        idle: now + c.MOBILE_REFRESH_DAYS * 8.64e7,
        absolute: now + c.MOBILE_REFRESH_DAYS * 8.64e7,
      };
    }
    return {
      token: now + c.WEB_SESSION_ABSOLUTE_DAYS * 8.64e7,
      idle: now + c.WEB_SESSION_IDLE_HOURS * 3.6e6,
      absolute: now + c.WEB_SESSION_ABSOLUTE_DAYS * 8.64e7,
    };
  }

  async create(
    userId: string,
    kind: SessionKind,
    client: ClientInfo,
    activeTenantId: string | null = null,
  ) {
    const token = randomToken();
    const lt = this.lifetimes(kind);
    const session = await this.db.session.create({
      data: {
        userId,
        kind,
        tokenHash: sha256(token),
        tokenExpiresAt: new Date(lt.token),
        idleExpiresAt: new Date(lt.idle),
        absoluteExpires: new Date(lt.absolute),
        userAgent: client.userAgent?.slice(0, 200),
        ipHash: client.ipHash ?? null,
        deviceName: client.deviceName?.slice(0, 80),
        activeTenantId,
      },
    });
    let refreshToken: string | undefined;
    if (kind === 'MOBILE') refreshToken = await this.issueRefresh(session.id, lt.absolute);
    await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return { session, token, refreshToken, accessTokenExpiresAt: new Date(lt.token) };
  }

  private async issueRefresh(sessionId: string, absoluteMs: number) {
    const rt = randomToken(48);
    await this.db.refreshToken.create({
      data: { sessionId, tokenHash: sha256(rt), expiresAt: new Date(absoluteMs) },
    });
    return rt;
  }

  /** Rotates the session token (e.g. after tenant switch or MFA) to prevent fixation. */
  async rotate(session: Session) {
    const token = randomToken();
    await this.db.session.update({ where: { id: session.id }, data: { tokenHash: sha256(token) } });
    return token;
  }

  /**
   * Mobile refresh with rotation. Presenting an already-used refresh token is treated as theft:
   * the whole session is revoked.
   */
  async refresh(refreshToken: string) {
    const rt = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { session: true },
    });
    if (!rt) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    const s = rt.session;
    if (s.revokedAt) throw new AppError('UNAUTHENTICATED', 'Session revoked. Sign in again.');
    if (rt.expiresAt <= new Date() || s.absoluteExpires <= new Date()) {
      throw new AppError('SESSION_EXPIRED', 'Your session has expired');
    }
    if (!rt.usedAt) {
      const claimed = await this.db.refreshToken.updateMany({
        where: { id: rt.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 1) return this.issuePair(s);
    }
    // The token was already used. Within a short grace window (lost response / duplicate submit on a
    // flaky network) this is treated as a retry: successors issued since are invalidated and a fresh
    // pair is returned. Reuse after the window is treated as theft and revokes the whole session.
    const used = await this.db.refreshToken.findUniqueOrThrow({ where: { id: rt.id } });
    if (!used.usedAt || Date.now() - used.usedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      await this.revoke(s.id, 'REFRESH_TOKEN_REUSE');
      throw new AppError('UNAUTHENTICATED', 'Session revoked for your security. Sign in again.');
    }
    await this.db.refreshToken.updateMany({
      where: { sessionId: s.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return this.issuePair(s);
  }

  private async issuePair(s: Session) {
    const token = randomToken();
    const accessExp = new Date(
      Math.min(
        Date.now() + config().MOBILE_ACCESS_TOKEN_MINUTES * 6e4,
        s.absoluteExpires.getTime(),
      ),
    );
    await this.db.session.update({
      where: { id: s.id },
      data: { tokenHash: sha256(token), tokenExpiresAt: accessExp, lastSeenAt: new Date() },
    });
    const newRefresh = await this.issueRefresh(s.id, s.absoluteExpires.getTime());
    return { accessToken: token, refreshToken: newRefresh, accessTokenExpiresAt: accessExp };
  }

  async revoke(sessionId: string, reason: string) {
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, kinds: SessionKind[] = ['WEB', 'MOBILE']) {
    const r = await this.db.session.updateMany({
      where: { userId, revokedAt: null, kind: { in: kinds } },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return r.count;
  }

  async list(userId: string) {
    return this.db.session.findMany({
      where: {
        userId,
        revokedAt: null,
        absoluteExpires: { gt: new Date() },
        kind: { in: ['WEB', 'MOBILE'] },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        kind: true,
        deviceName: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
  }

  // ---------------------------------------------------------------- cookies (web/admin)

  setSessionCookie(res: Response, kind: 'WEB' | 'ADMIN', token: string) {
    const c = config();
    const maxAge =
      kind === 'ADMIN'
        ? c.ADMIN_SESSION_ABSOLUTE_HOURS * 3.6e6
        : c.WEB_SESSION_ABSOLUTE_DAYS * 8.64e7;
    res.cookie(kind === 'ADMIN' ? COOKIES.admin : COOKIES.web, token, {
      httpOnly: true,
      secure: c.COOKIE_SECURE,
      sameSite: kind === 'ADMIN' ? 'strict' : 'lax',
      path: '/',
      maxAge,
      domain: c.COOKIE_DOMAIN,
    });
  }

  clearSessionCookie(res: Response, kind: 'WEB' | 'ADMIN') {
    res.clearCookie(kind === 'ADMIN' ? COOKIES.admin : COOKIES.web, {
      path: '/',
      domain: config().COOKIE_DOMAIN,
    });
  }

  /** Double-submit CSRF token: readable by the web app, echoed in `X-CSRF-Token`. */
  setCsrfCookie(res: Response): string {
    const c = config();
    const token = randomToken(24);
    res.cookie(COOKIES.csrf, token, {
      httpOnly: false,
      secure: c.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      domain: c.COOKIE_DOMAIN,
    });
    return token;
  }
}
