# @csp2all/admin — platform admin console

Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + TanStack Query console for CSP2All
super admins and support staff. It talks only to the existing admin API (`apps/api`,
`/v1/admin/*`); there is no server-side business logic here.

## Running

```bash
# from the repo root (API on :4610 and infra must be up)
pnpm --filter @csp2all/shared build        # once, if packages/shared/dist is missing
pnpm --filter @csp2all/admin dev           # http://localhost:3611
```

| Variable  | Default                 | Purpose                                                    |
| --------- | ----------------------- | ---------------------------------------------------------- |
| `API_URL` | `http://localhost:4610` | Where the Next server proxies `/api/*` (server-side only). |

Port **3611** matters: the API's `WEB_ORIGINS` allows `http://localhost:3611` for the CSRF
origin check.

Scripts: `dev`, `build`, `start` (production server on :3611), `lint`, `typecheck`, `test:e2e`.

### Signing in (development)

Dev super admin: `dev.admin@example.test`, TOTP secret `JBSWY3DPEHPK3PXPJBSWY3DP`
(reset with `cd apps/api && set -a && . ./.env && set +a && node dist/cli/dev-admin.js --email dev.admin@example.test --totp-secret JBSWY3DPEHPK3PXPJBSWY3DP`).
The email code arrives in Mailpit (http://127.0.0.1:56626). Admins added from the **Admins**
page enrol an authenticator on first sign-in (QR code + text secret).

## How it works

- **Same-origin proxy.** `next.config.ts` rewrites `/api/:path*` → `${API_URL}/:path*`, so the
  admin session cookie (`csp2all_asid`, httpOnly, `SameSite=Strict`) is first-party. No token is
  ever stored in `localStorage`/`sessionStorage` (only the theme preference is).
- **CSRF.** Every unsafe request sends `X-CSRF-Token` = the readable `csp2all_csrf` cookie
  (fetched from `GET /v1/auth/csrf` if missing) — see `src/lib/api.ts`.
- **Auth flow** (`src/app/login/page.tsx`): email → `otp/request` (generic response) → code →
  `otp/verify` → `ENROLL` (`totp/setup`, QR via `qrcode.react` + text secret) or `VERIFY` →
  `totp/verify`. `GET /v1/admin/auth/me` decides where to resume. Any `SESSION_EXPIRED`,
  `UNAUTHENTICATED` or `MFA_REQUIRED` from any call sends the admin back to `/login` with a reason
  (admin sessions idle out after 30 minutes).
- **Permissions.** Navigation and controls are filtered with the `permissions` returned by
  `/auth/me` (`PLATFORM_ROLE_PERMISSIONS` in `@csp2all/shared`): SUPPORT admins only get
  `platform.view`, `support.access`, `audit.view`. Pages they cannot use show a permission-denied
  state; the API enforces everything regardless.
- **Money** is integer paise (`formatINR` for display, `parseRupeesToPaise` for input). Tax rates
  are basis points (the plan form takes a percentage, e.g. `18` → `1800`).
- **Security headers.** `src/middleware.ts` sets a per-request nonce CSP (`script-src 'self'
'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `connect-src
'self'`); `next.config.ts` adds `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy:
no-referrer`, `Permissions-Policy`, COOP, `noindex`, and HSTS in production. All pages are
  rendered per request (`dynamic = 'force-dynamic'`) so the nonce applies.

## Pages

| Route                                                           | What                                                                                                                                                                                                                                                                                                              | Permission                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/login`                                                        | Email code → TOTP enrol (QR) / verify                                                                                                                                                                                                                                                                             | —                                                                                          |
| `/`                                                             | Overview: tenants by status, users, records, items needing attention, queue counts                                                                                                                                                                                                                                | `platform.view`                                                                            |
| `/tenants`, `/tenants/[id]`                                     | Search/filter; detail with subscription, entitlements + overrides (add/revoke), usage (+ idempotent adjustment), members, services, connector, events, support history. Actions: suspend/restore (reason), deletion request (typed shop-name confirmation), plan change (now / period end), start support session | view: `platform.view`; actions: `tenants.manage`, `subscriptions.manage`, `support.access` |
| `/users`                                                        | Search by email, disable/enable with reason (disabling revokes all sessions)                                                                                                                                                                                                                                      | `users.manage`                                                                             |
| `/plans`                                                        | Every plan with current version + full version history, subscriber counts, demo-default badge, active toggle, "Publish new version" (prefilled from current, diff preview, existing-subscriber policy explained), run lifecycle                                                                                   | view: `platform.view`; edit: `plans.manage`                                                |
| `/payments`                                                     | Manual payment queue (Submitted/Approved/Rejected), prominent amount-mismatch flag, approve/reject with notes                                                                                                                                                                                                     | `payments.approve`                                                                         |
| `/services`                                                     | Catalog with adoption counts and platform toggle (warning: disabling blocks new entries, keeps history)                                                                                                                                                                                                           | view: `platform.view`; toggle: `catalog.manage`                                            |
| `/connectors`                                                   | Pay2All disabled notice with missing prerequisites, connector configs (simulator), operation stats, reconciliation exceptions, webhook receipts                                                                                                                                                                   | `connectors.manage`                                                                        |
| `/emails`                                                       | Email delivery log, status filter                                                                                                                                                                                                                                                                                 | `platform.view`                                                                            |
| `/jobs`                                                         | Queue counts, failed jobs and failed outbox events with retry                                                                                                                                                                                                                                                     | `jobs.manage`                                                                              |
| `/announcements`                                                | List, publish (severity, schedule), end now                                                                                                                                                                                                                                                                       | view: `platform.view`; edit: `announcements.manage`                                        |
| `/audit`                                                        | Platform audit log filtered by tenant ID and action prefix, expandable JSON                                                                                                                                                                                                                                       | `audit.view`                                                                               |
| `/settings`                                                     | Data retention, sign-ups flag, support contact (validated like the API)                                                                                                                                                                                                                                           | view: `platform.view`; edit: `settings.manage`                                             |
| `/admins`                                                       | Add admin, change role/status; `LAST_SUPER_ADMIN` errors shown in the dialog                                                                                                                                                                                                                                      | `admins.manage`                                                                            |
| `/support`, `/support/[id]`, `/support/[id]/records/[recordId]` | Start (reason ≥ 10 chars, ≤ 120 min), countdown banner (global header + page), read-only records list/detail labelled "Read-only support access — visible to the shop", end session                                                                                                                               | `support.access`                                                                           |

Every data view has loading, empty, error (with request ID and retry) and permission-denied
states; destructive or sensitive actions go through confirmation dialogs (`src/components/dialog.tsx`).

## E2E smoke tests (Playwright, chromium)

Runs against the **real** API and Mailpit — nothing is mocked.

```bash
pnpm --filter @csp2all/admin build
pnpm --filter @csp2all/admin exec playwright install chromium   # once
pnpm --filter @csp2all/admin test:e2e
```

The config starts `next start` on :3611 unless something is already listening there
(`E2E_WEB_COMMAND="pnpm dev"` to use the dev server, `E2E_BASE_URL` to target another URL).
Other env: `API_URL`, `MAILPIT_URL` (default `http://127.0.0.1:56626`), `E2E_ADMIN_EMAIL`,
`E2E_ADMIN_TOTP_SECRET`, `E2E_FRESH_LOGIN=1` (force a fresh UI sign-in instead of reusing the
saved session in `e2e/.auth/`, which keeps repeated runs under the API's 5-codes-per-email-per-hour
limit).

What it covers:

1. `auth.setup.ts` — super admin signs in through the UI (code read from Mailpit, TOTP computed in the test).
2. `admin.spec.ts` (creates its own shop + one record through the tenant API):
   overview; every console page renders without errors; tenant search + detail; suspend + restore;
   add + revoke an entitlement override; usage adjustment; support session start → read-only
   records list/detail (masked identifiers, no edit controls) → end; deletion request with
   typed-name confirmation (cleans up the test shop); publish a new version of a non-default plan
   with `KEEP_CURRENT_VERSION`.
3. `support-role.spec.ts` — creates a SUPPORT admin, signs in with first-time TOTP enrolment
   (QR + secret), verifies admin management / user / payment pages are hidden or denied, no plan
   publish/toggle/lifecycle controls, settings read-only, and the API returns `PERMISSION_DENIED`;
   then disables that admin.

Test data left behind on purpose: a `E2E Seva <run-id>` shop in `PENDING_DELETION`, a new
version of a non-default plan per run (existing subscribers kept on their version), a disabled
`e2e-support-<run-id>@example.test` admin, and their audit events. Nothing platform-wide (service
catalog, settings, default plan) is changed.

## Deployment notes

- Run with `NODE_ENV=production`, behind HTTPS (the CSP then adds `upgrade-insecure-requests`,
  and the API must use `COOKIE_SECURE=true`).
- All admin traffic reaches the API from the Next server, so set `TRUST_PROXY` on the API (and keep
  the Next server as the only hop) or every admin shares one IP for the API's per-IP OTP and
  request rate limits.
- Add the console's public origin to the API's `WEB_ORIGINS`.

## Known gaps

- Payment proofs are listed by file name only; the admin API exposes no download URL for them.
- The audit log filters only by tenant ID and action prefix (that is what the API supports).
- The overview has no time-series charts (the API returns point-in-time counts only).
- `signupsEnabled` and `supportContact` are stored by the API but not yet read anywhere else; the
  Settings page says so.
