import type { Request, Response } from 'express';
import { createApp } from '../src/app';
import { connectMongo } from '../src/db/mongo';
import { bootstrap } from '../src/db/bootstrap';

const app = createApp();
let readyPromise: Promise<void> | null = null;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await connectMongo();
      await bootstrap();
    })();
  }
  await readyPromise;
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureReady();
    return app(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database initialization error';
    return res.status(500).json({
      success: false,
      error: { code: 'SERVERLESS_DB_ERROR', message },
    });
  }
}
