# Pay2All integration readiness

**Status: BLOCKED — no official Pay2All documentation or credentials were supplied.** Following the product rule
"do not invent endpoints, signing rules, capabilities or payloads", the Pay2All adapter
(`apps/api/src/modules/integrations/providers.ts → Pay2AllAdapter`) is **disabled**: it implements the provider
interface but every operation returns `CONNECTOR_UNAVAILABLE` with the list of missing items. Manual
record-keeping is fully functional and never depends on the connector.

A clearly-labelled **SIMULATOR** implements the same interface for development and tests only (refused when
`NODE_ENV=production`; it never contacts a provider and never moves money).

## What exists today (provider-agnostic)

- Provider interface: `execute`, `queryStatus`, `verifyWebhook`, `health`, `supports(service)`.
- Readiness gate for execution: plan entitlement `connectorEligible` ∧ tenant config not DISABLED ∧ provider
  supports the service ∧ service enabled in the connector ∧ `provider.execute` permission ∧ service available.
  Clients receive `providerExecution.available/reason` per service and hide controls otherwise.
- Explicit confirmation (`confirmed: true`) and a required `Idempotency-Key` per operation.
- Operations create a **PROVIDER-sourced** record; manual records can never trigger execution.
- Outcome states: `INITIATED → PENDING | UNKNOWN | CONFIRMED | FAILED`, validated transitions, full event history;
  terminal states are never overwritten (conflicts become reconciliation exceptions).
- Timeouts/network failures after sending → `UNKNOWN`; **never blindly retried**; the user is told not to repeat.
  Reconciliation (`reconciliation.run`, every 5 min + on demand) queries status and resolves.
- Circuit breaker (5 consecutive failures → 30 s open; fails fast _before_ sending).
- Webhooks: raw-body signature verification before parsing, timestamp tolerance, unique delivery ids, receipt log.
- Per-tenant credentials encrypted (AES-256-GCM, separately managed key), masked, rotation increments `keyVersion`.
- Sanitised logs/audits (credentials and tokens redacted).

## Missing (needed from Pay2All / the business)

- [ ] Official API documentation: base URLs (sandbox/production), endpoints, request/response schemas, error codes
- [ ] Authentication and request-signing specification (keys, algorithms, headers, clock skew)
- [ ] Service catalogue and per-service semantics (recharge, BBPS, DMT, AEPS, MicroATM, PAN), limits and fees
- [ ] Idempotency guarantees and duplicate-request behaviour; transaction status-query endpoint and its semantics
      (especially whether "not found" is authoritative for "never received")
- [ ] Webhook/callback specification: events, signature scheme, retry policy, ordering, IP ranges
- [ ] Settlement, commission and reversal/refund reporting formats (for reconciliation)
- [ ] Sandbox credentials and test cases; production credentials; IP allow-listing requirements
- [ ] Contract, onboarding/certification steps and any regulatory approvals (see docs/SECURITY.md)

## Implementation steps once documentation arrives

1. Implement `Pay2AllAdapter` strictly from the documentation; map provider statuses to CONFIRMED/FAILED/PENDING,
   and classify errors into _not sent_ (safe to fail) vs _outcome unknown_.
2. Implement documented webhook verification; add the provider's delivery-id field; add IP allow-listing at the proxy.
3. Contract tests against the sandbox (record fixtures; no secrets in the repo).
4. Add `LIVE` to `connectorConfigSchema` behind a platform flag + per-tenant approval by a super admin.
5. Reconciliation against provider settlement reports; exception review UI.
6. Security review + pen test of the money-moving path before enabling any tenant.
