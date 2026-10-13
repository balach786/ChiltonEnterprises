import { NextFunction, Request, Response } from 'express';

/**
 * Cache policy for the API.
 *
 * Almost everything this API returns is customer or financial data, so the default is `no-store`:
 * a shared proxy or a phone's browser cache must never hold on to it. The few endpoints that carry
 * no personal data and change only when an administrator edits settings are marked cacheable so a
 * slow connection still gets an instant, offline-tolerant response.
 */
const CACHEABLE_PRIVATE: Record<string, string> = {
  '/settings/meta': 'private, max-age=300, stale-while-revalidate=600',
};

export function cachePolicy(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }
  const policy = CACHEABLE_PRIVATE[req.path];
  res.setHeader('Cache-Control', policy ?? 'no-store');
  next();
}
