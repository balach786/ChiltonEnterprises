import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../db/mongo';

const URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB = process.env.MONGODB_DB ?? 'showroom_test';

/**
 * Connects through `connectMongo()` (not `mongoose.connect`) so that transaction
 * support is detected and the suite exercises the same multi-document transaction
 * path production uses on a replica set.
 */
beforeAll(async () => {
  process.env.MONGODB_URI = URI;
  process.env.MONGODB_DB = DB;
  if (mongoose.connection.readyState !== 1) {
    await connectMongo();
  }
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db!.listCollections().toArray();
  await Promise.all(
    collections
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .map((n) => mongoose.connection.db!.collection(n).deleteMany({}))
  );
});

afterAll(async () => {
  await disconnectMongo();
});
