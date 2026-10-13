# API reference

Base path: `/api`. Every response uses one envelope:

```jsonc
// success
{ "success": true, "message": "Payment recorded", "data": { } }

// failure
{ "success": false, "error": { "code": "DUPLICATE_TOKEN", "message": "…", "details": {} } }
```

Status codes: `200` read/update · `201` create · `400` business rule refused · `401` missing or
invalid token · `403` authenticated but not permitted · `404` unknown route or record ·
`409` conflict (duplicate token, CNIC, receipt…) · `422` validation failed · `429` rate limited ·
`500` unexpected.

Authentication: `Authorization: Bearer <accessToken>` obtained from `POST /api/auth/login`.
Tokens expire after `JWT_EXPIRES_IN` (default 12h); the refresh token lasts 30 days.

## Endpoints (76)

| Method | Path | Permission | Validator | Notes |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/login` | `*(authenticated)*` | `loginSchema` | Returns `{ accessToken, refreshToken, expiresIn, user }` |
| `POST` | `/api/auth/logout` | `*(authenticated)*` | `—` |  |
| `GET` | `/api/auth/me` | `*(authenticated)*` | `—` | The signed-in user plus the effective `permissions[]` the UI gates on |
| `POST` | `/api/auth/change-password` | `*(authenticated)*` | `changePasswordSchema` |  |
| `GET` | `/api/auth/permissions` | `*(authenticated)*` | `—` | Role → permission map (reference only) |
| `GET` | `/api/auth/users` | `user:view` | `—` |  |
| `POST` | `/api/auth/users` | `user:manage` | `createUserSchema` |  |
| `PATCH` | `/api/auth/users/:id` | `user:manage` | `updateUserSchema` |  |
| `POST` | `/api/auth/users/:id/reset-password` | `user:manage` | `resetPasswordSchema` |  |
| `GET` | `/api/auth/audit-logs` | `audit:view` | `auditQuerySchema` |  |
| `GET` | `/api/health` | `*(authenticated)*` | `—` | Liveness plus database state and transaction mode |
| `GET` | `/api/dashboard/summary` | `dashboard:view` | `dashboardQuerySchema` |  |
| `GET` | `/api/dashboard/collections` | `dashboard:view` | `dashboardQuerySchema` |  |
| `GET` | `/api/dashboard/expenses` | `dashboard:view` | `dashboardQuerySchema` |  |
| `GET` | `/api/dashboard/cash-position` | `dashboard:view` | `dashboardQuerySchema` |  |
| `GET` | `/api/customers` | `customer:view` | `customerListSchema` |  |
| `POST` | `/api/customers` | `customer:create` | `createCustomerSchema` | Creates customer + enrollment + 28 installments + token claim atomically |
| `GET` | `/api/customers/:id` | `customer:view` | `—` |  |
| `PATCH` | `/api/customers/:id` | `customer:update` | `updateCustomerSchema` |  |
| `GET` | `/api/customers/:id/statement` | `customer:view` | `—` | 28-month schedule, payments, receipts, draws, advances, closures, audit trail |
| `GET` | `/api/customers/:id/credit` | `payment:view` | `—` |  |
| `GET` | `/api/tokens` | `token:view` | `tokenListSchema` |  |
| `POST` | `/api/tokens/init` | `settings:update` | `—` | Creates any missing token slots; always ends with 120 rows |
| `GET` | `/api/installments` | `installment:view` | `installmentListSchema` |  |
| `GET` | `/api/installments/customer/:customerId` | `installment:view` | `—` |  |
| `POST` | `/api/installments/adjust` | `payment:reverse` | `adjustInstallmentSchema` | Concession with a reason; keeps the original scheduled amount |
| `GET` | `/api/payments` | `payment:view` | `paymentListSchema` |  |
| `POST` | `/api/payments` | `payment:create` | `recordPaymentSchema` | Payment + receipt + cash movement + income row; idempotent via `idempotencyKey` |
| `POST` | `/api/payments/:id/reverse` | `payment:reverse` | `reversePaymentSchema` | Marks the original `reversed` and writes a negative mirror |
| `GET` | `/api/payments/:id/trail` | `payment:view` | `—` | The payment and every cash movement it produced |
| `POST` | `/api/payments/allocate-credit` | `payment:create` | `allocateCreditSchema` | Applies unallocated credit to chosen months |
| `GET` | `/api/receipts/:id` | `receipt:view` | `—` |  |
| `GET` | `/api/draws/eligible` | `draw:view` | `eligibleSchema` |  |
| `GET` | `/api/draws` | `draw:view` | `drawListSchema` |  |
| `POST` | `/api/draws` | `draw:create` | `createDrawSchema` | Draft draw, or `confirm: true` to record and confirm in one call |
| `GET` | `/api/draws/:id` | `draw:view` | `—` |  |
| `POST` | `/api/draws/:id/confirm` | `draw:confirm` | `—` | Stops every installment from the draw month onward |
| `POST` | `/api/draws/:id/correct` | `draw:correct` | `correctDrawSchema` | Only valid on a confirmed/corrected draw; keeps correction history |
| `POST` | `/api/draws/:id/void` | `draw:correct` | `voidDrawSchema` |  |
| `GET` | `/api/advances` | `advance:view` | `advanceListSchema` |  |
| `POST` | `/api/advances` | `advance:create` | `createAdvanceSchema` | BIKE keeps installments running; CASH creates exactly one outflow |
| `GET` | `/api/advances/:id` | `advance:view` | `—` |  |
| `PATCH` | `/api/advances/:id` | `advance:update` | `updateAdvanceSchema` |  |
| `GET` | `/api/income` | `income:view` | `incomeListSchema` |  |
| `POST` | `/api/income` | `income:create` | `createIncomeSchema` |  |
| `GET` | `/api/expenses` | `expense:view` | `expenseListSchema` |  |
| `POST` | `/api/expenses` | `expense:create` | `createExpenseSchema` |  |
| `POST` | `/api/expenses/:id/reverse` | `expense:reverse` | `reverseExpenseSchema` |  |
| `GET` | `/api/partners` | `partner:view` | `—` |  |
| `GET` | `/api/partners/:id/transactions` | `partner:view` | `partnerTxnListSchema` |  |
| `POST` | `/api/partners/:id/transactions` | `partner:txn:create` | `partnerTxnSchema` | Withdrawal / contribution / repayment with the cash effect derived server-side |
| `GET` | `/api/financial-accounts` | `account:view` | `—` |  |
| `POST` | `/api/financial-accounts` | `account:create` | `createAccountSchema` |  |
| `GET` | `/api/cash-movements` | `account:view` | `cashMovementListSchema` |  |
| `GET` | `/api/transfers` | `account:view` | `—` |  |
| `POST` | `/api/transfers` | `transfer:create` | `transferSchema` | OUT + IN movements in one transaction; never income or expense |
| `GET` | `/api/reconciliation` | `account:view` | `—` |  |
| `POST` | `/api/reconciliation` | `reconciliation:create` | `reconciliationSchema` | Stores system-calculated vs counted closing and the difference |
| `GET` | `/api/lists/active-collections` | `customer:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/drawn-closed` | `customer:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/advance-bike` | `advance:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/advance-cash` | `advance:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/overdue-partial` | `installment:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/token-register` | `token:view` | `tokenListSchema` |  |
| `GET` | `/api/lists/mach` | `customer:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/quetta` | `customer:view` | `listQuerySchema` |  |
| `GET` | `/api/lists/draw-eligible` | `draw:view` | `eligibleSchema` |  |
| `GET` | `/api/reports` | `report:view` | `—` |  |
| `GET` | `/api/reports/:type/preview` | `report:view` | `reportQuerySchema` | JSON `ReportBundle` used by the on-screen print view |
| `GET` | `/api/reports/customer-statement/:customerId` | `report:view` | `reportQuerySchema` | Statement download for one customer |
| `GET` | `/api/reports/:type` | `report:export` | `reportQuerySchema` | Download: `?format=xlsx|pdf|csv|json` plus the same filters as the preview |
| `GET` | `/api/settings` | `settings:view` | `—` |  |
| `GET` | `/api/settings/meta` | `settings:view` | `—` |  |
| `PATCH` | `/api/settings` | `settings:update` | `updateSettingsSchema` |  |
| `GET` | `/api/backups` | `settings:view` | `—` |  |
| `GET` | `/api/backups/export` | `settings:update` | `—` | Full archive export (json/xlsx/csv); records a BackupRecord |

## Money and dates

* Every amount is integer paisa in the database. Responses add `*Pkr` and `*Formatted` siblings.
* Request bodies accept PKR (`amountPkr`, `monthlyInstallmentPkr`, `actualCountedPkr`, `adjustedPkr`).
* Dates are ISO (`YYYY-MM-DD` or full ISO timestamps); the server stores UTC and reports in
  `Asia/Karachi` where the PRD requires local dates.

## Export formats

`GET /api/reports/:type?format=xlsx|pdf|csv|json` streams the file with a
`Content-Disposition` filename. Excel output has a 4-row header block, frozen panes, an
`autoFilter`, text-formatted token codes and PKR number formats. CSV mirrors the same columns
and totals. The PDF renderer writes a title, period, page numbers and a footer on every page.

## Rate limits

`RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` in general, `AUTH_RATE_LIMIT_MAX` for
login/password routes, plus a stricter limiter on report exports.
