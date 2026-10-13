# Business rules and PRD traceability

Every non-negotiable rule from the PRD, where it is enforced, and the test that proves it.

## The 16 non-negotiable rules

| # | Rule | Enforcement | Proof |
| --- | --- | --- | --- |
| 1 | Exactly 120 tokens, codes 001–120, never deleted | `Token` collection is seeded/ensured to 120 rows; `initTokens()` only creates missing slots; releasing a token appends to `history[]` instead of deleting | `integration/customers.test.ts`, `POST /api/tokens/init` returns `{ total: 120 }` |
| 2 | 28-month fixed schedule per enrollment | `buildSchedule()` in `services/schedule.service.ts` + `SCHEME.INSTALLMENT_MONTHS = 28` | `unit/schedule.test.ts`, e2e scenarios 1–2 |
| 3 | All 28 installments use the same fixed monthly amount | `splitEvenly(monthlyInstallmentPaisa * 28, 28)` — the total always equals monthly × 28 | `unit/schedule.test.ts` ("sums exactly"), e2e scenario 2 |
| 4 | One token per customer; duplicates blocked | Partial unique index `{ tokenNumber, schemeCode }` on `SchemeEnrollment` + conditional `claimToken()` update; Mongo error 11000 → `409 DUPLICATE_TOKEN` | e2e scenario 3 |
| 5 | Duplicate CNIC handled by policy | `duplicateCnicPolicy: block \| warn \| allow` in `Settings`; `block` → `409 DUPLICATE_CNIC`, `warn` requires `acknowledgeDuplicateCnic` | e2e scenario 4 |
| 6 | A confirmed draw stops all future installments | `confirmDraw()` sets every installment from the draw month onward to `not_applicable` with `stoppedAfterDraw: true`, `outstandingPaisa: 0` — never `unpaid`/`overdue` | e2e scenario 7, `integration/draws.test.ts` |
| 7 | Advance bike does **not** stop installments | `createAdvance({type:'BIKE'})` writes no cash movement and `stopsInstallments: false`; all 28 stay payable | e2e scenario 8 |
| 8 | Advance cash creates exactly one cash outflow | `ExpenseTransaction` (category `CUSTOMER_ADVANCE_CASH`, `isOperatingExpense: false`) + one OUT `CashMovement`; retry hits `DUPLICATE_MOVEMENT` | e2e scenario 9 |
| 9 | Advance customer who later wins the draw | Closure still stops future installments; the advance and its outflow stay in history | e2e scenario 10 |
| 10 | Historical payments/draws survive closure | Closure never edits `Payment`, `Receipt`, `CashMovement` or `DrawEvent`; only future `Installment` rows change | e2e scenarios 7 & 10 |
| 11 | Partner withdrawals are cash outflow, **not** operating expense | `PartnerTransaction{type:'WITHDRAWAL'}` → OUT movement, `isOperatingExpense` never set; dashboards and reports sum operating expenses from `ExpenseTransaction` with `isOperatingExpense: true` | e2e scenario 11 |
| 12 | Partner contributions are not revenue | `IncomeTransaction{ category: 'PARTNER_CONTRIBUTION', isRevenue: false }` — counted in cash inflow, excluded from revenue | e2e scenario 12 |
| 13 | Cash ↔ bank transfers are neither income nor expense | `createTransfer()` writes two `CashMovement`s (OUT + IN) and a `Transfer`; no income/expense documents | e2e scenario 13 |
| 14 | One financial transaction never duplicates a cash movement | Unique index `uniq_movement_per_source { sourceType, sourceRef, account, direction }` + `recordMovement()` | `integration/transactions.test.ts`, e2e scenario 9 |
| 15 | Corrections via reversal/adjustment with audit history | `reversePayment()`, `reverseExpense()`, `adjustInstallment()` keep the original, write a negative mirror or adjustment, require a reason, and log `REVERSAL`/`ADJUSTMENT` audit entries | e2e scenario 16, `integration/payments.test.ts` |
| 16 | Reports and exports reconcile with source records | Report builders aggregate the same collections the screens read; totals are asserted against the documents | e2e scenarios 14–15, `integration/reports.test.ts` |

Additional invariants that fall out of the same code paths:

* **Closing balance** = opening + inflows − outflows. `createReconciliation()` stores
  `systemCalculatedPaisa` and `differencePaisa` so a counted cash figure that disagrees with the
  ledger is visible, never hidden.
* **Total revenue ≠ collections ≠ total cash inflow.** Revenue excludes partner contributions and
  transfers; collections exclude non-installment income; cash inflow includes both plus opening
  balances. Each is computed separately and labelled as such on the dashboard.
* **Overpayment never silently rolls over.** Unallocated amounts become an explicit customer credit
  (`allowCredit`) that must be allocated through `POST /api/payments/allocate-credit`.
* **CNIC masking** — `GET /api/customers` masks the CNIC unless the caller holds `customer:view-cnic`;
  the same check applies to statements and exports.
* **PKR everywhere**, locations `MACH` / `QUETTA`, partners Irfan, Ghulam Muhammad and Hafiz Khalid
  with no ownership percentages stored.

## PRD modules → implementation

| PRD module | Where it lives |
| --- | --- |
| A. Dashboard | `services/dashboard.service.ts`, `pages/Dashboard.tsx` (summary, collections, expenses, cash position) |
| B. Customers & token register | `services/customer.service.ts`, `services/token.service.ts`, `pages/customers/*`, `pages/Tokens.tsx` |
| C. Installments & payments | `services/payment.service.ts`, `services/installment.service.ts`, `pages/Installments.tsx`, `pages/Payments.tsx` |
| D. Monthly Qurandazi / draw | `services/draw.service.ts`, `pages/draws/Draws.tsx` |
| E. Advance bike / advance cash | `services/advance.service.ts`, `pages/advances/Advances.tsx` |
| F. Income & collections | `services/finance.service.ts`, `pages/Income.tsx` |
| G. Expenses | `services/finance.service.ts`, `pages/Expenses.tsx` |
| H. Partner accounts | `services/finance.service.ts` (partner ledger), `pages/Partners.tsx` |
| I. Cash & bank | `services/finance.service.ts` (accounts, transfers, reconciliation), `pages/finance/CashBank.tsx` |
| J. Automatic lists | `services/list.service.ts`, `pages/AutomaticLists.tsx` |
| K. Reports, print and exports | `reports/builders.ts`, `reports/exporters.ts`, `pages/reports/Reports.tsx` |

## Roles and permissions

Five roles (`owner`, `accountant`, `customer_service`, `draw_manager`, `viewer`) map to 38 permission
strings in `backend/src/constants/permissions.ts`. The frontend ships the identical constant table
(`frontend/src/lib/permissions.ts`) purely to decide what to render; the effective set always comes
from `GET /api/auth/me`. Verified live against a running server:

| Endpoint (method) | owner | accountant | customer service | draw manager | viewer |
| --- | --- | --- | --- | --- | --- |
| `GET /api/customers` | 200 | 200 | 200 | 200 | 200 |
| `POST /api/customers` | 201 | 403 | 201 | 403 | 403 |
| `POST /api/payments` | 201 | 201 | 201 | 403 | 403 |
| `POST /api/income`, `POST /api/expenses` | 201 | 201 | 403 | 403 | 403 |
| `POST /api/transfers` | 201 | 201 | 403 | 403 | 403 |
| `POST /api/draws` | 201 | 403 | 403 | 201 | 403 |
| `POST /api/draws/:id/confirm` | 200 | 403 | 403 | 403 | 403 |
| `PATCH /api/settings`, `GET /api/auth/users`, `GET /api/auth/audit-logs` | 200 | 403 | 403 | 403 | 403 |
| `GET /api/reports/:type/preview` | 200 | 200 | 200 | 200 | 200 |
| `GET /api/reports/:type?format=xlsx` (export) | 200 | 200 | 403 | 403 | 403 |
| `GET /api/backups/export` | 200 | 403 | 403 | 403 | 403 |
| Any endpoint without a bearer token | 401 | 401 | 401 | 401 | 401 |

Draw confirmation is `owner`-only; the draw manager can record and correct draws but cannot confirm
a closure. Financial exports need `report:export`, which `customer_service`, `draw_manager` and
`viewer` do not hold.
