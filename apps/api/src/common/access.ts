import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission, PlatformPermission } from '@csp2all/shared';
import type { Membership, PlatformAdmin, Session, User } from '@prisma/client';
import type { TenantCtx } from './db';
import { AppError } from './errors';

export const ACCESS_KEY = 'csp2all:access';

export type AccessPolicy =
  | { type: 'public' }
  /** Any signed-in tenant-side user (WEB/MOBILE session), no active tenant required. */
  | { type: 'user' }
  /** Active tenant + membership + ALL listed permissions. */
  | { type: 'tenant'; permissions: Permission[]; allowSuspended?: boolean }
  /** Platform admin session with completed MFA + ALL listed platform permissions. */
  | { type: 'admin'; permissions: PlatformPermission[]; allowBeforeMfa?: boolean };

export const Public = () => SetMetadata(ACCESS_KEY, { type: 'public' } satisfies AccessPolicy);
export const UserAuth = () => SetMetadata(ACCESS_KEY, { type: 'user' } satisfies AccessPolicy);
export const TenantAccess = (...permissions: Permission[]) =>
  SetMetadata(ACCESS_KEY, { type: 'tenant', permissions } satisfies AccessPolicy);
export const TenantAccessAllowSuspended = (...permissions: Permission[]) =>
  SetMetadata(ACCESS_KEY, {
    type: 'tenant',
    permissions,
    allowSuspended: true,
  } satisfies AccessPolicy);
export const AdminAccess = (...permissions: PlatformPermission[]) =>
  SetMetadata(ACCESS_KEY, { type: 'admin', permissions } satisfies AccessPolicy);
export const AdminPreMfa = () =>
  SetMetadata(ACCESS_KEY, {
    type: 'admin',
    permissions: [],
    allowBeforeMfa: true,
  } satisfies AccessPolicy);

export interface AuthState {
  session: Session;
  user: User;
  via: 'cookie' | 'bearer';
  tenant?: TenantCtx;
  membership?: Membership;
  admin?: PlatformAdmin & { permissions: ReadonlySet<PlatformPermission> };
}

export interface AppRequest extends Request {
  requestId: string;
  auth?: AuthState;
  rawBody?: Buffer;
}

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthState => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Sign in required');
  return req.auth;
});

/** The validated tenant context for this request. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantCtx => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth?.tenant) throw new AppError('TENANT_REQUIRED', 'Select a shop first');
  return req.auth.tenant;
});

export const ReqId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AppRequest>().requestId,
);

export function requirePerm(ctx: TenantCtx, perm: Permission) {
  if (!ctx.permissions.has(perm))
    throw new AppError('PERMISSION_DENIED', 'You do not have permission to do this', {
      permission: perm,
    });
}
