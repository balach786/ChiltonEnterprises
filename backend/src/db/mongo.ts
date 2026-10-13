import mongoose, { ClientSession, Mongoose } from 'mongoose';
import { config } from '../config/env';
import { logger } from '../config/logger';

let transactionSupport: boolean | null = null;

export async function connectMongo(uri?: string): Promise<Mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  const mongoUri = uri ?? config.mongoUri;
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(mongoUri, {
    dbName: config.dbName,
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });
  transactionSupport = await detectTransactionSupport();
  logger.info(`MongoDB connected (transactions: ${transactionSupport ? 'supported' : 'not supported'})`);
  return conn;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
  transactionSupport = null;
}

/**
 * Standalone mongod instances do not support multi-document transactions. Detect the
 * topology once so the app can fall back to a documented compensation strategy instead
 * of pretending separate writes were atomic (PRD section 7 "financial consistency").
 */
export async function detectTransactionSupport(): Promise<boolean> {
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) return false;
    const hello = await admin.command({ hello: 1 });
    const isReplSet = Boolean(hello.setName) || Boolean((hello as any).hosts?.length);
    return Boolean(isReplSet);
  } catch {
    return false;
  }
}

export function transactionsSupported(): boolean {
  return config.useTransactions && transactionSupport === true;
}

export function transactionMode(): 'transaction' | 'sequential' {
  return transactionsSupported() ? 'transaction' : 'sequential';
}

export async function disconnect(): Promise<void> {
  return disconnectMongo();
}

/**
 * Run `fn` inside a MongoDB transaction when the deployment supports it. On standalone
 * MongoDB the callback still receives a session (null) and executes sequentially - the
 * caller keeps writes ordered so a partial failure is detectable and reversible.
 */
export async function withTransaction<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
  if (!transactionsSupported()) {
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result!;
  } finally {
    await session.endSession();
  }
}

export { mongoose };
