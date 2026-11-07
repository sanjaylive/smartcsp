# Deployment and operations guide

## Environments

| Env         | Purpose         | Notes                                                                                                                    |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| development | local laptops   | `infra/docker/compose.dev.yml`; simulator allowed; Mailpit; SeaweedFS (S3)                                               |
| test        | automated tests | isolated DB `csp2all_test`, Redis DB 3, in-memory email, inline jobs, fs storage                                         |
| staging     | pre-production  | production config (secure cookies, SMTP, BullMQ), separate DB/bucket/secrets, demo seed allowed only on explicit request |
| production  | live            | `NODE_ENV=production`; simulator refused; demo seed refused; secrets from a secret manager                               |

Use separate databases, buckets, Redis instances, SMTP credentials and encryption keys per environment.

## Local development

```bash
pnpm install
pnpm infra:up                                  # Postgres 17, Redis 7.4, Mailpit, SeaweedFS (localhost only)
cp .env.example apps/api/.env                  # fill the four secrets: openssl rand -hex 32
pnpm --filter @csp2all/shared build
pnpm --filter @csp2all/api build
pnpm --filter @csp2all/api db:migrate          # runs as MIGRATION_DATABASE_URL (owner role)
pnpm --filter @csp2all/api db:seed             # reference data: service catalog + plans (idempotent)
pnpm --filter @csp2all/api db:seed:demo        # optional fictional demo shop
pnpm --filter @csp2all/api dev                 # API http://localhost:4610 (docs: /docs)
pnpm --filter @csp2all/api start:worker        # background jobs (separate terminal)
pnpm --filter @csp2all/web dev                 # tenant portal http://localhost:3610
pnpm --filter @csp2all/admin dev               # admin console http://localhost:3611
```

Sign-in codes arrive in Mailpit: http://127.0.0.1:56626. A local admin with a known TOTP secret can be created
with `node apps/api/dist/cli/dev-admin.js --email you@example.test --totp-secret <BASE32>` (refused outside
development/test). Reset a local DB: `infra/scripts/reset-db.sh csp2all_dev`.

## smart-outlet.in (automated deploy)

One hostname, `smart-outlet.in` (`www.` redirects): tenant web at `/`, admin console at `/admin` (built with
`ADMIN_BASE_PATH=/admin`), API at `/api` (mobile base URL `https://smart-outlet.in/api`).

It runs on the **shared 2all host** `148.66.152.2` (user `twoall`) next to pay2all, park2all, ahost and hostelerp.
That host's only public entry point is the pay2all stack's Caddy (`pay2all-caddy-1`), so this stack
(`infra/docker/compose.smart-outlet.yml`, compose project `smartcsp`) publishes no ports: `csp-api`, `csp-web` and
`csp-admin` join the `pay2all_internal` network and every deploy re-applies the `# BEGIN smartcsp … # END smartcsp`
block (`infra/docker/smart-outlet.caddy`) to that Caddy's Caddyfile — validated first, previous file kept in
`/opt/csp2all/Caddyfile.edge.bak`, restored if the reload fails. A pay2all release can drop the block; the next
smartcsp deploy puts it back. Containers have memory limits; uploads/exports use the `fs` driver on the
`smartcsp_storage` volume.

**Every release:** `npm run deploy` (`infra/scripts/deploy.sh`) — requires a clean `main`; pushes to GitHub, starts
`.github/workflows/deploy.yml` and follows it: full CI → images `ghcr.io/sanjaylive/smartcsp-{api,web,admin}:<sha>`
→ SSH → `infra/scripts/remote-deploy.sh` (pre-deploy `pg_dump` to `/opt/csp2all/backups`, `csp-migrate` release job,
`up --wait` on health checks, edge Caddy block) → HTTPS smoke test. Rollback: re-run the Deploy workflow on an older
commit.

**Server state** (`/opt/csp2all`, owned by `twoall`): the first deploy generates `api.env` (mode 600) and
`secrets/` — never in git. Set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` in `api.env` for sign-in emails, then
`npm run deploy` again. GitHub secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` hold the
connection. After the first deploy, create the first super admin:
`docker compose -p smartcsp -f /opt/csp2all/docker/compose.smart-outlet.yml run --rm csp-api node dist/cli/bootstrap-admin.js --email …`
(with the same env exports remote-deploy.sh sets).

## Production topology

`Caddy (TLS)` → `web` (Next.js) · `admin` (Next.js, separate hostname, optionally IP-restricted) · `api` (NestJS);
`worker` (same image as api) consumes BullMQ jobs and dispatches the outbox; Postgres, Redis and object storage
are private. Reference stack: `infra/docker/compose.prod.yml` (or use managed Postgres/Redis/S3 and run the
images on any container platform).

### Build images

```bash
docker build -f infra/docker/api.Dockerfile -t registry.example/csp2all-api:$GIT_SHA .
docker build -f infra/docker/next.Dockerfile --build-arg APP=web   -t registry.example/csp2all-web:$GIT_SHA .
docker build -f infra/docker/next.Dockerfile --build-arg APP=admin -t registry.example/csp2all-admin:$GIT_SHA .
```

Images run as a non-root user and work with a read-only root filesystem.

### Database roles

Create two roles (see `infra/docker/postgres-init-prod/01-roles.sh`): `csp2all_owner` owns the schema and runs
migrations; `csp2all_app` is used by api/worker, is **not** the owner and has `NOBYPASSRLS`, so row-level security
always applies. Never give the app role ownership or `BYPASSRLS`.

### Secrets

`OTP_PEPPER`, `SECRETS_ENCRYPTION_KEY`, `FILE_URL_SIGNING_KEY`, `IP_HASH_SALT`, DB/Redis/SMTP/S3 credentials —
from a secret manager, never in images or git. Rotation:

- `FILE_URL_SIGNING_KEY`, `IP_HASH_SALT`: rotate any time (links in flight expire; IP hashes change going forward).
- `OTP_PEPPER`: rotate any time (outstanding codes become invalid — users request a new one).
- `SECRETS_ENCRYPTION_KEY`: requires re-encryption of `connector_configs.credentialsEnc` and
  `platform_admins.totpSecretEnc` (decrypt with old, encrypt with new in a maintenance script) — or re-enter
  connector credentials and re-enrol admin TOTP.

### Release procedure (migrations are never run automatically on startup)

1. Back up the database (below) and confirm the backup restores.
2. Review pending migrations (`prisma migrate status`); migrations are additive by default — destructive changes
   must be split into expand → deploy → contract releases.
3. Run the one-off job: `docker compose -f infra/docker/compose.prod.yml --profile release run --rm migrate`
   (applies migrations as the owner role and upserts reference data; idempotent).
4. Roll out api + worker, then web + admin (rolling or blue/green). Watch `/ready`, error rates and job failures.
5. Smoke test: sign-in, dashboard, create + post a record on a staging tenant.

### Rollback

- Application: redeploy the previous image tags (images are immutable by git SHA).
- Database: migrations are forward-only; ship a corrective migration. Restore from backup only for data loss —
  restore into a new database, verify (`infra/scripts/restore.sh` prints the unbalanced-entry check), then switch.

### First super admin (safe bootstrap)

No admin credentials are seeded. After the first release:

```bash
docker compose -f infra/docker/compose.prod.yml run --rm api node dist/cli/bootstrap-admin.js --email owner@yourcompany.example
```

It refuses if an active super admin exists. The person signs in at the admin hostname with an email code and must
enrol an authenticator app (TOTP) before any admin function works. Add further admins from the console.

### Workers and scheduled jobs

Run ≥1 worker replica (`node dist/worker.js`). It processes `email.send`, `export.generate`, `attachment.scan`,
`reconciliation.run` (every 5 min), `subscription.lifecycle` (hourly), `cleanup` (02:30 IST),
`followups.notify` (08:00 IST), and dispatches the transactional outbox every 2 s. Jobs are retry-safe and
deduplicated by outbox id; failed jobs are visible and retryable in Admin → Jobs.

### Health, logs, metrics, errors

- `GET /health` (liveness), `GET /ready` (DB + Redis), `GET /metrics` (Prometheus text; set `METRICS_TOKEN`;
  blocked at the public proxy).
- Structured JSON logs (pino) with request ids; cookies, tokens, codes and credentials are redacted.
- Error monitoring: set `SENTRY_DSN` and wire the SDK in `ErrorFilter` (integration point; not bundled to avoid
  sending data before a DPA is in place). Alert on 5xx rate, `/ready` failures, failed jobs, email failures,
  reconciliation exceptions.

### Storage and email

- Object storage: a private bucket with default encryption and public access blocked; lifecycle rule deleting
  `tenants/*/exports/*` after 2 days as a safety net. Configure `S3_*`.
- Email: any SMTP provider (`SMTP_*`, SPF/DKIM/DMARC for `EMAIL_FROM` domain). `EMAIL_DELIVERY=queue`.

### Backups

- Nightly `infra/scripts/backup.sh` (pg_dump custom format → optional `age` encryption → private bucket,
  14-day local retention). Use managed point-in-time recovery as well where available.
- Monthly restore drill with `infra/scripts/restore.sh` into a scratch database; verify tenant counts and that
  the unbalanced-entry check returns 0.
- Redis holds only transient queue/rate-limit data (AOF enabled); the outbox makes DB-originated jobs recoverable.

### Network

Only ports 80/443 (proxy) are public. Postgres and Redis must never be exposed publicly. Restrict the admin
hostname by IP/VPN where possible. Set `TRUST_PROXY=true` only when exactly one trusted proxy sits in front.

## Flutter release

See `apps/mobile/README.md` (build flavours, `--dart-define=API_BASE_URL`, Android keystore via `key.properties`
kept out of git, iOS signing in Xcode).
