import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { config } from '../config/env';
import { Role } from '../constants';
import { AuditLog, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { effectivePermissions, signAccessToken, signRefreshToken } from '../middleware/auth';
import { writeAudit } from './audit.service';
import { AuthUser } from '../types/express';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    permissions: string[];
    mustChangePassword: boolean;
  };
}

export async function login(
  email: string,
  password: string,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<LoginResult> {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) {
    await writeAudit({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      description: `Failed login for unknown email ${email}`,
      request: { ip: meta.ip, headers: { 'user-agent': meta.userAgent } } as never,
    });
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await writeAudit({
      actor: { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: [], mustChangePassword: false },
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: String(user._id),
      description: `Failed login attempt for ${user.email}`,
      request: { ip: meta.ip, headers: { 'user-agent': meta.userAgent } } as never,
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const permissions = effectivePermissions(user);
  await writeAudit({
    actor: { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions, mustChangePassword: false },
    action: 'LOGIN',
    entityType: 'User',
    entityId: String(user._id),
    description: `${user.name} signed in`,
    request: { ip: meta.ip, headers: { 'user-agent': meta.userAgent } } as never,
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    expiresIn: config.jwtExpiresIn,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function me(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('User');
  return {
    ...serializeMoney<Record<string, unknown>>(user),
    permissions: effectivePermissions(user),
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw ApiError.badRequest('New password must be at least 8 characters long', 'WEAK_PASSWORD');
  }
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');
  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from the current one', 'SAME_PASSWORD');
  }

  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  user.mustChangePassword = false;
  await user.save();

  await writeAudit({
    actor: { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: [], mustChangePassword: false },
    action: 'PASSWORD_CHANGE',
    entityType: 'User',
    entityId: String(user._id),
    description: `Password changed for ${user.email}`,
  });

  return { success: true };
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  extraPermissions?: string[];
  deniedPermissions?: string[];
  mustChangePassword?: boolean;
}

export async function createUser(input: CreateUserInput, actor: AuthUser) {
  if (!input.name?.trim()) throw ApiError.badRequest('Name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw ApiError.badRequest('A valid email is required');
  if (!input.password || input.password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long', 'WEAK_PASSWORD');
  }
  const existing = await User.findOne({ email: input.email.toLowerCase().trim() }).lean();
  if (existing) throw ApiError.conflict('A user with this email already exists', 'EMAIL_TAKEN');

  const user = await User.create({
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
    passwordHash: await bcrypt.hash(input.password, config.bcryptRounds),
    role: input.role,
    extraPermissions: input.extraPermissions ?? [],
    deniedPermissions: input.deniedPermissions ?? [],
    mustChangePassword: input.mustChangePassword ?? true,
    createdBy: actor.id,
  });

  await writeAudit({
    actor,
    action: 'CREATE',
    entityType: 'User',
    entityId: String(user._id),
    description: `Created ${input.role} account ${user.email}`,
    newValue: { role: input.role, extraPermissions: user.extraPermissions, deniedPermissions: user.deniedPermissions },
    reason: 'User management',
  });

  return serializeMoney(user);
}

export async function listUsers() {
  const users = await User.find({}).sort({ createdAt: 1 }).lean();
  return users.map((u) => ({ ...serializeMoney<Record<string, unknown>>(u), permissions: effectivePermissions(u) }));
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; isActive?: boolean; extraPermissions?: string[]; deniedPermissions?: string[]; mustChangePassword?: boolean },
  actor: AuthUser,
  reason?: string
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('User');
  const before = await User.findById(id).lean();
  if (!before) throw ApiError.notFound('User');
  if (String(before._id) === actor.id && patch.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account', 'SELF_DEACTIVATE');
  }
  if (String(before._id) === actor.id && patch.role && patch.role !== before.role) {
    throw ApiError.badRequest('You cannot change your own role', 'SELF_ROLE_CHANGE');
  }

  const updated = await User.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();

  await writeAudit({
    actor,
    action: patch.role !== before.role || patch.extraPermissions || patch.deniedPermissions ? 'PERMISSION_CHANGE' : 'UPDATE',
    entityType: 'User',
    entityId: id,
    description: `Updated user ${before.email}`,
    previousValue: { role: before.role, isActive: before.isActive, extraPermissions: before.extraPermissions, deniedPermissions: before.deniedPermissions },
    newValue: patch,
    reason: reason ?? 'User management',
  });

  return { ...serializeMoney<Record<string, unknown>>(updated), permissions: effectivePermissions(updated!) };
}

export async function resetUserPassword(id: string, newPassword: string, actor: AuthUser) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('User');
  if (!newPassword || newPassword.length < 8) throw ApiError.badRequest('Password must be at least 8 characters long');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');
  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  user.mustChangePassword = true;
  await user.save();

  await writeAudit({
    actor,
    action: 'PASSWORD_CHANGE',
    entityType: 'User',
    entityId: id,
    description: `Administrator reset the password for ${user.email}`,
    reason: 'Password reset',
  });
  return { success: true };
}

export async function listAuditLogs(query: {
  entityType?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (query.entityType) filter.entityType = query.entityType;
  if (query.action) filter.action = query.action;
  if (query.actorId) filter.actor = new Types.ObjectId(query.actorId);
  if (query.entityId) filter.entityId = query.entityId;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) (filter.createdAt as Record<string, Date>).$gte = query.dateFrom;
    if (query.dateTo) (filter.createdAt as Record<string, Date>).$lte = query.dateTo;
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items: serializeMoney(items), pagination: { page, limit, total } };
}
