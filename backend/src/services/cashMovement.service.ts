import { ClientSession, Types } from 'mongoose';
import { CashMovement, FinancialAccount, ICashMovement } from '../models';
import { ApiError } from '../utils/ApiError';

export interface MovementInput {
  account: Types.ObjectId;
  direction: 'IN' | 'OUT';
  amountPaisa: number;
  movementDate: Date;
  sourceType: ICashMovement['sourceType'];
  sourceRef?: Types.ObjectId | string;
  transfer?: Types.ObjectId;
  counterpartAccount?: Types.ObjectId;
  description?: string;
  reference?: string;
  customer?: Types.ObjectId;
  partner?: Types.ObjectId;
  enteredBy?: Types.ObjectId | string;
  enteredByName?: string;
}

/**
 * Creates a cash/bank movement and updates the account balance in the same operation.
 *
 * Guarantees:
 *  - a source transaction can never produce two movements for the same account and
 *    direction (duplicate write is rejected before it reaches the database);
 *  - the account balance cache moves by exactly the movement amount;
 *  - amounts are integers (paisa), never floats.
 */
export async function recordMovement(
  input: MovementInput,
  session: ClientSession | null
): Promise<ICashMovement & { _id: Types.ObjectId }> {
  if (!Number.isFinite(input.amountPaisa) || input.amountPaisa <= 0) {
    throw ApiError.badRequest('Cash movement amount must be a positive number', 'INVALID_AMOUNT');
  }
  const amountPaisa = Math.round(input.amountPaisa);

  // Idempotency guard: reject a second movement from the same source.
  if (input.sourceRef) {
    const existing = await CashMovement.findOne({
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      account: input.account,
      direction: input.direction,
    })
      .session(session ?? null)
      .lean();
    if (existing) {
      throw ApiError.conflict(
        'A cash movement already exists for this transaction - duplicate movement prevented',
        'DUPLICATE_MOVEMENT',
        { movementId: String(existing._id) }
      );
    }
  }

  const account = await FinancialAccount.findById(input.account)
    .session(session ?? null)
    .lean();
  if (!account) throw ApiError.notFound('Financial account');
  if (!account.isActive) throw ApiError.badRequest('Financial account is inactive', 'ACCOUNT_INACTIVE');

  const doc = new CashMovement({
    account: input.account,
    accountName: account.name,
    accountType: account.type,
    direction: input.direction,
    amountPaisa,
    movementDate: input.movementDate,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    transfer: input.transfer,
    counterpartAccount: input.counterpartAccount,
    description: input.description,
    reference: input.reference,
    customer: input.customer,
    partner: input.partner,
    enteredBy: input.enteredBy ? new Types.ObjectId(String(input.enteredBy)) : undefined,
    enteredByName: input.enteredByName,
  });
  if (session) await doc.save({ session });
  else await doc.save();

  const delta = input.direction === 'IN' ? amountPaisa : -amountPaisa;
  await FinancialAccount.updateOne(
    { _id: input.account },
    { $inc: { balancePaisa: delta } },
    session ? { session } : {}
  );

  return doc.toObject() as ICashMovement & { _id: Types.ObjectId };
}

/** Recomputes an account balance from the ledger (used by reconciliation + tests). */
export async function recomputeAccountBalance(
  accountId: Types.ObjectId | string,
  session: ClientSession | null = null
): Promise<number> {
  const account = await FinancialAccount.findById(accountId)
    .session(session ?? null)
    .lean();
  if (!account) throw ApiError.notFound('Financial account');

  const [agg] = await CashMovement.aggregate([
    { $match: { account: new Types.ObjectId(String(accountId)), status: 'posted' } },
    {
      $group: {
        _id: null,
        inflow: { $sum: { $cond: [{ $eq: ['$direction', 'IN'] }, '$amountPaisa', 0] } },
        outflow: { $sum: { $cond: [{ $eq: ['$direction', 'OUT'] }, '$amountPaisa', 0] } },
      },
    },
  ]).session(session ?? null);

  const balance =
    (account.openingBalancePaisa ?? 0) + (agg?.inflow ?? 0) - (agg?.outflow ?? 0);

  await FinancialAccount.updateOne(
    { _id: accountId },
    { $set: { balancePaisa: balance } },
    session ? { session } : {}
  );
  return balance;
}
