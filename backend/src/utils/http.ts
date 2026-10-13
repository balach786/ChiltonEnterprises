import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ApiError } from './ApiError';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async handler so rejected promises reach the central error handler. */
export function asyncHandler(fn: AsyncFn): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Validate one part of the request with a zod schema, replacing it with the parsed value. */
export function validate(schema: ZodSchema, part: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      // Express 5 makes `query` read-only; use defineProperty to stay compatible.
      Object.defineProperty(req, part, { value: parsed, writable: true, configurable: true });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
          code: i.code,
        }));
        next(ApiError.validation('Request validation failed', details));
        return;
      }
      next(err);
    }
  };
}

/** Standardised success envelope. */
export function ok(res: Response, data: unknown, statusCode = 200, message?: string) {
  return res.status(statusCode).json({
    success: true,
    message: message ?? undefined,
    data,
  });
}

export function okPaginated(
  res: Response,
  items: unknown[] | unknown,
  pagination: { page: number; limit: number; total: number },
  extra?: Record<string, unknown>
) {
  const totalPages = pagination.limit > 0 ? Math.ceil(pagination.total / pagination.limit) : 0;
  return res.status(200).json({
    success: true,
    data: {
      items: items as unknown,
      pagination: { ...pagination, totalPages },
      ...extra,
    },
  });
}
