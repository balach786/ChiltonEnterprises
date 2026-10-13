export { User, IUser } from './User';
export { AuditLog, IAuditLog, AuditAction } from './AuditLog';
export { Settings, ISettings, SETTINGS_KEY } from './Settings';
export { Token, IToken, tokenCode } from './Token';
export { Customer, ICustomer, normalizeCnic, formatCnic, maskCnic } from './Customer';
export { SchemeEnrollment, ISchemeEnrollment } from './SchemeEnrollment';
export { Installment, IInstallment, InstallmentStatus, deriveInstallmentStatus } from './Installment';
export { Payment, IPayment, IPaymentAllocation } from './Payment';
export { Receipt, IReceipt } from './Receipt';
export { Counter, ICounter, nextSequence } from './Counter';
export { DrawEvent, IDrawEvent, IEligibleSnapshot, ICorrectionRecord } from './DrawEvent';
export { CustomerClosure, ICustomerClosure } from './CustomerClosure';
export { CustomerAdvance, ICustomerAdvance } from './CustomerAdvance';
export { IncomeTransaction, IIncomeTransaction } from './IncomeTransaction';
export { ExpenseTransaction, IExpenseTransaction } from './ExpenseTransaction';
export { Partner, IPartner } from './Partner';
export { PartnerTransaction, IPartnerTransaction, partnerCashEffect } from './PartnerTransaction';
export { FinancialAccount, IFinancialAccount } from './FinancialAccount';
export { CashMovement, ICashMovement } from './CashMovement';
export { Transfer, ITransfer } from './Transfer';
export { Reconciliation, IReconciliation } from './Reconciliation';
export { BackupRecord, IBackupRecord } from './BackupRecord';

import { ClientSession, Model } from 'mongoose';

/**
 * Helper that attaches the ambient session to a save/insert so every write inside
 * `withTransaction` actually participates in it.
 */
export async function saveDoc<T extends { save(opts?: unknown): Promise<unknown> }>(
  doc: T,
  session: ClientSession | null
): Promise<T> {
  if (session) await doc.save({ session });
  else await doc.save();
  return doc;
}

export async function createOne<D>(
  model: Model<D>,
  data: Partial<D>,
  session: ClientSession | null
): Promise<D> {
  const [doc] = await model.create([data as any], session ? { session } : {});
  return doc;
}
