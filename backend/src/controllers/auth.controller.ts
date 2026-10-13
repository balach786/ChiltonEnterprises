import { Request, Response } from 'express';
import { actor } from '../middleware/auth';
import {
  changePassword,
  createUser,
  listAuditLogs,
  listUsers,
  login,
  me,
  resetUserPassword,
  updateUser,
} from '../services/auth.service';
import { asyncHandler, ok, okPaginated } from '../utils/http';
import { rolePermissionMap } from '../constants/permissions';
import { writeAudit } from '../services/audit.service';

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await login(email, password, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  ok(res, result, 200, 'Signed in');
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  await writeAudit({
    actor: req.user,
    action: 'LOGOUT',
    entityType: 'User',
    entityId: req.user?.id,
    description: `${req.user?.name ?? 'user'} signed out`,
    request: req,
  });
  ok(res, { success: true }, 200, 'Signed out');
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await me(actor(req).id));
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  ok(res, await changePassword(actor(req).id, currentPassword, newPassword), 200, 'Password updated');
});

export const permissionsController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, rolePermissionMap());
});

export const listUsersController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await listUsers());
});

export const createUserController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createUser(req.body, actor(req)), 201, 'User created');
});

export const updateUserController = asyncHandler(async (req: Request, res: Response) => {
  const { reason, ...patch } = req.body;
  ok(res, await updateUser(req.params.id, patch, actor(req), reason), 200, 'User updated');
});

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await resetUserPassword(req.params.id, req.body.newPassword, actor(req)), 200, 'Password reset');
});

export const auditLogsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAuditLogs(req.query as never);
  okPaginated(res, result.items, result.pagination);
});
