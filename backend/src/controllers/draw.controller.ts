import { Request, Response } from 'express';
import { actor } from '../middleware/auth';
import {
  confirmDraw,
  correctDraw,
  createDraw,
  getDrawById,
  getEligibleList,
  listDraws,
  voidDraw,
} from '../services/draw.service';
import { asyncHandler, ok } from '../utils/http';

export const eligibleController = asyncHandler(async (req: Request, res: Response) => {
  const { schemeMonth, schemeCode, location } = req.query as unknown as { schemeMonth: number; schemeCode?: string; location?: 'MACH' | 'QUETTA' };
  ok(res, await getEligibleList(Number(schemeMonth), schemeCode ?? 'S1', location));
});

export const createDrawController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createDraw(req.body, actor(req)), 201, 'Draw recorded');
});

export const listDrawsController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await listDraws(req.query as never));
});

export const getDrawController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getDrawById(req.params.id));
});

export const confirmDrawController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await confirmDraw(req.params.id, actor(req)), 200, 'Draw confirmed and account closed');
});

export const correctDrawController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await correctDraw(req.params.id, req.body, actor(req)), 200, 'Draw corrected');
});

export const voidDrawController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await voidDraw(req.params.id, req.body.reason, actor(req)), 200, 'Draw voided');
});
