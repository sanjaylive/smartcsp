# @csp2all/web — CSP tenant portal

Next.js 15 (App Router) portal for CSP shop owners and staff: sign-in, onboarding, service
records, customers, dues, cashbook, commissions, daily closing, reports, staff, subscription and
settings. The super-admin portal is a separate app (`apps/admin`, port 3611).

Stack: Next 15.5, React 19.2, TypeScript 5.9, Tailwind CSS 4, Radix UI (dialog, dropdown, switch),
lucide-react, TanStack Query 5. Shapes, validation, money/date utilities, the service registry,
design tokens and most strings come from `@csp2all/shared`.

## Running locally

Prerequisites: the dev infrastructure (`pnpm infra:up` from the repo root), the API on
http://localhost:4610 (`apps/api`: `set -a && . ./.env && set +a && node dist/main.js`) and, for
CSV exports and other background jobs, the API worker (`node dist/worker.js`, same env).

```sh
pnpm --filter @csp2all/shared build   # once, if packages/shared/dist is missing
pnpm --filter @csp2all/web dev        # http://localhost:3610
# or a production build
pnpm --filter @csp2all/web build && pnpm --filter @csp2all/web start
```

Scripts: `dev` (port 3610), `build`, `start` (port 3610), `lint`, `typecheck`, `test:e2e`.

### Environment variables

| Variable  | Default                 | Purpose                                                        |
| --------- | ----------------------- | -------------------------------------------------------------- |
| `API_URL` | `http://localhost:4610` | Target of the `/api/:path*` rewrite (read at build/start time) |

The browser only ever talks to the same origin: `/api/*` is proxied to the API, so the httpOnly
`csp2all_sid` session cookie and the readable `csp2all_csrf` cookie are first-party. The API must
allow the web origin (`WEB_ORIGINS=http://localhost:3610`).

## How it works

- **Auth**: email OTP (`/login`), then routing from `/v1/auth/me` → `/onboarding`, `/select-shop`
  or `/app`. No tokens are kept in `localStorage`/`sessionStorage`; only the language and theme
  preferences are stored, as plain cookies.
- **API client** (`src/lib/api.ts`): adds `X-CSRF-Token` (double-submit; fetches
  `/v1/auth/csrf` when the cookie is missing and retries once on `CSRF_FAILED`), sends an
  `Idempotency-Key` on creates (one UUID per form submission, reused on retry), maps
  `{error:{code,message,fields,details}}` to `ApiError`, redirects on `UNAUTHENTICATED` /
  `SESSION_EXPIRED` / `TENANT_REQUIRED`.
- **Context-driven UI**: `/v1/tenant/context` provides permissions, navigation, service
  availability (with reasons), plan entitlements, usage, support-access sessions and
  announcements. Controls the user lacks permission for are hidden; the API enforces everything.
- **Forms** validate client-side with the shared Zod schemas (`recordCreateSchema`,
  `buildDetailsSchema(fields)`, …) and map server `fields` (dotted paths such as
  `details.accountLast4`) back onto inputs. Money is typed in rupees and converted with
  `parseRupeesToPaise`; everything is displayed with `formatINR` and tabular numerals. Business
  dates are `YYYY-MM-DD` in the shop timezone and shown as `06 Nov 2026`.
- **Error states**: `QueryState`/`ErrorBlock` render loading skeletons, retry, permission denied,
  not found, suspended shop and plan-limit/upgrade panels (`QUOTA_EXCEEDED`,
  `ENTITLEMENT_REQUIRED`). `VERSION_CONFLICT` offers a reload; a posted record moving to
  failed/cancelled asks whether to reverse its cash entries.
- **i18n**: `t(key)` looks up the shared `en`/`hi` dictionaries first, then the web supplement in
  `src/lib/i18n-local.ts` (every entry has English and Hindi). Keys are type-checked.
- **Theme**: CSS variables mirror `tokens.ts` (light + dark, service accents) in
  `src/app/globals.css`. Dark mode follows the system unless toggled.
- **Security headers** (`next.config.ts`): CSP (`default-src 'self'`, `frame-ancestors 'none'`,
  no third-party origins), `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions
  policies. User content is rendered as text only (`react/no-danger` is an ESLint error).

## End-to-end tests (Playwright)

`e2e/acceptance.spec.ts` runs acceptance steps 1–16 as one serial journey with unique emails per
run: OTP sign-up (code read from Mailpit), onboarding with AEPS/DMT/PAN, customer + AEPS record
with live posting preview and cashbook verification, PAN application with follow-up, DMT due with
a partial collection, operator invite and restricted sign-in (UI and API denials), Free-plan quota
(via a per-tenant `monthlyRecordLimit` override set by the super admin), manual payment
submission, super-admin approval (email OTP + TOTP computed in the test), Growth entitlements and
CSV export, day close + reports, and cross-tenant isolation checks.

```sh
pnpm --filter @csp2all/web exec playwright install chromium   # once
pnpm --filter @csp2all/web build
pnpm --filter @csp2all/web test:e2e        # starts `next start` on 3610 unless one is running
WEB_URL=http://localhost:3610 pnpm --filter @csp2all/web test:e2e   # use an already-running server
```

| Variable                | Default                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `WEB_URL`               | `http://localhost:3610` (set it to skip starting a server) |
| `API_URL`               | `http://localhost:4610`                                    |
| `MAILPIT_URL`           | `http://127.0.0.1:56626`                                   |
| `E2E_ADMIN_EMAIL`       | `dev.admin@example.test`                                   |
| `E2E_ADMIN_TOTP_SECRET` | `JBSWY3DPEHPK3PXPJBSWY3DP`                                 |

Notes:

- The API limits OTP requests (5 per email per hour, 30 per IP per hour). The admin session is
  cached in `e2e/.auth/admin.json` (git-ignored) and reused while valid, so repeated runs do not
  request a new admin code each time. If the shared dev admin is rate-limited by other activity,
  wait for the window to pass or point `E2E_ADMIN_EMAIL`/`E2E_ADMIN_TOTP_SECRET` at another
  development admin.
- Step 15 closes _today's_ business day for the test shop only.
- Artifacts: `playwright-report/` (HTML) and `test-results/` (traces/screenshots on failure).
