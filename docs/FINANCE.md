# Bookkeeping model and posting rules

CSP2All keeps a **double-entry journal per shop**. Every money movement the shop explicitly records becomes one
balanced journal entry; balances are always _derived_ from posted lines, never stored. Implementation:
`apps/api/src/modules/ledger/ledger.service.ts` (posting engine) and `apps/api/src/modules/records/posting.ts`
(record rules, unit-tested in `test/unit/posting.test.ts`).

## Principles

| Rule                                 | How it is enforced                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Money is exact                       | Integer paise everywhere (`BigInt` in Postgres, safe integers in JSON, `*Paise` field names). No floats.                                                                                                                                                                                               |
| Every entry balances                 | App check before insert **and** a deferred Postgres constraint trigger that rejects any transaction leaving an entry unbalanced or with < 2 lines.                                                                                                                                                     |
| Posted history is immutable          | `journal_lines` and `audit_events` reject UPDATE/DELETE (trigger + revoked privileges for the app role). A journal entry may only gain its one-time `reversedByEntryId` link.                                                                                                                          |
| Corrections are compensating entries | Reversal = a new entry mirroring every line (debits↔credits), linked both ways.                                                                                                                                                                                                                        |
| No duplicate posting                 | Each posting has a `postingKey` unique per tenant (e.g. `record:<id>:<seq>`, `collection:<id>`), checked in-app and by a unique index. Concurrent "post" requests produce exactly one entry (tested).                                                                                                  |
| Status ≠ money                       | Changing a record's status never posts anything. Cash moves only when the operator explicitly records it (`post: true`, a collection, an expense, …). Marking a _posted_ record FAILED/CANCELLED requires an explicit choice to reverse its entries (`reversePosting`), otherwise the API answers 409. |
| Closed days are frozen               | Posting into a CLOSED (or reopen-requested) business date is rejected in-app and by a Postgres trigger (`DAY_CLOSED`).                                                                                                                                                                                 |
| Principal is not income              | Transaction principal only moves between cash/bank and the provider wallet. Income = customer fees + commission (accrued).                                                                                                                                                                             |

## Chart of accounts (created for every shop)

| Code | Key                   | Account                            | Type    | Meaning                                                            |
| ---- | --------------------- | ---------------------------------- | ------- | ------------------------------------------------------------------ |
| 1000 | CASH                  | Cash in hand                       | Asset   | Physical cash at the counter                                       |
| 1010 | BANK                  | Bank / UPI                         | Asset   | Shop's bank account (UPI and transfers land here)                  |
| 1020 | FLOAT                 | Provider wallet (float)            | Asset   | Balance held with the external provider (AEPS/DMT/recharge wallet) |
| 1100 | RECEIVABLE            | Customer dues receivable           | Asset   | Money customers still owe the shop                                 |
| 1200 | COMMISSION_RECEIVABLE | Commission receivable (expected)   | Asset   | Commission earned but not yet received — **pending, not cash**     |
| 3000 | CAPITAL               | Owner's capital / opening balances | Equity  | Opening balances — **capital, not income**                         |
| 4000 | FEE_INCOME            | Customer fee income                | Income  | The shop's own service charges                                     |
| 4100 | COMMISSION_INCOME     | Commission income                  | Income  | Commission accrued from providers                                  |
| 5000 | EXPENSES              | Shop expenses                      | Expense | Rent, internet, salary, …                                          |
| 5900 | CASH_OVER_SHORT       | Cash over / short                  | Expense | Adjustments and daily-close counting differences                   |

Debit-normal: assets and expenses. Credit-normal: equity and income.

## Record posting rule

Each service declares a **principal direction** (`packages/shared/src/services.ts`):

- **PAYOUT** — shop hands the principal to the customer; the provider credits the shop's wallet (AEPS / MicroATM cash withdrawal).
- **COLLECT** — shop takes the principal from the customer and pays the provider from its wallet (DMT, recharge, bill payment, government fees for PAN/document services, AEPS cash deposit).
- **NONE** — no principal (balance enquiry, mini statement, Aadhaar records, account opening).

With P = principal, F = customer fee, C = amount collected now (method M), E = expected commission:

- Amount owed by the customer: **R = P + F** for COLLECT, **R = F** otherwise. Due **D = R − C** (C ≤ R).

| Line          | PAYOUT                                              | COLLECT         | NONE            |
| ------------- | --------------------------------------------------- | --------------- | --------------- |
| Principal     | Dr FLOAT P · Cr CASH/BANK P                         | Cr FLOAT P      | —               |
| Collected now | Dr CASH/BANK C                                      | Dr CASH/BANK C  | Dr CASH/BANK C  |
| Still due     | Dr RECEIVABLE D                                     | Dr RECEIVABLE D | Dr RECEIVABLE D |
| Fee           | Cr FEE_INCOME F                                     | Cr FEE_INCOME F | Cr FEE_INCOME F |
| Commission    | Dr COMMISSION_RECEIVABLE E · Cr COMMISSION_INCOME E | same            | same            |

If every amount is zero the record has no cash effect (`postingStatus = NOT_REQUIRED`). Records are dated by
`txnDate`; their entries post to that business date. Corrections (reversals) are dated **today** so a closed day
is never altered.

## Worked examples (₹ shown; stored as paise)

### 1. AEPS cash payout — customer withdraws ₹5,000; shop charges ₹10; expects ₹12.50 commission

| Account               |       Dr |       Cr |
| --------------------- | -------: | -------: |
| Provider wallet       | 5,000.00 |          |
| Cash in hand          |          | 5,000.00 |
| Cash in hand (fee)    |    10.00 |          |
| Customer fee income   |          |    10.00 |
| Commission receivable |    12.50 |          |
| Commission income     |          |    12.50 |

Cash in hand falls by ₹4,990 (the counter hands over ₹4,990 net when the fee is deducted). Income: ₹10 fee +
₹12.50 accrued commission. The ₹5,000 is **not** income.

### 2. DMT cash collection — ₹3,000 transfer, ₹30 fee, customer pays ₹3,030 in cash

| Account             |       Dr |       Cr |
| ------------------- | -------: | -------: |
| Cash in hand        | 3,030.00 |          |
| Provider wallet     |          | 3,000.00 |
| Customer fee income |          |    30.00 |

### 3. Customer fee collection only (e.g. photocopy custom service, ₹20 via UPI)

Dr Bank/UPI 20.00 · Cr Customer fee income 20.00

### 4. Commission accrual and receipt

Accrual happens when the record is posted (example 1: Dr Commission receivable 12.50 / Cr Commission income 12.50).
When the provider later credits ₹12.50 to the wallet (`POST /v1/commissions/receipts`, allocated to the record):

| Account               |    Dr |    Cr |
| --------------------- | ----: | ----: |
| Provider wallet       | 12.50 |       |
| Commission receivable |       | 12.50 |

Unallocated extra commission (e.g. a provider bonus) is credited straight to Commission income. Reports show
**pending commission** (receivable balance) separately from **received** commission.

### 5. Partial due collection — bill of ₹1,450 + ₹15 fee; customer pays ₹1,000 now, ₹200 later

Posting the record: Dr Cash 1,000.00 · Dr Customer dues 465.00 · Cr Provider wallet 1,450.00 · Cr Fee income 15.00.
Later collection (`POST /v1/collections`, allocated to the record): Dr Cash 200.00 · Cr Customer dues 200.00 →
record due ₹265, payment status PARTIAL. Collections lock the records (`SELECT … FOR UPDATE`) so concurrent
collections can never exceed the due (tested). A collection can be reversed (compensating entry; dues restored).

### 6. Expense — internet bill ₹599 paid from bank

Dr Shop expenses 599.00 · Cr Bank/UPI 599.00. Reversal posts the mirror entry and marks the expense reversed.

### 7. Failed transaction correction — the DMT in example 2 is later reported failed by the bank

`POST /v1/records/:id/transitions {to: 'FAILED', reason, reversePosting: true}` posts the mirror of example 2
dated today (Dr Provider wallet 3,000 · Dr Fee income 30 · Cr Cash 3,030), i.e. the provider refunds the wallet
and the shop refunds the customer. The original entry stays visible, linked to its reversal. If collections were
allocated to the record, those are reversed first (the API refuses otherwise). To fix wrong amounts on a
successful record: reverse → edit amounts → post again (three linked entries, full history).

### 8. Daily close — expected cash ₹20,000, counted ₹19,995

Expected cash = opening cash (all days before) + cash in − cash out for the date. The ₹5 shortage posts
Dr Cash over/short 5.00 · Cr Cash in hand 5.00 and the day becomes CLOSED; further postings to that date are
rejected. Reopening needs a reason and approval by someone with `day.reopen` (owners auto-approve their own
request; everything is audited). Reopening reverses the variance entry; re-closing recomputes it
(`closeCount` increments).

### Opening balances, adjustments and transfers

- Opening cash ₹25,000: Dr Cash 25,000 · Cr Owner's capital 25,000 (capital, never daily income).
- Adjustment (with mandatory reason): Dr/Cr the fund account against Cash over/short.
- Transfer (e.g. depositing cash to bank, topping up the provider wallet from bank): Dr destination · Cr source.
  These manual entries can be reversed with `POST /v1/journal/:id/reverse` (reason required).

## Reports and their meaning

- **Dashboard** (tenant timezone, "today"): every metric carries its date range and a plain-language meaning.
  Service volume = transaction value processed, explicitly _not income_.
- **Summary** (`/v1/reports/summary`): income (fees + commission accrued − expenses − cash shortage), commission
  accrued vs received vs pending, fund in/out and closing balances, dues outstanding at period end, opening capital.
- **Trial balance / Day book** (advanced reports plan feature): verifies debits = credits and lists every entry.
- **Exports**: ledger, records, dues, expenses, customers as CSV (exact decimal rupees, formula-injection safe).
