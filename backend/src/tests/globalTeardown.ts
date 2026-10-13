import fs from 'fs';

/** Cleans up the temporary mongod data directory if globalSetup created one. */
export default async function globalTeardown() {
  const dbPath = process.env.MONGO_DB_PATH;
  if (dbPath && fs.existsSync(dbPath)) {
    try {
      fs.rmSync(dbPath, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
