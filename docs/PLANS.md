# Plans, entitlements, quotas and subscriptions

## Initial plans (editable demonstration defaults)

Seeded by `apps/api/src/cli/reference-data.ts` only if missing, marked `isDemoDefault`. **Every name, price and
limit is configurable by super admins** (Admin → Plans → _Publish new version_). Prices exclude 18% GST by default
(tax rate and inclusive/exclusive are per version).

|                                            | Free (default plan) | Growth              | Pro                    |
| ------------------------------------------ | ------------------- | ------------------- | ---------------------- |
| Price (example)                            | ₹0                  | ₹499/mo · ₹4,990/yr | ₹1,499/mo · ₹14,990/yr |
| Staff (incl. owner)                        | 2                   | 5                   | 25                     |
| Records / month                            | 100                 | 3,000               | Unlimited              |
| Enabled services                           | 4                   | 10                  | Unlimited              |
| Custom services                            | 1                   | 5                   | 25                     |
| Storage                                    | 100 MB              | 2 GB                | 20 GB                  |
| Exports                                    | —                   | ✅                  | ✅                     |
| Advanced reports (trial balance, day book) | —                   | ✅                  | ✅                     |
| Custom branding                            | —                   | —                   | ✅                     |
| Connector eligibility                      | —                   | —                   | ✅                     |
| Grace period after expiry                  | 0 days              | 7 days              | 7 days                 |

## Central entitlement service

`apps/api/src/modules/subscription/entitlements.service.ts` is the only code that reads plan data:
`effective()` = subscription's plan version entitlements, overlaid with active admin overrides (latest wins,
optional expiry). No module checks plan names.

## Usage periods and quota enforcement

- Monthly record quota counts **every record created** (including drafts) in the **calendar month of the shop's
  timezone** (default Asia/Kolkata), period key `YYYY-MM`.
- Consumption is atomic: `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < limit RETURNING`,
  executed inside the record-creating transaction (a failed create rolls the usage back). A concurrency test fires
  12 parallel creates against a limit of 5 → exactly 5 succeed.
- Staff, enabled-service and custom-service limits lock the tenant row while counting.
- Admin usage adjustments are idempotent (unique `idempotencyKey`).

## Lifecycle

`TRIALING → ACTIVE → GRACE → (downgrade to default plan)`; scheduled changes apply at period end.
`runLifecycle` (hourly worker job; also `POST /v1/admin/subscriptions/run-lifecycle`) is idempotent:

- trial ended → downgrade to the default plan (events `EXPIRED`, `DOWNGRADED`);
- active period ended → `GRACE` until `periodEnd + graceDays` (paid features continue, shop notified);
- grace ended → downgrade to the default plan;
- scheduled plan change due → applied.

## Plan versioning

Publishing a version creates `PlanVersion n+1` and makes it current for **new** subscribers. Existing subscribers:

- `KEEP_CURRENT_VERSION` — stay on their version, including at renewal (grandfathered);
- `MIGRATE_AT_RENEWAL` — move to the latest version when they next renew/activate;
- `MIGRATE_NOW` — moved immediately (a `PLAN_CHANGED` event per subscriber).

## Downgrade and historical data policy

No data is deleted or hidden after a downgrade or expiry:

- All records, customers, ledger and reports remain **readable**; limits only restrict **new** activity.
- If more services are enabled than the new plan allows, the earliest-enabled services stay usable for new
  entries; the rest show reason `PLAN` (history remains viewable) until the shop upgrades or disables others.
- Existing staff stay active; new invitations are blocked until under the limit.
- Exports/advanced reports need a plan that includes them (data is still visible in-app).

## Manual payment workflow (no payment gateway)

1. Owner opens Subscription, picks plan + cycle, sees the quote (base + tax) and pays by their own means
   (UPI/bank transfer to the business account), then submits the reference (`POST /v1/subscription/payment-submissions`, idempotent; optional proof upload).
2. Super admin reviews (Admin → Payments): amount-vs-quote mismatch is flagged; approve or reject with notes.
3. Approval (row-locked, single-use) activates/renews the subscription for one period, writes events, notifies the
   owner in-app and by email. Rejection notifies with the reason.

SaaS billing is entirely separate from Pay2All/provider transactions.
