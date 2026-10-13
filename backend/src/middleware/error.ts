import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl}`));
}

/** Central error handler - one consistent response shape for the whole API. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let statusCode = 500;
  let message = 'Unexpected server error';
  let code = 'INTERNAL_ERROR';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Database validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid identifier for ${err.path}`;
  } else if ((err as { code?: number })?.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    message = `Duplicate value for ${Object.keys(keyPattern).join(', ')}`;
    details = (err as { keyValue?: unknown }).keyValue;
  } else if (err instanceof SyntaxError && 'body' in (err as object)) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err instanceof Error) {
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 && config.isProduction ? 'Unexpected server error' : message,
      details: config.isProduction && statusCode >= 500 ? undefined : details,
    },
    ...(config.isProduction ? {} : { trace: err instanceof Error ? err.stack : undefined }),
  });
}
