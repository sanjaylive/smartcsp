# Permission matrix

> Generated from `packages/shared/src/permissions.ts` (the API enforces exactly this; deny-by-default).
> Regenerate after changing permissions. ✅ = granted by default, — = not granted.

## Tenant roles

| Permission                 | OWNER | MANAGER | OPERATOR | ACCOUNTANT | Grantable to non-owners |
| -------------------------- | :---: | :-----: | :------: | :--------: | :---------------------: |
| `records.view`             |  ✅   |   ✅    |    ✅    |     ✅     |           yes           |
| `records.view_all`         |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `records.create`           |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `records.edit`             |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `records.transition`       |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `records.post`             |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `records.reverse`          |  ✅   |   ✅    |    —     |     —      |           yes           |
| `customers.view`           |  ✅   |   ✅    |    ✅    |     ✅     |           yes           |
| `customers.manage`         |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `customers.view_sensitive` |  ✅   |   ✅    |    —     |     —      |           yes           |
| `followups.view`           |  ✅   |   ✅    |    ✅    |     ✅     |           yes           |
| `followups.manage`         |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `dues.view`                |  ✅   |   ✅    |    ✅    |     ✅     |           yes           |
| `dues.collect`             |  ✅   |   ✅    |    ✅    |     —      |           yes           |
| `cashbook.view`            |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `cashbook.manage`          |  ✅   |   ✅    |    —     |     —      |           yes           |
| `expenses.view`            |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `expenses.create`          |  ✅   |   ✅    |    —     |     —      |           yes           |
| `expenses.reverse`         |  ✅   |   ✅    |    —     |     —      |           yes           |
| `commissions.view`         |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `commissions.receive`      |  ✅   |   ✅    |    —     |     —      |           yes           |
| `reports.operational`      |  ✅   |   ✅    |    ✅    |     ✅     |           yes           |
| `reports.financial`        |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `exports.create`           |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `day.close`                |  ✅   |   ✅    |    —     |     —      |           yes           |
| `day.reopen`               |  ✅   |    —    |    —     |     —      |     **owner only**      |
| `staff.view`               |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `staff.manage`             |  ✅   |    —    |    —     |     —      |     **owner only**      |
| `services.manage`          |  ✅   |   ✅    |    —     |     —      |           yes           |
| `integrations.view`        |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `integrations.manage`      |  ✅   |    —    |    —     |     —      |           yes           |
| `provider.execute`         |  ✅   |    —    |    —     |     —      |           yes           |
| `subscription.view`        |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `subscription.manage`      |  ✅   |    —    |    —     |     —      |     **owner only**      |
| `settings.manage`          |  ✅   |    —    |    —     |     —      |     **owner only**      |
| `audit.view`               |  ✅   |   ✅    |    —     |     ✅     |           yes           |
| `attachments.upload`       |  ✅   |   ✅    |    ✅    |     —      |           yes           |

### Rules

- Owners can grant or revoke any _grantable_ permission per member (`grants` / `revokes` on the membership). Owner-only powers (`staff.manage`, `subscription.manage`, `settings.manage`, `day.reopen`) cannot be granted, preventing privilege escalation.
- Without `records.view_all`, a member sees only records they created or are assigned to — in lists, details, dues, exports, reports and attachments.
- Without `customers.view_sensitive`, phone numbers, emails and sensitive record fields (e.g. consumer IDs, subscriber numbers) are masked, and contact details cannot be edited.
- The owner membership cannot be modified through staff management; members cannot change their own access.
- Disabling a member takes effect on their next request (the guard re-reads membership every request).
- Suspended shops can still open the context, notifications and subscription pages (to resolve the suspension) but nothing else.

## Platform roles (super-admin console)

| Permission             | SUPER_ADMIN | SUPPORT |
| ---------------------- | :---------: | :-----: |
| `platform.view`        |     ✅      |   ✅    |
| `tenants.manage`       |     ✅      |    —    |
| `users.manage`         |     ✅      |    —    |
| `plans.manage`         |     ✅      |    —    |
| `subscriptions.manage` |     ✅      |    —    |
| `payments.approve`     |     ✅      |    —    |
| `catalog.manage`       |     ✅      |    —    |
| `connectors.manage`    |     ✅      |    —    |
| `announcements.manage` |     ✅      |    —    |
| `settings.manage`      |     ✅      |    —    |
| `admins.manage`        |     ✅      |    —    |
| `support.access`       |     ✅      |   ✅    |
| `jobs.manage`          |     ✅      |    —    |
| `audit.view`           |     ✅      |   ✅    |

- Platform admins authenticate in a separate security context (email OTP **and** TOTP; separate cookie; admin sessions cannot call tenant APIs and tenant sessions cannot call admin APIs).
- The last active SUPER_ADMIN cannot be disabled or demoted. No admin credentials are seeded; the first admin is created with `bootstrap-admin` and must enrol TOTP.
- Tenant business data (records, customers) is only reachable through a **support session**: time-limited (≤120 min), reason required, read-only, sensitive fields masked, every read audited and visible to the shop (notification + audit history).
