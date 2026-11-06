# Security, privacy and legal review

CSP2All has **not** undergone a regulatory, legal or security assessment. Nothing here is a claim of compliance
with RBI, NPCI, UIDAI, the DPDP Act 2023, PCI DSS or any other framework. This document lists the controls that
are implemented and the reviews still required.

## Implemented controls

| Area                        | Control                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication              | Email OTP: 6 digits, 10-min expiry, 5 attempts, resend cooldown, per-email/IP limits, keyed HMAC hash only (never plaintext; never logged or returned), bound to email+purpose, atomic single use, superseded on re-request, generic responses (no account enumeration). Admins additionally need TOTP (RFC 6238, ±1 step, replay-protected).                               |
| Sessions                    | Opaque 256-bit tokens, SHA-256 stored. Web: httpOnly, `Secure` in prod, `SameSite=Lax` (admin `Strict`), idle + absolute expiry, rotation on tenant switch / MFA. Mobile: 15-min access + single-use rotating refresh with reuse detection → session revocation. Logout and logout-all-devices; per-session revocation.                                                     |
| CSRF                        | Double-submit token + `Origin` allow-list on every cookie-authenticated unsafe request.                                                                                                                                                                                                                                                                                     |
| Authorization               | Single deny-by-default guard; routes without a policy fail closed; permissions recomputed from the membership on every request; separate admin/tenant contexts.                                                                                                                                                                                                             |
| Tenant isolation            | App-layer scoping on every query + PostgreSQL RLS (runtime role is not the owner and has `NOBYPASSRLS`) + composite tenant foreign keys. Tests cover guessed ids, nested references, search, dues, attachments, exports, jobs and direct SQL as the app role.                                                                                                               |
| Input/output                | Zod validation for every body/query (strict objects for service details), length limits, output via JSON only; React escapes output; no user HTML rendered.                                                                                                                                                                                                                 |
| Sensitive data minimisation | No Aadhaar numbers, biometrics, PINs, CVV, card data or authentication payloads are collected. Free text rejects Aadhaar-like (Verhoeff-valid) and card-like (Luhn-valid) numbers. Bank accounts: last 4 digits only. Sensitive fields are masked for users without `customers.view_sensitive`. IPs stored only as salted hashes; email logs store a hash + masked address. |
| Secrets                     | Connector credentials and TOTP secrets encrypted with AES-256-GCM using `SECRETS_ENCRYPTION_KEY` (separately managed); credentials are write-only and shown masked. Logs redact cookies, tokens, codes, credentials.                                                                                                                                                        |
| Files                       | Private bucket; magic-byte allow-list (PNG/JPEG/PDF); size limit; storage quota; quarantine until scanned (ClamAV integration via `ATTACHMENT_SCAN_DRIVER=clamav`; otherwise marked `SKIPPED`); permission check before every short-lived signed URL; downloads audited.                                                                                                    |
| Exports                     | Asynchronous; re-authorized at run time; requester-only, expiring links; CSV formula-injection neutralised.                                                                                                                                                                                                                                                                 |
| Headers                     | Helmet (CSP, frame-ancestors none, HSTS when HTTPS, nosniff, referrer policy); restricted CORS; `x-powered-by` off.                                                                                                                                                                                                                                                         |
| Rate limiting               | Per-IP API limit (Redis), OTP request/verify limits, TOTP attempt limit.                                                                                                                                                                                                                                                                                                    |
| Integrity                   | Balanced-journal and immutability triggers; append-only audit trail for sensitive operations (logins, staff/role changes, postings, reversals, closings, exports, support access, admin actions).                                                                                                                                                                           |
| Errors                      | Stable codes; no stack traces or SQL in responses; request ids for support.                                                                                                                                                                                                                                                                                                 |
| Containers                  | Non-root user, read-only root filesystem, all capabilities dropped, `no-new-privileges`; Postgres/Redis on an internal network with no published ports.                                                                                                                                                                                                                     |

## Required reviews before real payment or identity-service execution

These do **not** block the record-keeping product, but must be completed before enabling any live provider
operation (Pay2All or other):

1. Legal review of the shop's role (business correspondent / sub-agent agreements) and of CSP2All's role as a
   technology provider; terms of service, privacy notice and DPDP Act obligations (consent, notice, grievance
   officer, breach notification, data principal rights, cross-border transfer, retention).
2. Provider contract, API documentation, security requirements, certification/onboarding and any NPCI/RBI/UIDAI
   obligations the provider passes through.
3. Independent penetration test and code review of the connector and money-moving paths.
4. Incident response plan, on-call, fraud monitoring and dispute/chargeback handling procedures.
5. Key management (KMS/HSM) for credential encryption, rotation runbooks, and access reviews.
6. Data residency and backup encryption review; records-retention schedule approved by counsel.
7. Accessibility audit with real assistive technology users; Hindi copy review by a native speaker.

## Reporting vulnerabilities

Add a `security.txt` and a monitored mailbox before launch.
