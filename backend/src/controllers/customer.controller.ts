import { Request, Response } from 'express';
import { PERMISSIONS } from '../constants/permissions';
import { actor } from '../middleware/auth';
import {
  createCustomer,
  getCustomerById,
  getCustomerStatement,
  listCustomers,
  updateCustomer,
} from '../services/customer.service';
import { getTokenRegister } from '../services/token.service';
import { asyncHandler, ok, okPaginated } from '../utils/http';

const canViewCnic = (req: Request) => Boolean(req.user?.permissions.includes(PERMISSIONS.CNIC_VIEW));

export const listCustomersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listCustomers({ ...req.query, canViewCnic: canViewCnic(req) } as never);
  okPaginated(res, result.items, result.pagination);
});

export const createCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createCustomer(req.body, actor(req), req);
  ok(res, result, 201, `Customer created with ${result.installmentCount} installment periods`);
});

export const getCustomerController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getCustomerById(req.params.id, canViewCnic(req)));
});

export const updateCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const { reason, ...patch } = req.body;
  ok(res, await updateCustomer(req.params.id, patch, actor(req), reason), 200, 'Customer updated');
});

export const customerStatementController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getCustomerStatement(req.params.id, canViewCnic(req)));
});

export const tokensController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getTokenRegister(req.query as never));
});
