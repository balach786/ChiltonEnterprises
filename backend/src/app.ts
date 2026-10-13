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
  if (config.isProduction && allowedOrigins.includes('*')) {
    // A wildcard with credentials is both insecure and rejected by browsers; fail loudly at
    // boot instead of silently shipping an open API.
    throw new Error(
      'CORS_ORIGINS=* is not allowed in production. List the exact frontend origin(s), ' +
        'e.g. CORS_ORIGINS=https://showroom.example.com'
    );
  }
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server calls (no Origin header) and configured apps.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
      exposedHeaders: ['Content-Disposition'],
    })
  );

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
