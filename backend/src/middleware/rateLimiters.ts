import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

/** Generic API rate limit. */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' },
  },
});

/** Stricter limit for credential endpoints (login, password change). */
export const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts, please try again later.' },
  },
});

/** Limit for expensive report/export endpoints. */
export const exportLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Export limit reached, please try again shortly.' },
  },
});
