# Motorcycle Showroom Management System

A production-grade management system for a motorcycle showroom that runs a 120-token, 28-month
installment scheme (Qurandazi) across two locations — **Mach** and **Quetta** — for the partners
**Irfan**, **Ghulam Muhammad** and **Hafiz Khalid**.

Everything is real: a React + TypeScript SPA talking to an Express + TypeScript REST API, persisted
in MongoDB. No mock data, no localStorage database, no hardcoded arrays, no decorative charts —
every figure on screen is aggregated from stored transactions, and every permission is enforced by
the API rather than by hiding a button.

## What it does

| Module | Capability |
| --- | --- |
| **Dashboard** | Tokens issued/assigned, active and drawn-closed customers, advance cases, confirmed draws, collections (today / month / range), operating expenses, customer advances, partner withdrawals and contributions, cash and bank balances, overdue and partial installments, recent transactions, alerts. Every card is a live aggregate. |
| **Customers & tokens** | Customer registration on a token, the fixed 120-slot register (001–120, never deleted), assignment history, duplicate-token and duplicate-CNIC handling, CNIC masking for roles without `cnic:view`. |
| **Installments & payments** | 28 fixed installments per enrollment, payment recording with receipt numbering, partial payments, unallocated credit, installment adjustments with a reason, full reversal with history. |
| **Monthly Qurandazi (draw)** | Eligible-token snapshot per scheme month, draft → confirm → correct → void, closure that stops every future installment, correction history preserved. |
| **Advance bike / advance cash** | Advance bike keeps installments running and creates no cash movement; advance cash creates exactly one outflow. Customers who win a draw later still have future installments stopped. |
| **Income & collections** | Installment collections plus other income, revenue vs non-revenue separation, per-account and per-method breakdowns. |
| **Expenses** | Operating expenses kept separate from customer advances and partner withdrawals, category and sub-category, paid-to and approval details, reversal. |
| **Partner accounts** | Withdrawals, contributions and repayments per partner with running net cash; contributions are cash inflow but **not** revenue. |
| **Cash & bank** | Cash and bank accounts, opening balances, the single cash-movement ledger, cash ↔ bank transfers (never income or expense), daily closing with counted vs system-calculated difference. |
| **Automatic lists** | Active collections, drawn & closed, advance bike, advance cash, overdue & partial, token register, Mach, Quetta, draw-eligible — all exportable. |
| **Reports & exports** | 10 reports (customers, customer statement, collections, draws, advances, expenses, partners, cash & bank, financial summary, complete archive) as on-screen print views plus Excel, PDF, CSV and JSON downloads that respect the active filters. |
| **Administration** | Users and roles, permission overrides, password resets, immutable audit log, archive export and restore history. |

Deliberately **out of scope** (per the PRD): motorcycle inventory, stock levels, supplier purchasing
and inventory valuation.

## Business rules that the code enforces

* Exactly **120 tokens**, codes 001–120; a released token keeps its history and can be re-issued.
* **28 installments** per enrollment, all at the same fixed monthly amount; total = monthly × 28.
* A **confirmed draw** stops every later installment (`Not applicable`), never marks them unpaid or
  overdue, and never deletes the payments already made.
* **Advance bike** does not stop installments. **Advance cash** produces exactly one cash outflow.
* **Partner withdrawals** are cash outflow but not operating expenses; **partner contributions** are
  cash inflow but not revenue; **transfers** are neither.
* Closing balance = opening + inflows − outflows, recomputed from the ledger.
* Corrections happen through **reversals and adjustments with a reason** — nothing financial is
  silently deleted, and every change is audited.
* All money is stored as **integer paisa**, so no floating-point rounding ever reaches a total.

Full traceability, including the test that proves each rule: [`docs/business-rules.md`](docs/business-rules.md).

## Stack

**Frontend** — React 18, TypeScript 5.7, Vite 6, Tailwind 3, shadcn/ui-style components,
React Router 6, TanStack Query 5, React Hook Form + Zod, Recharts, Lucide, Axios, Vitest +
Testing Library, ESLint 9.

**Backend** — Node 20, Express 4, TypeScript, Mongoose 8, JSON Web Tokens, RBAC with per-request
effective permissions, bcryptjs, Zod validation, exceljs, pdfkit, Jest + Supertest.

**Database** — MongoDB (Atlas in production, local replica set in development) with multi-document
transactions for every financial write.

## Quick start

Prerequisites: Node 20+, npm 10+, and a MongoDB 6+ instance started as a replica set
(`mongod --replSet rs0`) so transactions are available.

```bash
# 1. API
cd backend
npm ci
cp .env.example .env             # set JWT_SECRET, MONGODB_URI, MONGODB_DB
npm run init:tokens              # creates the 120-slot register
npm run seed                     # settings, accounts, partners, administrator
npm run dev                      # http://localhost:4000  (API + /api/health)

# 2. Web app (new terminal)
cd frontend
npm ci
cp .env.example .env.local       # VITE_API_BASE_URL can stay empty: Vite proxies /api
npm run dev                      # http://localhost:5173
```

Optional demonstration dataset (6 customers, advances, expenses, partner transactions, a transfer):

```bash
cd backend && npm run seed:demo
```

### Default accounts

| Role | Email | Password |
| --- | --- | --- |
| Owner / Administrator | `admin@showroom.local` | `` (or 
ChangeMe@123`DEFAULT_ADMIN_PASSWORD`) |
| Accountant | `accountant@showroom.local` | `Account@12345` |
| Customer-service staff | `staff@showroom.local` | `Staff@12345` |
| Draw manager | `draw@showroom.local` | `Draw@12345` |
| Read-only viewer | `viewer@showroom.local` | `Viewer@12345` |

Change every one of these immediately after the first login. Only the administrator is created when
`SEED_DEFAULT_ADMIN=true` on a fresh database; the other four come from the seed script.

## Scripts

| App | Command | Purpose |
| --- | --- | --- |
| backend | `npm run dev` | API with reload (ts-node-dev) |
| backend | `npm run build` / `npm start` | compile to `dist/` / run the compiled server |
| backend | `npm run typecheck` | `tsc --noEmit` |
| backend | `npm test` / `test:unit` / `test:integration` / `test:e2e` | Jest suites (real transactions) |
| backend | `npm run seed` / `seed:demo` | base configuration / demonstration data |
| backend | `npm run init:tokens` | ensure the 120 token slots exist |
| backend | `npm run import:csv` | validated historical migration (supports `--dry-run`) |
| backend | `npm run archive:export` | write a full archive to disk |
| frontend | `npm run dev` | Vite dev server with `/api` proxy |
| frontend | `npm run build` / `npm run preview` | production build / serve it locally |
| frontend | `npm run typecheck` / `npm run lint` / `npm test` | `tsc`, ESLint, Vitest |

## Repository layout

```
motorcycle-showroom-management/
├── backend/                 Express + TypeScript API
│   ├── src/constants/       scheme constants and the permission catalogue
│   ├── src/models/          22 Mongoose collections and their indexes
│   ├── src/services/        business rules, transactions, ledgers
│   ├── src/controllers/     thin request handlers
│   ├── src/routes/          URL → permission → validator → controller
│   ├── src/reports/         report builders and xlsx / pdf / csv / json renderers
│   ├── src/middleware/      auth, permissions, validation, errors, rate limits
│   ├── src/scripts/         seed, token init, CSV import, archive export
│   └── src/tests/           unit, integration and end-to-end acceptance suites
├── frontend/                React + TypeScript SPA
│   ├── src/pages/           21 screens (dashboard → admin)
│   ├── src/hooks/useApi.ts  one TanStack Query hook per endpoint
│   ├── src/lib/             API client, types, permissions, formatting helpers
│   ├── src/components/      UI kit, shared components, layout guards
│   └── src/tests/           Vitest suites and live-shaped fixtures
├── deployment/              compose stack, Dockerfiles, nginx, PM2, systemd, guide
└── docs/                    architecture, business rules, data model, API, testing report
```

## Documentation

* [`docs/architecture.md`](docs/architecture.md) — layers, request lifecycle, money handling,
  transaction strategy, audit design.
* [`docs/business-rules.md`](docs/business-rules.md) — the 16 non-negotiable rules, PRD module
  traceability, role/permission matrix.
* [`docs/data-model.md`](docs/data-model.md) — collections, key fields and the indexes that enforce
  the rules.
* [`docs/api-reference.md`](docs/api-reference.md) — all 76 endpoints with permissions and validators.
* [`docs/testing-report.md`](docs/testing-report.md) — how to run everything, results, scenario
  coverage, defects found and fixed, known limitations.
* [`deployment/README.md`](deployment/README.md) — Atlas + managed Node + Vercel, Docker Compose and
  bare-VPS options, environment reference, backup and restore, post-deploy checklist.

## Test status

| Check | Result |
| --- | --- |
| Backend | **11 suites / 202 tests passed** — unit, integration and the 18 PRD acceptance scenarios, run against a real MongoDB replica set with transactions enabled |
| Backend types & build | `tsc --noEmit` clean · `dist/` builds · compiled server boots and serves `/api/health` |
| Frontend | **6 suites / 32 tests passed** (Vitest + Testing Library) |
| Frontend types, lint, build | `tsc --noEmit` clean · ESLint 0 errors / 6 warnings · `dist/` builds |

## Security

* Passwords hashed with bcrypt (`BCRYPT_ROUNDS`, default 10–12); plaintext is never stored or logged.
* JWT access tokens (12h) plus refresh tokens (30d); `/api/auth/me` returns the effective permission
  set the UI renders against.
* Permissions are checked in Express middleware on every route — 5 roles, 38 permissions, with
  per-user grants and denials.
* CNIC values are masked unless the caller holds `cnic:view`; financial exports need `report:export`.
* Zod validation on every body/query/param; helmet, CORS allow-list, rate limiting (stricter for
  auth and exports); audit log records actor, role, IP and user agent.
* `.env` files are git-ignored; `.env.example` documents every variable.

## License

Proprietary — prepared for the showroom owners. Replace this section if you intend to publish it.
