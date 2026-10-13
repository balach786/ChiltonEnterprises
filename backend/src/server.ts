import { createApp } from './app';
import { config } from './config/env';
import { connectMongo, disconnectMongo, transactionMode } from './db/mongo';
import { logger } from './config/logger';
import { bootstrap } from './db/bootstrap';

// Chilton Enterprises API Server

async function main() {
  const app = createApp();

  await connectMongo();
  await bootstrap();

  logger.info(
    `Financial writes use ${transactionMode()} mode${
      transactionMode() === 'sequential'
        ? ' (MongoDB is standalone - deploy a replica set / Atlas to enable multi-document transactions)'
        : ''
    }`
  );

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`API listening on http://0.0.0.0:${config.port} (${config.env})`);
    logger.info(`Allowed CORS origins: ${config.corsOrigins.join(', ')}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received - shutting down`);
    server.close(async () => {
      await disconnectMongo();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    process.exit(1);
  });
}

main().catch((err) => {
  // Config errors are printed without leaking secret values.
  logger.error('Failed to start API', err instanceof Error ? err.message : err);
  process.exit(1);
});
