import type { Me } from './types';

/** Where to go after sign-in, based on /me: onboarding → shop chooser → portal. */
export function routeAfterAuth(me: Me, next?: string | null): string {
  if (me.onboarding) return '/onboarding';
  if (!me.activeTenantId) return me.tenants.length > 0 ? '/select-shop' : '/onboarding';
  if (next && next.startsWith('/app') && !next.startsWith('//')) return next;
  return '/app';
}
