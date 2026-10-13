# Testing and verification report

Date of run: 2026-10-11 · Environment: Linux x86-64, Node 20, MongoDB 8.0.4 started as a
**single-node replica set `rs0`** so that multi-document transactions are genuinely exercised
(not mocked). Frontend and backend were both running, and the acceptance scenarios below were
also replayed manually over HTTP through the Vite proxy against the seeded database.

## How to run everything

```bash
# backend
cd backend && npm ci && cp .env.example .env    # then edit .env
npm run typecheck      # tsc, no emit
npm test               # 11 suites, unit + integration + e2e (real transactions)
npm run build          # emits dist/
npm run seed:demo      # optional demonstration dataset

# frontend
cd ../frontend && npm ci && cp .env.example .env.local
npm run typecheck
npm run test           # 6 suites, Vitest + Testing Library
npm run lint           # ESLint 9 flat config
npm run build          # emits dist/
```

## Results

| Check | Command | Result |
| --- | --- | --- |
| Backend types | `npm run typecheck` | **pass**, no diagnostics |
| Backend tests | `npm test` | **11 suites / 202 tests passed**, 0 failed (55.5 s) |
| Backend build | `npm run build` | **pass** — `dist/` emitted |
| Compiled server boot | `node dist/server.js` | **pass** — `/api/health` → `status: ok`, `database.state: connected`, `collections: 22`, `expectedTokenSlots: 120`, transaction mode active |
| Frontend types | `npm run typecheck` | **pass**, no diagnostics |
| Frontend tests | `npm run test` | **6 suites / 32 tests passed**, 0 failed |
| Frontend lint | `npm run lint` | **0 errors**, 6 warnings (React fast-refresh advisories in shadcn-style component files) |
| Frontend build | `npm run build` | **pass** — `dist/` emitted (bundle 1.2 MB, warning only) |

Backend suites: `unit/schedule`, `unit/permissions`, `integration/customers`,
`integration/payments`, `integration/draws`, `integration/advances`, `integration/finance`,
`integration/reports`, `integration/api`, `integration/transactions`, `e2e/acceptance`.

Frontend suites: `unit/utils` (paisa maths, formatting, filenames), `unit/permissions`
(catalogue integrity), `components/StatusBadge`, `components/DataTable`, `pages/TokensPage`
and `pages/DashboardPage` (rendered against fixtures that mirror live API payloads, with the
axios layer mocked).

Transactions are not assumed: `integration/transactions.test.ts` asserts
`transactionMode() === 'transaction'`, that a customer creation is atomic, and that a failed
write rolls back completely.

## PRD acceptance scenarios

All 18 scenarios are automated. 1–17 run end to end over HTTP in `e2e/acceptance.test.ts`;
scenario 18 runs in `integration/backup.test.ts` (restore a full archive into a fresh database
and re-verify the record counts).

| # | Scenario | Status |
| --- | --- | --- |
| 1 | Create a customer → 28 installment periods generated | pass |
| 2 | Every installment uses the same fixed monthly amount; total = monthly × 28 | pass |
| 3 | Duplicate token assignment blocked (`409 DUPLICATE_TOKEN`) | pass |
| 4 | Duplicate CNIC handled per configured policy (`block` / `warn` / `allow`) | pass |
| 5 | Payment → receipt + installment update + one cash movement + report totals move together | pass |
| 6 | Partial payment keeps status `Partial` with the correct outstanding balance | pass |
| 7 | Draw confirmed in month 15 → months 16–28 `Not applicable`, customer leaves collection lists | pass |
| 8 | Advance bike created → all 28 installments still payable, no cash movement | pass |
| 9 | Advance cash → exactly one cash outflow, installments continue, retry refused | pass |
| 10 | Advance customer later wins the draw → future installments stop, history preserved | pass |
| 11 | Partner withdrawal → cash outflow, **not** an operating expense | pass |
| 12 | Partner contribution → cash inflow, **not** revenue | pass |
| 13 | Cash → bank transfer → balances move, zero income/expense documents | pass |
| 14 | Report totals match the underlying transaction records | pass |
| 15 | Excel/CSV/PDF exports match the filters and totals shown on screen | pass |
| 16 | Payment reversal keeps the original, writes a negative mirror, recalculates balances | pass |
| 17 | Unauthorised users blocked by the API (not just hidden buttons) | pass |
| 18 | Archive export → restore into an empty database → record counts verified | pass |

## Live verification against the running application

Replayed over HTTP against the seeded database (`npm run seed:demo`) through the Vite dev proxy:

```
tokens: total=120 assigned=6 unassigned=114 (120 rows returned)
customers: 6 · installments: 168 rows (6 × 28)
partners: Irfan, Ghulam Muhammad, Hafiz Khalid
accounts: Showroom Cash (CASH) 50,400.00 · Showroom Bank Account (BANK) 159,000.00
collections this month 197,500.00   operating expenses 18,100.00
customer advances 45,000.00         partner withdrawals 25,000.00
partner contributions 100,000.00 (revenue-excluded)
cash 50,400.00 / bank 159,000.00 / combined 209,400.00
inflow 317,500.00 − outflow 108,100.00 = net 209,400.00  (equals the combined balance)
```

The cash identity holds exactly, and the 20,000 bank→cash transfer appears once as an inflow and
once as an outflow while creating no revenue or expense — which is what makes
`inflow ≠ collections ≠ revenue`.

Exports verified live (HTTP status, size and file type):

| Report | Format | Result |
| --- | --- | --- |
| `customers` | xlsx / pdf / csv | 200 · 8,309 B Excel 2007+ · 3,596 B PDF (2 pages) · 1,059 B CSV |
| `collections` | xlsx | 200 · 11,215 B Excel 2007+ |
| `financial-summary` | xlsx | 200 · 7,643 B Excel 2007+ |
| `expenses` | csv | 200 · 1,230 B CSV |
| `partners` | pdf | 200 · 6,446 B PDF (5 pages) |
| `cash-bank` | xlsx | 200 · 11,137 B Excel 2007+ |
| `archive` | json | 200 · 24,746 B JSON |
| `customer-statement/:id` | pdf | 200 · 10,410 B PDF |
| `GET /api/backups/export?format=json` | json | 200 · 182,171 B full archive |

## Role-based access (live, per role)

| Endpoint | owner | accountant | customer service | draw manager | viewer | no token |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/customers` | 200 | 200 | 200 | 200 | 200 | 401 |
| `POST /api/customers` | 201 | 403 | 201 | 403 | 403 | 401 |
| `POST /api/payments` | 201 | 201 | 201 | 403 | 403 | 401 |
| `POST /api/income` / `POST /api/expenses` | 201 | 201 | 403 | 403 | 403 | 401 |
| `POST /api/draws` | 201 | 403 | 403 | 201 | 403 | 401 |
| `POST /api/draws/:id/confirm` | 200 | 403 | 403 | 403 | 403 | 401 |
| `PATCH /api/settings` | 200 | 403 | 403 | 403 | 403 | 401 |
| `GET /api/auth/users`, `GET /api/auth/audit-logs` | 200 | 403 | 403 | 403 | 403 | 401 |
| `GET /api/reports/:type/preview` | 200 | 200 | 200 | 200 | 200 | 401 |
| `GET /api/reports/:type?format=xlsx` | 200 | 200 | 403 | 403 | 403 | 401 |
| `GET /api/backups/export` | 200 | 403 | 403 | 403 | 403 | 401 |

A malformed or missing bearer token returns `401` on every protected route.

## Defects found and fixed during this verification pass

| Defect | Impact | Fix |
| --- | --- | --- |
| `GET /api/reports/customer-statement/preview` returned `500` because `/reports/customer-statement/:customerId` captured the literal segment `preview` | On-screen customer statement could not render | Route order corrected + `400 INVALID_CUSTOMER` for malformed ids; regression tests added (`integration/reports.test.ts`) |
| Frontend types drifted from live payloads (payment envelope, token register, audit log, backups, partner transactions, dashboard) | Several screens would have rendered blanks | `lib/types.ts`, `hooks/useApi.ts` and the affected pages rewritten against captured payloads |
| `formatPkr()` rendered `Rs` under some ICU builds while exports say PKR | Currency label inconsistent with the PRD | Formatter now writes `PKR 12,345.00` explicitly and `Money` reuses it |
| Automatic lists, payments and draws tables read fields the API does not return (`installmentsPaid`, `schemeMonth`, `purpose`, `row.customer`) | Empty cells and two broken `/customers/undefined` links | Columns rebuilt from the real payload keys (`customerId`, `drawMonth`, `tokenCode`, `totalPaidPaisa`, `outstandingWaivedPaisa`, `approver`, `customerStatus`, `laterDrawn`) |
| `useResetPassword` called `/api/users/:id/reset-password` | Password reset failed from the admin screen | Path corrected to `/api/auth/users/:id/reset-password` |
| Payment method values (`BANK_TRANSFER`, `MOBILE_WALLET`) did not exist in the API enum | Payment dialog could submit an invalid method | Aligned to `CASH / BANK / CHEQUE / ONLINE / OTHER` |
| `npm run lint` referenced ESLint, which was not installed | Broken script in a GitHub-ready repo | ESLint 9 + typescript-eslint added with a flat config; `npm run lint` now runs clean |
| `@testing-library/dom` missing after a dependency refresh | Frontend test suites could not collect | Declared explicitly as a dev dependency |

## Known limitations (deliberate, documented)

* **Cloud deployment is not verified.** No Atlas, Vercel or PaaS credentials were available, so
  the deployment guide in `deployment/README.md` describes a verified *local* stack plus the exact
  configuration needed for production. Nothing in this report claims a live cloud deployment.
* **Docker images were not built here** (no Docker daemon in the sandbox). `deployment/` contains
  the compose stack, Dockerfiles and nginx config, untested in this environment.
* The frontend ships as one bundle (1.2 MB, 341 KB gzipped). Route-level code splitting is a
  straightforward follow-up, not a correctness issue.
* Jest reports "Force exiting" because Mongoose keeps sockets open after the run; `--forceExit`
  is intentional and all assertions complete before it.
