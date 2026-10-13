# Architecture

Two independent applications that share nothing but an HTTP contract.

```
motorcycle-showroom-management/
├── backend/    Node.js 20 · Express 4 · TypeScript · Mongoose 8 · Jest + Supertest
└── frontend/   React 18 · TypeScript · Vite 6 · Tailwind 3 · shadcn/ui · TanStack Query · Vitest
```

The browser never talks to MongoDB. Every read and write goes through the REST API, which
authenticates, authorises, validates and persists. The frontend keeps no financial data of
its own — no localStorage database, no hardcoded arrays, no mock fixtures in production code.

## Backend layering

| Layer | Location | Responsibility |
| --- | --- | --- |
| HTTP | `src/app.ts`, `src/server.ts` | Express app, helmet, CORS, rate limits, request logging, JSON envelope, error handler |
| Routes | `src/routes/index.ts`, `src/routes/auth.routes.ts` | URL → permission → validator → controller. Nothing else |
| Validation | `src/validators/index.ts` | Zod schemas for every body, query and param set |
| Controllers | `src/controllers/*.ts` | Thin: read the request, call a service, serialise the result |
| Services | `src/services/*.ts` | All business rules, transactions, uniqueness checks, audit writes |
| Models | `src/models/*.ts` | Mongoose schemas, indexes, virtual-free plain fields |
| Utils | `src/utils/*.ts` | `money` (paisa maths), `serialize`, `dates`, `ApiError`, `http`, `audit` helpers |
| Reports | `src/reports/*.ts` | Report builders → `ReportBundle` → xlsx / pdf / csv / json renderers |

### Request lifecycle

1. `requireAuth` verifies the JWT (`signAccessToken` payload: `_id`, `email`, `role`), loads the
   user and computes `effectivePermissions()` = role permissions **+** `extraPermissions` **−**
   `deniedPermissions`.
2. `requirePermission(PERMISSIONS.X)` compares against that computed set → `403` if missing.
   Hiding a button in the UI can never be the only protection: the same check runs server-side.
3. `validate(schema, 'body' | 'query')` rejects malformed input with `422` and field-level details.
4. The controller calls a service. Services wrap multi-document writes in `withTransaction()`.
5. Responses use one envelope: `{ success: true, message?, data }` or
   `{ success: false, error: { code, message, details? } }`.

### Money

All amounts are stored as **integer paisa** (`1 PKR = 100 paisa`). Nothing in the system performs
floating-point arithmetic on money:

* `pkrToPaisa()` converts user input (string or number) to integer paisa and throws on garbage.
* `splitEvenly(totalPaisa, months)` distributes a total with no drift: 28 installments always sum
  to exactly the scheme total (the remainder paisa go to the earliest months).
* `serializeMoney()` adds `*Pkr` and `*Formatted` mirrors next to every `*Paisa` field so the UI
  and exports format instead of compute.
* The frontend formats with `formatPkr()` (`PKR 12,345.00`) and never re-derives totals.

### Transactions and consistency

`withTransaction()` runs a callback inside a MongoDB session when the deployment supports it
(replica set or Atlas) and falls back to a documented sequential mode on a standalone `mongod`.
`transactionMode()` reports which one is active; `/api/health` exposes it, and the integration
suite asserts it is `transaction` when the tests run.

What is atomic:

* **Customer creation** — customer + enrollment + 28 installments + token claim + audit entry.
* **Payment** — payment + receipt + cash movement + income row + installment allocation + audit,
  guarded by an `idempotencyKey` so a double-click cannot post twice.
* **Draw confirmation** — draw status + closure record + all future installments set to
  `not_applicable` + customer status `drawn_closed`.
* **Advance cash** — advance + expense row + exactly one OUT cash movement, protected by the
  unique index `uniq_movement_per_source { sourceType, sourceRef, account, direction }`.
* **Transfers** — OUT from the source account and IN to the destination in the same transaction.
* **Reversals** — original flagged `reversed`, negative mirror written, balances recomputed.

Account balances are recomputed from movements (`recomputeAccountBalance()`) inside the same
transaction rather than incremented blindly, so a balance can never drift from its ledger.

### Audit and corrections

Nothing financial is ever deleted. Every sensitive write produces an `AuditLog` entry with
`actor`, `actorRole`, `action`, `entityType`, `entityId`, `description`, `previousValue`,
`newValue`, `reason`, `ipAddress` and `userAgent`. Corrections are modelled as reversals or
adjustments with a mandatory reason (≥ 5 characters), so the original value stays readable.

## Frontend structure

| Area | Location | Notes |
| --- | --- | --- |
| API client | `src/lib/api.ts` | Axios instance, bearer token, envelope unwrap, `ApiError`, 401 handler |
| Types | `src/lib/types.ts` | Mirrors of the verified API payloads |
| Permissions | `src/lib/permissions.ts` | Same 38 permission strings as the backend; `useAuth().can()` reads `me.permissions` |
| Data hooks | `src/hooks/useApi.ts` | One TanStack Query hook per endpoint; mutations invalidate the caches they affect |
| Pages | `src/pages/**` | Dashboard, customers, tokens, installments, payments, draws, advances, income, expenses, partners, cash & bank, automatic lists, reports, settings, profile, admin (users, audit, backup) |
| UI kit | `src/components/ui/**`, `src/components/shared/**` | shadcn-style primitives plus `DataTable`, `StatCard`, `PaymentDialog`, `PermissionGate`, `ErrorState` |

Local dev proxies `/api` to `http://127.0.0.1:4000` (`vite.config.ts`), so the browser only ever
sees one origin. In production, set `VITE_API_BASE_URL` to the public API origin or serve the
built SPA behind the same nginx that proxies `/api` (see `deployment/`).

## Out of scope (per PRD)

Motorcycle inventory, stock levels, supplier purchasing and inventory valuation are deliberately
absent. The only asset tracked is an advance-bike case, which is a customer-advance record with a
bike description — not stock.
