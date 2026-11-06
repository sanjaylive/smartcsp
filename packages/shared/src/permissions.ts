/**
 * Tenant permission matrix. The API enforces these (deny-by-default); clients only use them
 * to hide controls. See docs/PERMISSIONS.md for the rendered matrix.
 */
export const PERMISSIONS = [
  'records.view',
  'records.view_all',
  'records.create',
  'records.edit',
  'records.transition',
  'records.post',
  'records.reverse',
  'customers.view',
  'customers.manage',
  'customers.view_sensitive',
  'followups.view',
  'followups.manage',
  'dues.view',
  'dues.collect',
  'cashbook.view',
  'cashbook.manage',
  'expenses.view',
  'expenses.create',
  'expenses.reverse',
  'commissions.view',
  'commissions.receive',
  'reports.operational',
  'reports.financial',
  'exports.create',
  'day.close',
  'day.reopen',
  'staff.view',
  'staff.manage',
  'services.manage',
  'integrations.view',
  'integrations.manage',
  'provider.execute',
  'subscription.view',
  'subscription.manage',
  'settings.manage',
  'audit.view',
  'attachments.upload',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const TENANT_ROLES = ['OWNER', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_DEFAULT_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  OWNER: ALL,
  MANAGER: ALL.filter(
    (p) =>
      ![
        'staff.manage',
        'subscription.manage',
        'integrations.manage',
        'settings.manage',
        'day.reopen',
        'provider.execute',
      ].includes(p),
  ),
  OPERATOR: [
    'records.view',
    'records.create',
    'records.edit',
    'records.transition',
    'records.post',
    'customers.view',
    'customers.manage',
    'followups.view',
    'followups.manage',
    'dues.view',
    'dues.collect',
    'attachments.upload',
    'reports.operational',
  ],
  ACCOUNTANT: [
    'records.view',
    'records.view_all',
    'customers.view',
    'followups.view',
    'dues.view',
    'cashbook.view',
    'expenses.view',
    'commissions.view',
    'reports.operational',
    'reports.financial',
    'exports.create',
    'staff.view',
    'subscription.view',
    'integrations.view',
    'audit.view',
  ],
};

/**
 * Permissions an owner may additionally grant to (or revoke from) a non-owner member.
 * Owner-only powers are intentionally excluded to prevent privilege escalation.
 */
export const GRANTABLE_PERMISSIONS: readonly Permission[] = ALL.filter(
  (p) => !['staff.manage', 'subscription.manage', 'settings.manage', 'day.reopen'].includes(p),
);

export function effectivePermissions(
  role: TenantRole,
  grants: readonly string[] = [],
  revokes: readonly string[] = [],
): Set<Permission> {
  const set = new Set<Permission>(ROLE_DEFAULT_PERMISSIONS[role]);
  if (role !== 'OWNER') {
    for (const g of grants)
      if ((GRANTABLE_PERMISSIONS as string[]).includes(g)) set.add(g as Permission);
    for (const r of revokes) set.delete(r as Permission);
  }
  return set;
}

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_PERMISSIONS = [
  'platform.view',
  'tenants.manage',
  'users.manage',
  'plans.manage',
  'subscriptions.manage',
  'payments.approve',
  'catalog.manage',
  'connectors.manage',
  'announcements.manage',
  'settings.manage',
  'admins.manage',
  'support.access',
  'jobs.manage',
  'audit.view',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  SUPER_ADMIN: [...PLATFORM_PERMISSIONS],
  SUPPORT: ['platform.view', 'support.access', 'audit.view'],
};
