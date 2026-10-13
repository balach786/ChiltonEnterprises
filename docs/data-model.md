# Data model

MongoDB, one database (`MONGODB_DB`, default `showroom`), 22 collections. All money fields are
integer paisa. All identity codes (`CUST-0001`, `PAY-2026-000001`, `RCPT-000001`, `ADV-000001`,
`PTX-0000001`, `TRF-…`, `EXP-…`, `INC-…`) come from the `counters` collection via atomic
`findOneAndUpdate` so concurrent writes cannot collide.

## Collections

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `users` | System users | `email` (unique), `passwordHash` (bcrypt), `role`, `isActive`, `extraPermissions`, `deniedPermissions`, `mustChangePassword`, `lastLoginAt` |
| `settings` | Single business configuration document (`key: 'global'`) | `businessName`, `reportHeader`, `receiptPrefix`, `receiptSeqPadding`, `timezone`, `currentSchemeMonth`, `defaultSchemeDurationMonths` (28), `duplicateCnicPolicy`, `allowPartialPayments`, `allowMultipleMonthPayments`, `autoCloseOnDraw`, `cnicMaskingEnabled`, `locations`, `paymentMethods`, `incomeCategories`, `expenseCategories` |
| `tokens` | The fixed register | `number` 1–120 (unique), `code` `001`–`120` (unique), `status`, `history[]` — rows are never deleted |
| `customers` | Enrolled customers | `customerCode` (unique), `name`, `cnic` (13 digits), `cnicFormatted`, `phone`, `fatherName`, `address`, `location`, `joiningDate`, `status` (`active` / `drawn_closed` / `inactive`), `drawStatus`, `advanceBikeActive`, `advanceCashActive`, `lifetimePaidPaisa`, `currentEnrollment` |
| `schemeenrollments` | One scheme participation | `enrollmentCode` (unique), `customer`, `token`, `tokenNumber`, `schemeCode`, `monthlyInstallmentPaisa`, `schemeTotalPaisa`, `totalPaidPaisa`, `status` |
| `installments` | 28 rows per enrollment | `enrollment`, `customer`, `monthNumber` 1–28, `dueDate`, `scheduledPaisa`, `paidPaisa`, `adjustedPaisa`, `adjustmentReason`, `outstandingPaisa`, `status` (`unpaid`/`partial`/`paid`/`overdue`/`not_applicable`/`adjusted`), `stoppedAfterDraw`, `lastPaymentAt` |
| `payments` | Money received | `paymentNumber` (unique), `idempotencyKey` (sparse index), `customer`, `enrollment`, `amountPaisa`, `allocatedPaisa`, `unallocatedPaisa`, `allocations[]`, `method`, `account`, `paymentDate`, `status` (`posted`/`reversed`), `reversesPayment`, `reversedByPayment`, `reversalReason`, `sourceType` |
| `receipts` | One per payment | `number` (unique), `payment` (unique — exactly one receipt per payment), `customer`, `amountPaisa`, `detail`, `allocations[]`, `issuedBy`, `status` |
| `drawevents` | Qurandazi record | `schemeCode`, `schemeMonth`, `drawDate`, `eligibleSnapshot[]`, `eligibleCount`, `winnerTokenNumber`, `winnerCustomer`, `status` (`DRAFT`/`CONFIRMED`/`CORRECTED`/`VOIDED`), `corrections[]`, `operator`, `approvedBy`, `witnesses[]` |
| `customerclosures` | Effect of a confirmed draw | `enrollment`, `customer`, `drawEvent`, `stoppedFromMonth`, `status` (`ACTIVE`/`VOIDED`), `closedAt`, `reason` |
| `customeradvances` | Advance bike / advance cash | `advanceCode` (unique), `customer`, `enrollment`, `type` (`BIKE`/`CASH`), `advanceDate`, `amountPaisa`, `bikeModel`, `chassisNumber`, `engineNumber`, `purpose`, `authorizedBy`, `approver`, `stopsInstallments`, `installmentsContinue`, `status`, `expenseTransaction`, `cashMovement` |
| `incometransactions` | All inflows | `transactionId` (unique), `category`, `amountPaisa`, `isRevenue`, `method`, `account`, `transactionDate`, `sourceType`, `sourceRef`, `customer`, `reference` |
| `expensetransactions` | All outflows except transfers | `transactionId` (unique), `category`, `subCategory`, `amountPaisa`, `isOperatingExpense`, `paidTo`, `partner`, `customer`, `method`, `account`, `location`, `purpose`, `sourceType`, `sourceRef` |
| `partners` | Irfan, Ghulam Muhammad, Hafiz Khalid | `partnerCode` (unique), `name` (unique), `openingBalancePaisa`, `totalContributedPaisa`, `totalWithdrawnPaisa`, `totalRepaidPaisa`, `netCashPaisa` — no ownership percentage |
| `partnertransactions` | Partner ledger | `transactionId` (unique), `partner`, `type` (`WITHDRAWAL`/`CONTRIBUTION`/`REPAYMENT`/`CORRECTION`), `amountPaisa`, `cashEffectPaisa`, `method`, `account`, `transactionDate`, `purpose`, `reference` |
| `financialaccounts` | Cash drawers and bank accounts | `code` (unique), `name`, `type` (`CASH`/`BANK`), `bankName`, `accountNumber`, `openingBalancePaisa`, `balancePaisa`, `isDefault`, `location`, `isActive` |
| `cashmovements` | The single cash ledger | `account`, `direction` (`IN`/`OUT`), `amountPaisa`, `movementDate`, `sourceType` (`CUSTOMER_PAYMENT`/`INCOME`/`EXPENSE`/`PARTNER_TXN`/`ADVANCE_CASH`/`TRANSFER`/`OPENING_BALANCE`), `sourceRef`, `reference`, `description`, `status` |
| `transfers` | Cash ↔ bank | `transferId` (unique), `fromAccount`, `toAccount`, `amountPaisa`, `transferDate`, `method`, `outMovement`, `inMovement` |
| `reconciliations` | Daily closing | `account`, `closingDate`, `openingBalancePaisa`, `totalInPaisa`, `totalOutPaisa`, `systemCalculatedPaisa`, `actualCountedPaisa`, `differencePaisa`, `status`, `notes` |
| `auditlogs` | Immutable trail | `actor`, `actorName`, `actorRole`, `action`, `entityType`, `entityId`, `description`, `previousValue`, `newValue`, `reason`, `ipAddress`, `userAgent`, `createdAt` |
| `backuprecords` | Export / restore history | `kind` (`EXPORT`/`RESTORE`/`SCHEDULED`/`MIGRATION`), `label`, `format`, `location`, `sizeBytes`, `collectionCounts`, `checksum`, `performedBy`, `status` |
| `counters` | Sequence generators | `key` (unique), `seq` |

## Indexes that enforce business rules

| Index | Collection | Rule it protects |
| --- | --- | --- |
| `{ number: 1 }` unique, `{ code: 1 }` unique | `tokens` | Exactly one row per token, codes 001–120 |
| `{ token: 1 }` unique where `status: 'active'` (`uniq_active_token`) and `{ token: 1, schemeCode: 1 }` unique where `status: 'active'` | `schemeenrollments` | A token can only belong to one active customer; a released token can be re-issued |
| `{ enrollment: 1, monthNumber: 1 }` unique | `installments` | Exactly 28 rows, no duplicated month |
| `{ sourceType: 1, sourceRef: 1, account: 1, direction: 1 }` unique (`uniq_movement_per_source`) | `cashmovements` | One cash movement per financial event — no double counting |
| `{ sourceType: 1, sourceRef: 1 }` unique where `sourceType: 'CUSTOMER_PAYMENT'` (`uniq_payment_income`) | `incometransactions` | A payment cannot create two income rows |
| `{ sourceType: 1, sourceRef: 1 }` unique where `sourceType ∈ [ADVANCE_CASH, PARTNER_WITHDRAWAL]` (`uniq_advance_expense`) | `expensetransactions` | One expense mirror per advance-cash case or withdrawal |
| `{ payment: 1 }` unique | `receipts` | Exactly one receipt per payment |
| `{ enrollment: 1 }` unique where `status: 'ACTIVE'` (`uniq_active_closure_per_enrollment`) | `customerclosures` | One active closure per enrollment; voided closures stay for audit |
| `{ schemeCode: 1, schemeMonth: 1 }` unique where `status ∈ [CONFIRMED, CORRECTED]` (`uniq_confirmed_month`) | `drawevents` | One confirmed winner per scheme month |
| `{ account: 1, closingDate: 1 }` unique (`uniq_closing_per_day`) | `reconciliations` | One daily closing per account |
| `{ type: 1 }` unique where `isDefault: true` (`uniq_default_account`) | `financialaccounts` | One default account per type |
| `{ email: 1 }` unique | `users` | No duplicate logins |
| `{ customerCode }`, `{ advanceCode }`, `{ transactionId }`, `{ paymentNumber }`, `{ number }` (receipt), `{ transferId }`, `{ partnerCode }`, `{ name }` (partner) unique | several | Human-readable identifiers never collide |

Indexes are created idempotently at boot by `db/bootstrap.ts` (`syncIndexes()`), so a fresh
database and an upgraded one converge on the same shape.
