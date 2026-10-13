import { Request, Response } from 'express';
import { actor } from '../middleware/auth';
import { createAdvance, getAdvanceById, listAdvances, updateAdvance } from '../services/advance.service';
import { asyncHandler, ok } from '../utils/http';

export const listAdvancesController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await listAdvances(req.query as never));
});

export const createAdvanceController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createAdvance(req.body, actor(req));
  ok(res, result, 201, 'Advance recorded - installments continue');
});

export const getAdvanceController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getAdvanceById(req.params.id));
});

export const updateAdvanceController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await updateAdvance(req.params.id, req.body, actor(req)), 200, 'Advance updated');
});
