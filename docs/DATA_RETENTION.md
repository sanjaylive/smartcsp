# Data retention and deletion

Retention settings live in the `dataRetention` platform setting (Admin → Settings). Defaults are placeholders
that **must be confirmed by legal counsel** for your jurisdiction and contracts.

| Data                                             | Default                             | Mechanism                                                                    |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| OTP challenges                                   | 7 days                              | `cleanup` job deletes                                                        |
| Revoked/expired sessions                         | 30 days after revocation/expiry     | `cleanup` job deletes (refresh tokens cascade)                               |
| Idempotency records                              | 24 hours                            | `cleanup` job deletes expired keys                                           |
| Dispatched outbox events                         | 7 days                              | `cleanup` job deletes                                                        |
| Export files                                     | 24 hours                            | `cleanup` job deletes the object and marks the job `EXPIRED`                 |
| Audit events                                     | 7 years (2,555 days)                | append-only; archive/purge only via a reviewed runbook                       |
| Records, ledger, collections, expenses, closings | Life of the shop + statutory period | never deleted by the application; corrections are reversals                  |
| Customers                                        | Life of the shop                    | archived, not deleted; contact details can be cleared on request (see below) |
| Attachments                                      | Life of the owning record           | soft-deleted on request; physical purge via runbook                          |
| Suspended/pending-deletion shops                 | 180 days before purge               | admin `deletion-request` → retention window → purge runbook                  |

## Tenant deletion (explicit, controlled)

1. Super admin opens _Tenant → Request deletion_, gives a reason and types the shop name to confirm. The shop
   moves to `PENDING_DELETION` (all access blocked; audited).
2. During the retention window the owner may request an export through support, and the request can be cancelled
   (status back to `SUSPENDED` then `ACTIVE`).
3. After the window, an operator runs the purge runbook against a verified backup: delete object-storage prefix
   `tenants/<tenantId>/`, then delete the tenant's rows in dependency order **as the owner role**, keeping
   anonymised audit events required by law. Record the purge in the platform audit log.

## Individual data requests (DPDP-style)

Customer contact data can be corrected or cleared by the shop (customers.manage + view_sensitive). Requests that
would require deleting financial history must be reviewed by counsel; the default response is to anonymise the
customer (name → "Deleted customer", clear phone/email/notes) while retaining transaction records.
