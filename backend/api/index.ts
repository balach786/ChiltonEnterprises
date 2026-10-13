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
  // 1. Immediately handle OPTIONS preflight without blocking on DB initialization
  if (req.method === 'OPTIONS') {
    return app(req, res);
  }

  try {
    await ensureReady();
    return app(req, res);
  } catch (err: unknown) {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Idempotency-Key');
    }
    const message = err instanceof Error ? err.message : 'Database initialization error';
    return res.status(500).json({
      success: false,
      error: { code: 'SERVERLESS_DB_ERROR', message },
    });
  }
}
