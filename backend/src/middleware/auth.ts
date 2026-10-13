import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { permissionsForRole, Permission } from '../constants/permissions';
import { Role } from '../constants';
import { User } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/http';
import { AuthUser } from '../types/express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access' | 'refresh';
}

export function signAccessToken(user: {
  _id: unknown;
  email: string;
  role: Role;
}): string {
  const payload: JwtPayload = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    type: 'access',
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function signRefreshToken(user: { _id: unknown; email: string; role: Role }): string {
  const payload: JwtPayload = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    type: 'refresh',
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.refreshExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

/** Effective permissions = role defaults + granted extras - denied. */
export function effectivePermissions(user: {
  role: Role;
  extraPermissions?: string[];
  deniedPermissions?: string[];
}): Permission[] {
  const base = new Set<string>(permissionsForRole(user.role));
  for (const p of user.extraPermissions ?? []) base.add(p);
  for (const p of user.deniedPermissions ?? []) base.delete(p);
  return [...base] as Permission[];
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired or token invalid');
  }
  if (payload.type !== 'access') throw ApiError.unauthorized('Invalid token type');

  const user = await User.findById(payload.sub).lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Account has been deactivated');

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: effectivePermissions(user),
    mustChangePassword: Boolean(user.mustChangePassword),
  };
  next();
});

/** Route guard: the caller must hold every listed permission. */
export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const perms = req.user?.permissions ?? [];
    const missing = required.filter((p) => !perms.includes(p));
    if (missing.length > 0) {
      next(
        ApiError.forbidden(
          `Missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
        )
      );
      return;
    }
    next();
  };
}

/** Route guard: caller must hold at least one of the listed permissions. */
export function requireAnyPermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const perms = req.user?.permissions ?? [];
    if (!required.some((p) => perms.includes(p))) {
      next(ApiError.forbidden(`Requires one of: ${required.join(', ')}`));
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
      return;
    }
    next();
  };
}

/** Convenience accessor that throws if used outside an authenticated route. */
export function actor(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
