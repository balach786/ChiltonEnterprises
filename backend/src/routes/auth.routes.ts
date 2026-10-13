import { Router } from 'express';
import { PERMISSIONS } from '../constants/permissions';
import { requireAuth, requirePermission } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiters';
import { validate } from '../utils/http';
import {
  auditLogsController,
  changePasswordController,
  createUserController,
  listUsersController,
  loginController,
  logoutController,
  meController,
  permissionsController,
  resetPasswordController,
  updateUserController,
} from '../controllers/auth.controller';
import {
  auditQuerySchema,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../validators';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), loginController);
router.post('/logout', requireAuth, logoutController);
router.get('/me', requireAuth, meController);
router.post('/change-password', requireAuth, authLimiter, validate(changePasswordSchema), changePasswordController);
router.get('/permissions', requireAuth, permissionsController);

/* user administration (owner only) */
router.get('/users', requireAuth, requirePermission(PERMISSIONS.USER_VIEW), listUsersController);
router.post('/users', requireAuth, requirePermission(PERMISSIONS.USER_MANAGE), validate(createUserSchema), createUserController);
router.patch('/users/:id', requireAuth, requirePermission(PERMISSIONS.USER_MANAGE), validate(updateUserSchema), updateUserController);
router.post('/users/:id/reset-password', requireAuth, requirePermission(PERMISSIONS.USER_MANAGE), validate(resetPasswordSchema), resetPasswordController);

/* audit trail */
router.get('/audit-logs', requireAuth, requirePermission(PERMISSIONS.AUDIT_VIEW), validate(auditQuerySchema, 'query'), auditLogsController);

export default router;
