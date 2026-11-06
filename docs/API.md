# API conventions

- **Spec:** `docs/openapi.json` (OpenAPI 3.0, generated from controller metadata + shared Zod schemas:
  `pnpm --filter @csp2all/api openapi`). Interactive docs at `/docs` (disable with `API_DOCS_ENABLED=false`).
- **Versioning:** all routes are under `/v1`. Breaking changes ship as `/v2` routes alongside `/v1`.
- **Auth:**
  - Web: `csp2all_sid` httpOnly `SameSite=Lax` cookie + double-submit CSRF (`X-CSRF-Token` header must equal
    the `csp2all_csrf` cookie on POST/PUT/PATCH/DELETE; `Origin`, when present, must be an allowed web origin).
  - Mobile: `Authorization: Bearer <access token>` (15 min) and rotating single-use refresh tokens
    (`POST /v1/auth/refresh`). Re-presenting a just-used refresh token within 30 s (lost response on a flaky
    network) returns a fresh pair and invalidates the unseen successor; reuse after that window revokes the
    whole session. Idempotent replays (same `Idempotency-Key`) return the stored response verbatim — use
    `clientRef` + `duplicate` to detect duplicate record submissions.
  - 401 codes: `SESSION_EXPIRED` = access token/session past its lifetime (refresh, or sign in if refresh also
    fails); `UNAUTHENTICATED` = token unknown, rotated or revoked (sign in again). Clients may treat any 401
    as "try one refresh, then sign in".
  - Admin: separate `csp2all_asid` cookie, email OTP + TOTP. Admin and tenant sessions are not interchangeable.
  - Active shop is chosen server-side with `POST /v1/auth/select-tenant` and re-validated on every request.
- **Authorization:** deny-by-default; each route declares its policy (`x-permissions` in the spec). Routes without
  a policy are rejected at runtime.
- **Errors:** `{"error": {"code", "message", "requestId", "fields"?, "details"?}}` with stable `code`s
  (`packages/shared/src/errors.ts`). `fields` maps dotted paths (e.g. `details.accountLast4`) to messages.
  Status mapping: 401 auth, 402 quota/entitlement, 403 permission/CSRF, 404 not found (also for other tenants'
  ids), 409 conflict/version/state, 422 validation, 423 suspended shop, 429 rate limit (`Retry-After`).
- **Request IDs:** every response has `X-Request-Id` (client-supplied value accepted if safe); errors echo it.
- **Pagination:** `?page=1&pageSize=25` (max 100) → `{items, page, pageSize, total, pages}`.
- **Filtering/search:** documented per route (`q`, `status`, `from`/`to`, `service`, …). Search is tenant-scoped.
- **Idempotency:** retryable creates/postings accept `Idempotency-Key` (8–100 chars). Same key + same body →
  the original response is replayed; same key + different body → `IDEMPOTENCY_KEY_REUSED`; concurrent duplicate →
  `IDEMPOTENCY_IN_PROGRESS`. Keys are scoped per tenant+user and kept 24 h. Mobile drafts also send `clientRef`
  (unique per tenant) so retries return the original record with `duplicate: true`. Provider operations
  _require_ an Idempotency-Key.
- **Optimistic concurrency:** mutable resources expose `version`; updates must send it; stale → `VERSION_CONFLICT`.
- **Money:** integer paise in fields ending `Paise` (e.g. `principalPaise: 500000` = ₹5,000.00). Never floats.
- **Dates:** business dates `YYYY-MM-DD` in the shop timezone; instants ISO-8601 UTC (`createdAt`).
- **Rate limits:** per-IP API limit; OTP limits per email, per IP and verification attempts per challenge.
- **Webhooks:** `POST /v1/webhooks/:provider` — signature verified on the raw body before parsing, replay window,
  unique delivery ids (duplicates acknowledged, not re-applied).

## Example: create and post an AEPS manual record

```http
POST /v1/records
Authorization: Bearer …            (or cookie + X-CSRF-Token)
Idempotency-Key: 7c1d6b8e-2f9a-4c55-9a51-1b0d2a7e6f10
Content-Type: application/json

{ "serviceCode": "AEPS", "walkInName": "Ramesh Kumar", "txnDate": "2026-11-06",
  "opStatus": "SUCCESSFUL", "principalPaise": 500000, "customerFeePaise": 1000,
  "expectedCommissionPaise": 1250, "paymentMethod": "CASH", "amountCollectedPaise": 1000,
  "details": { "operationType": "CASH_WITHDRAWAL", "bankLabel": "Demo Gramin Bank" }, "post": true }
```

`201` → record with `recordNo`, `postingStatus: "POSTED"`, `paymentStatus: "PAID"`, `isManual: true`.
Preview the cashbook effect first with `POST /v1/records/posting-preview` (same body, no writes).
