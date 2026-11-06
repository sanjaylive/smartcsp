# CSP2All — Architecture & Implementation Checklist

CSP2All is a **record-first** multi-tenant SaaS for Customer Service Point (CSP) shops.
By default it _records_ activity performed on external systems; it does **not** move money
or execute government services. An optional Pay2All connector boundary exists, but ships
**disabled** with a clearly-labelled simulator because no official Pay2All documentation or
credentials were supplied (see `docs/PAY2ALL_READINESS.md`).

## 1. Monorepo layout

```
apps/api        NestJS 11 REST API (authoritative business rules), Prisma 6, BullMQ workers
apps/web        Next.js 15 tenant (CSP) portal
apps/admin      Next.js 15 super-admin console (separate origin)
apps/mobile     Flutter client (Android/iOS) using the same REST API
packages/shared Zod schemas, service registry, permission matrix, money/date utils,
                i18n dictionaries (en, hi), design tokens — no business decisions
infra/          Docker Compose, Dockerfiles, Postgres role bootstrap, backup scripts
docs/           Architecture, ERD, permissions, finance postings, API, ops guides
```

The API is the only place that decides permissions, entitlements, quotas, financial
postings and workflow transitions. `packages/shared` provides _shapes_ (schemas, codes,
labels, tokens) so clients can render forms and give early validation feedback; the API
re-validates everything.

## 2. Key decisions (assumptions recorded)

| Area            | Decision                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versions        | Pinned latest releases of NestJS 11, Prisma 6.19, Next 15.5, TS 5.9, React 19, Zod 4. Newer majors (Nest 12, TS 7, Prisma 7/8, Next 16) exist; upgrade is a follow-up.                                                    |
| Tenancy         | One shop (`Tenant`) with one primary `Branch`; records carry `branchId` so multi-branch can be added without changing ownership. Users ↔ tenants via `Membership`.                                                        |
| Active tenant   | Stored server-side on the session, set via `POST /v1/auth/select-tenant` after membership validation; re-validated on every request. Never taken from a header.                                                           |
| Sessions        | Opaque random tokens, only SHA-256 hashes stored. Web: httpOnly `Secure` `SameSite=Lax` cookie + double-submit CSRF token. Mobile: 15-min access token + rotating refresh token with reuse detection (family revocation). |
| Admin context   | Separate `ADMIN` session kind, separate cookie, email OTP **plus TOTP** MFA. Platform admins cannot use tenant endpoints with an admin session and vice versa.                                                            |
| Isolation       | App-layer tenant scoping on every query **and** PostgreSQL RLS (`app.tenant_id` set per transaction; app DB role is not table owner). Composite `(tenantId, id)` FKs prevent cross-tenant references.                     |
| Money           | Integer paise (`BigInt` in DB, safe integers in JSON, fields suffixed `Paise`). No floats.                                                                                                                                |
| Ledger          | Double-entry journal per tenant. Balances derived from posted lines. DB deferred trigger rejects unbalanced entries; posted lines are immutable; corrections via compensating entries.                                    |
| Status          | Operational, payment and connector statuses are separate columns with explicit transition tables. "Successful" on a manual record = _operator reported_ success.                                                          |
| Service details | Hybrid: shared columns + `details` JSONB validated by a per-service Zod schema (no free-form form builder). Custom services: bounded field definitions only.                                                              |
| Plans           | Free/Growth/Pro seeded as **editable demo defaults**. Versioned `PlanVersion`s; entitlement service is the single place quotas are evaluated.                                                                             |
| Quotas          | Atomic `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` usage counters keyed by tenant-timezone month.                                                                                                              |
| Jobs            | Transactional outbox table → dispatcher → BullMQ queues (email, exports, notifications, reconciliation, cleanup).                                                                                                         |
| Files           | Private S3-compatible bucket (SeaweedFS locally), short-lived presigned GET after permission check, size/type allow-list, scan status hook.                                                                               |
| Email           | Adapter interface; SMTP (Mailpit locally); console adapter for tests. OTPs are never logged.                                                                                                                              |
| Admin web       | Separate Next.js app (`apps/admin`, own hostname/port) with its own cookie, session kind and TOTP MFA — a different origin from the tenant portal.                                                                        |
| i18n            | Translation keys in `packages/shared/src/i18n/{en,hi}.ts`; Flutter ARB files generated from the same keys.                                                                                                                |

## 3. Request pipeline (API)

`requestId → helmet/CORS → cookie parser → rate limit → auth guard (session lookup) →
CSRF guard (cookie auth + unsafe method) → tenant guard (membership + tenant status) →
permission guard (deny-by-default `@RequirePermission`) → Zod validation pipe →
service (TenantDb.run(ctx, tx => …) sets RLS context) → audit → error filter (stable codes)`

## 4. Implementation checklist

- [x] Repository inspection (empty repo), toolchain check
- [x] Phase 1 — Architecture doc, monorepo, Docker Compose, shared package, design tokens
- [x] Phase 2 — Prisma schema, migrations, RLS, roles, immutability triggers, seed
- [x] Phase 2 — Auth: email OTP, sessions, CSRF, logout(-all), tenant selection
- [x] Phase 3 — Onboarding (resumable, idempotent provisioning), service registry, dashboard
- [x] Phase 3 — Service records (all 10 service types + custom), status transitions
- [x] Phase 4 — Customers, follow-ups, attachments
- [x] Phase 4 — Ledger, postings, collections/dues, expenses, commissions, daily close/reopen
- [x] Phase 4 — Reports, exports (async, formula-safe)
- [x] Phase 5 — Plans, versions, entitlements, usage quotas, manual payment approval
- [x] Phase 5 — Staff & permissions, super-admin portal API, support sessions, TOTP
- [x] Phase 5 — Web portal (CSP) + admin portal UI
- [x] Phase 6 — Flutter client
- [x] Phase 7 — Connector boundary, disabled Pay2All adapter, simulator, webhooks, reconciliation
- [x] Phase 8 — Tests (unit, DB, API, Playwright), CI, Dockerfiles, docs

Verified results and remaining gaps: `docs/STATUS.md`.
