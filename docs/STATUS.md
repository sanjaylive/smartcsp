# Status, verified results and known gaps

_Last verified: 06 Nov 2026 on macOS (Node 26.13, pnpm 10.34, Docker 29.9, Flutter 3.47.8)._

## Checklist

- [x] Architecture & decisions (`docs/ARCHITECTURE.md`)
- [x] Monorepo, Docker Compose dev infra, shared package (registry, permissions, schemas, money, i18n en/hi, tokens)
- [x] Schema, migrations, RLS, composite tenant FKs, ledger integrity/immutability triggers, fictional seed
- [x] Email OTP auth, web cookie + CSRF sessions, mobile rotating tokens, admin OTP + TOTP, logout / logout-all
- [x] Resumable, idempotent onboarding; additional shops; service-driven context/navigation/dashboard
- [x] Records for all 10 service types + custom services; status machines; post / reverse / correct
- [x] Customers, follow-ups, attachments (quarantine + signed URLs), dues & partial collections
- [x] Double-entry cashbook, expenses, commissions, daily close / reopen approval, reports, async CSV exports
- [x] Plans (versioned), central entitlements, atomic quotas, lifecycle (grace / downgrade), manual payment approval
- [x] Staff & permission matrix, super-admin API + console, support sessions (time-limited, audited, visible)
- [x] Tenant web portal (Next.js) and admin console (separate Next.js app)
- [x] Flutter app (Android verified; iOS source only — see below)
- [x] Connector boundary: disabled Pay2All adapter, labelled simulator, webhooks, reconciliation
- [x] Tests, CI workflow, Dockerfiles, production Compose, backup/restore, docs

## Commands executed and results (final run)

| Check                                                    | Result                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm --filter @csp2all/shared test`                     | 9 passed, 0 failed                                                                      |
| `pnpm --filter @csp2all/api test` (unit + DB + API)      | **9 suites, 109 tests passed**                                                          |
| api / web / admin `typecheck` and `lint`                 | all clean                                                                               |
| `prettier --check .`                                     | clean                                                                                   |
| `pnpm --filter @csp2all/web test:e2e` (Playwright)       | **15 passed** — acceptance steps 1–16 against live API + `next start`                   |
| `pnpm --filter @csp2all/admin test:e2e` (Playwright)     | **11 passed**                                                                           |
| web / admin `build`                                      | success (standalone output)                                                             |
| `flutter analyze` / `flutter test`                       | no issues / **55 passed**                                                               |
| Flutter live API check (`tool/live_api_check_test.dart`) | passed (OTP via Mailpit, onboarding, offline-draft sync dedupe, refresh rotation)       |
| `flutter build apk --debug` / `--release`                | built (release signed with debug key until `key.properties` exists — do not distribute) |
| `flutter build ios --debug --no-codesign`                | **not run successfully — Xcode/CocoaPods not installed on the build machine**           |
| Migration drift (`prisma migrate diff … --exit-code`)    | empty (schema and migrations match)                                                     |
| `docker build` api / web / admin                         | all built; each container started as uid 1000 with read-only root FS + all caps dropped |
| API container `/ready`, web/admin containers `/`         | 200 ready / 200 / 200                                                                   |
| `docker compose -f infra/docker/compose.prod.yml config` | valid                                                                                   |

The GitHub Actions workflow (`.github/workflows/ci.yml`) has **not** been executed (no remote configured).

### Re-run on 07 Nov 2026

Re-ran shared tests (9 passed), API tests (9 suites, 109 passed), api/web/admin typecheck + lint (clean),
`prettier --check .` (clean), web/admin `build` (success), web Playwright (15 passed), admin Playwright
(11 passed), `flutter analyze` (no issues) and `flutter test` (55 passed) — all matching the table above.

The Flutter live API check **failed** on its first re-run: it re-presented a spent refresh token a few seconds after
use and expected revocation, but the API deliberately accepts reuse within `REFRESH_REUSE_GRACE_MS` (30 s, for lost
responses). The earlier "passed" result for this check could not have held with that code. The test now waits out the
grace window before asserting reuse → session revoked, and passes (~32 s). Replay inside the window remains covered by
`apps/api/test/integration/auth.test.ts`.

Not re-run on 07 Nov: migration drift (`SHADOW_DATABASE_URL` not set in `apps/api/.env`), Docker image builds,
APK builds and the iOS build (still no Xcode/CocoaPods).

## Acceptance flow coverage

Steps 1–16 run in `apps/web/e2e/acceptance.spec.ts` (register via OTP, create shop, select AEPS/DMT/PAN, dashboard,
customer + manual AEPS record, cash movement in cashbook, PAN application + follow-up, due + partial collection,
invite operator, operator limits, Free-plan limit (via a per-tenant entitlement override), manual upgrade payment,
super-admin approval, upgraded entitlement, day close + reports, second-tenant isolation). Step 17 (mobile
equivalent) is covered by the Flutter live API check and widget tests; it was **not** run on an emulator/device.

## Incomplete or externally blocked

1. **Pay2All live execution — blocked:** no official documentation or credentials (`docs/PAY2ALL_READINESS.md`).
   The simulator's "execute" flow is API-only; the web UI configures the simulator but does not expose execution.
2. **iOS build** — needs Xcode + CocoaPods; the Debug→`Info-Debug.plist` project edit is unbuilt. No device or
   emulator runs were done for either platform.
3. **Legal/regulatory** — terms and privacy pages are templates; no compliance assessment (`docs/SECURITY.md`).
4. **Malware scanning** — ClamAV integration point implemented but not exercised; without it files are `SKIPPED`.
5. **Error monitoring** — `SENTRY_DSN` is an integration point only (no SDK wired).
6. **Accessibility** — keyboard/labels/contrast designed in and checked visually; no automated or assistive-tech audit.
7. **Hindi** — complete for core flows; Zod validation messages from the shared schemas are English (common ones
   are mapped in the web app); copy needs native-speaker review.
8. **Web UI gaps** — shop logo upload (API supports it); record edit form covers non-financial fields only
   (amount corrections via reverse → re-enter, as the API intends); admin overview has counts, no charts.
9. **Multi-branch** — schema ready (`Branch`, `branchId`), single primary branch only in the product.
10. **Rate limits behind proxies** — set `TRUST_PROXY=true` (and forward client IPs from the Next.js proxy) in
    deployment, otherwise per-IP OTP/API limits are shared by everyone behind the proxy.
11. **Dev database note** — e2e runs published extra GROWTH plan versions and left test tenants in the local dev
    DB; reset with `infra/scripts/reset-db.sh csp2all_dev` + seeds if a clean demo is needed.
12. **Upgrades** — pinned to NestJS 11 / Prisma 6.19 / Next 15.5 / TS 5.9 (newer majors exist; upgrade is follow-up).
