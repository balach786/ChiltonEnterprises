import compression from 'compression';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import { apiLimiter } from './middleware/rateLimiters';
import { cachePolicy } from './middleware/cachePolicy';
import { errorHandler, notFoundHandler } from './middleware/error';
import routes from './routes';

export function createApp(): Application {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = config.corsOrigins.length ? config.corsOrigins : [config.frontendUrls[0]];

  const corsMiddleware = cors({
    origin(origin, callback) {
      // 1. Allow same-origin / server-to-server / curl calls (no Origin header)
      if (!origin) return callback(null, true);

      // 2. Allow any localhost / 127.0.0.1 port in development or testing
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // 3. Allow any Vercel deployment domain (*.vercel.app)
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      // 4. Check explicit allowed origins or wildcard
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((allowed) => allowed.endsWith('*') && origin.startsWith(allowed.slice(0, -1)))
      ) {
        return callback(null, true);
      }

      // 5. Silently omit CORS headers for unknown origin rather than throwing an unhandled 500
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    exposedHeaders: ['Content-Disposition'],
  });

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  if (config.logLevel !== 'silent') {
    app.use(morgan(config.isProduction ? 'combined' : 'dev', { skip: () => config.isTest }));
  }

  app.use('/api', apiLimiter, cachePolicy, routes);

  app.get('/', (_req, res) => {
    res.json({
      name: 'Motorcycle Showroom Management System API',
      version: '1.0.0',
      documentation: '/api/health',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
