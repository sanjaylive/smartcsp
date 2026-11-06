'use client';

import type { ReactNode } from 'react';
import type { PlatformPermission } from '@csp2all/shared';
import { useCan } from '@/lib/session';
import { PermissionDenied } from './ui';

/** Renders a permission-denied state instead of a page the admin's role cannot use. */
export function Guard({
  perm,
  what,
  children,
}: {
  perm: PlatformPermission;
  what?: string;
  children: ReactNode;
}) {
  const can = useCan();
  if (!can(perm)) return <PermissionDenied what={what} />;
  return <>{children}</>;
}

/** Renders children only when permitted (for hiding individual controls). */
export function Can({ perm, children }: { perm: PlatformPermission; children: ReactNode }) {
  const can = useCan();
  return can(perm) ? <>{children}</> : null;
}
