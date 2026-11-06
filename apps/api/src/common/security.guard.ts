import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  effectivePermissions,
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformRole,
  type TenantRole,
} from '@csp2all/shared';
import { ACCESS_KEY, type AccessPolicy, type AppRequest } from './access';
import { Db } from './db';
import { AppError } from './errors';
import { hashIp, sha256 } from './crypto';
import { RedisService } from './redis';
import { config } from '../config/config';

export const COOKIES = { web: 'csp2all_sid', admin: 'csp2all_asid', csrf: 'csp2all_csrf' } as const;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function clientIp(req: AppRequest): string | undefined {
  return req.ip ?? req.socket?.remoteAddress;
}

/**
 * Single, deny-by-default security guard:
 *   policy lookup → rate limit → session → CSRF/origin → admin MFA / tenant membership → permissions.
 * Routes without an explicit access policy are rejected.
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  private readonly log = new Logger('SecurityGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly db: Db,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) {
      this.log.error(`Route without access policy denied: ${req.method} ${req.path}`);
      throw new AppError('FORBIDDEN', 'Access denied');
    }

    const ipHash = hashIp(clientIp(req));
    await this.redis.enforce(`api:${ipHash ?? 'unknown'}`, config().API_RATE_LIMIT_PER_MINUTE, 60);

    if (policy.type === 'public') return true;

    const isAdmin = policy.type === 'admin';
    const bearer = req.headers.authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/)?.[1];
    const cookieToken = req.cookies?.[isAdmin ? COOKIES.admin : COOKIES.web] as string | undefined;
    const token = !isAdmin && bearer ? bearer : cookieToken;
    const via = !isAdmin && bearer ? 'bearer' : 'cookie';
    if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in required');

    const session = await this.db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    if (
      session.tokenExpiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.absoluteExpires <= now
    ) {
      throw new AppError('SESSION_EXPIRED', 'Your session has expired');
    }
    if (session.user.status !== 'ACTIVE') throw new AppError('UNAUTHENTICATED', 'Account disabled');

    // Security contexts are separate: admin sessions never reach tenant routes and vice versa.
    const expectedKinds = isAdmin ? ['ADMIN'] : via === 'bearer' ? ['MOBILE'] : ['WEB'];
    if (!expectedKinds.includes(session.kind))
      throw new AppError('UNAUTHENTICATED', 'Sign in required');

    if (via === 'cookie' && !SAFE_METHODS.has(req.method)) this.checkCsrf(req);

    if (
      session.kind === 'MOBILE' &&
      now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS
    ) {
      // Mobile access tokens have a fixed lifetime; only record activity for the sessions list.
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    } else if (
      session.kind !== 'MOBILE' &&
      now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS
    ) {
      const idleMs =
        session.kind === 'ADMIN'
          ? config().ADMIN_SESSION_IDLE_MINUTES * 60_000
          : config().WEB_SESSION_IDLE_HOURS * 3_600_000;
      const idle = new Date(Math.min(now.getTime() + idleMs, session.absoluteExpires.getTime()));
      await this.db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, idleExpiresAt: idle },
      });
    }

    req.auth = { session, user: session.user, via };

    if (policy.type === 'admin') {
      const admin = await this.db.platformAdmin.findUnique({ where: { userId: session.userId } });
      if (!admin || admin.status !== 'ACTIVE')
        throw new AppError('FORBIDDEN', 'Platform access denied');
      if (!policy.allowBeforeMfa && !session.mfaVerifiedAt)
        throw new AppError('MFA_REQUIRED', 'Complete two-factor verification');
      const perms = new Set(PLATFORM_ROLE_PERMISSIONS[admin.role as PlatformRole] ?? []);
      for (const p of policy.permissions) {
        if (!perms.has(p))
          throw new AppError('PERMISSION_DENIED', 'You do not have permission to do this', {
            permission: p,
          });
      }
      req.auth.admin = { ...admin, permissions: perms };
      return true;
    }

    if (policy.type === 'user') return true;

    // ---- tenant policy
    if (!session.activeTenantId) throw new AppError('TENANT_REQUIRED', 'Select a shop first');
    const tenantId = session.activeTenantId;
    const found = await this.db.asUser(session.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: session.userId } },
      });
      const tenant = membership ? await tx.tenant.findUnique({ where: { id: tenantId } }) : null;
      return { membership, tenant };
    });
    if (!found.membership || found.membership.status !== 'ACTIVE' || !found.tenant) {
      throw new AppError('FORBIDDEN', 'You no longer have access to this shop');
    }
    if (found.tenant.status !== 'ACTIVE' && !policy.allowSuspended) {
      throw new AppError('TENANT_SUSPENDED', 'This shop is suspended. Contact CSP2All support.', {
        status: found.tenant.status,
      });
    }
    const permissions = effectivePermissions(
      found.membership.role as TenantRole,
      found.membership.grants,
      found.membership.revokes,
    );
    for (const p of policy.permissions) {
      if (!permissions.has(p))
        throw new AppError('PERMISSION_DENIED', 'You do not have permission to do this', {
          permission: p,
        });
    }
    req.auth.membership = found.membership;
    req.auth.tenant = {
      tenantId,
      userId: session.userId,
      membershipId: found.membership.id,
      role: found.membership.role as TenantRole,
      permissions,
      timezone: found.tenant.timezone,
      requestId: req.requestId,
      ipHash,
      actorType: 'USER',
    };
    return true;
  }

  private checkCsrf(req: AppRequest) {
    const header = req.headers['x-csrf-token'];
    const cookie = req.cookies?.[COOKIES.csrf];
    if (typeof header !== 'string' || !cookie || header.length < 20 || header !== cookie) {
      throw new AppError('CSRF_FAILED', 'Security check failed. Reload the page and try again.');
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins().includes(origin)) {
      throw new AppError('CSRF_FAILED', 'Request origin not allowed');
    }
  }
}

export function allowedOrigins(): string[] {
  return config()
    .WEB_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
