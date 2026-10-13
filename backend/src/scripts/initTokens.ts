/* eslint-disable no-console */
import { connectMongo, disconnectMongo } from '../db/mongo';
import { ensureTokenRegister } from '../services/token.service';
import { SCHEME } from '../constants';

/** Creates any missing token slots so the register always holds exactly 120 slots. */
async function main() {
  await connectMongo();
  const total = await ensureTokenRegister();
  console.log(`Token register now holds ${total} slots (expected ${SCHEME.TOTAL_TOKEN_SLOTS}).`);
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
