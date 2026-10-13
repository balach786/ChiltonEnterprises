import { Schema, model, Types } from 'mongoose';

/** Atomic sequence counters used for receipt numbers and generated codes. */
export interface ICounter {
  _id?: Types.ObjectId;
  key: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model<ICounter>('Counter', counterSchema);

/**
 * Atomically reserve the next sequence value. `findOneAndUpdate` + `$inc` guarantees a
 * unique number even when several requests arrive at the same moment.
 */
export async function nextSequence(key: string, step = 1): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: step } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();
  return doc?.seq ?? step;
}
