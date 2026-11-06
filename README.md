# CSP2All

Record-first, multi-tenant SaaS for Indian Customer Service Point (CSP) shops: customer visits, service records,
collections, expenses, commissions, dues and daily settlements — on web, mobile and a super-admin console.

> **CSP2All records activity; it does not execute financial transactions.** A manual record is the operator's
> report of something done on an external system — never proof that money moved or a government service
> completed. CSP2All is independent and not affiliated with any government body, bank or payment network.
> An optional Pay2All connector boundary exists but is **disabled** pending official documentation
> (see [docs/PAY2ALL_READINESS.md](docs/PAY2ALL_READINESS.md)).

## Repository

| Path              | What                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/api`        | NestJS 11 REST API (authoritative rules), Prisma 6 + PostgreSQL 17 (RLS), BullMQ worker               |
| `apps/web`        | Next.js 15 tenant portal (port 3610) + Playwright e2e                                                 |
| `apps/admin`      | Next.js 15 super-admin console (port 3611)                                                            |
| `apps/mobile`     | Flutter app (Android/iOS)                                                                             |
| `packages/shared` | Zod contracts, service registry, permission matrix, money/date utils, i18n (en/hi), design tokens     |
| `infra`           | Docker Compose (dev/prod), Dockerfiles, Postgres role bootstrap, backup/restore, DB reset             |
| `docs`            | Architecture, ERD, finance postings, permissions, plans, API, security, retention, deployment, status |

## Quick start (local)

Requirements: Node ≥ 22.12 (tested on 26), pnpm 10, Docker; Flutter 3.x for mobile.

```bash
pnpm install
pnpm infra:up
cp .env.example apps/api/.env      # then fill OTP_PEPPER, SECRETS_ENCRYPTION_KEY, FILE_URL_SIGNING_KEY, IP_HASH_SALT
pnpm --filter @csp2all/shared build && pnpm --filter @csp2all/api build
pnpm --filter @csp2all/api db:migrate && pnpm --filter @csp2all/api db:seed
pnpm --filter @csp2all/api db:seed:demo          # optional fictional demo shop
pnpm --filter @csp2all/api dev                   # http://localhost:4610  (OpenAPI UI at /docs)
pnpm --filter @csp2all/api start:worker
pnpm --filter @csp2all/web dev                   # http://localhost:3610
pnpm --filter @csp2all/admin dev                 # http://localhost:3611
```

Email codes: Mailpit at http://127.0.0.1:56626. Demo logins (after `db:seed:demo`): `demo.owner@example.test`,
`demo.operator@example.test`. All demo data is fictional.

## Tests

```bash
pnpm --filter @csp2all/shared test     # unit: money, privacy guards, schemas, permissions, i18n coverage
pnpm --filter @csp2all/api test        # unit + DB + API integration (isolated csp2all_test DB, RLS checks)
pnpm --filter @csp2all/web test:e2e    # Playwright acceptance flow (needs API + web running)
cd apps/mobile && flutter test
```

Current verified results are recorded in [docs/STATUS.md](docs/STATUS.md).

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Status & limitations](docs/STATUS.md) · [ERD](docs/ERD.md) ·
[Finance & postings](docs/FINANCE.md) · [Permissions](docs/PERMISSIONS.md) · [Plans](docs/PLANS.md) ·
[API](docs/API.md) / [OpenAPI](docs/openapi.json) · [Security & legal review](docs/SECURITY.md) ·
[Data retention](docs/DATA_RETENTION.md) · [Deployment & operations](docs/DEPLOYMENT.md) ·
[Pay2All readiness](docs/PAY2ALL_READINESS.md)
