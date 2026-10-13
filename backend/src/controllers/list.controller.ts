import { Request, Response } from 'express';
import {
  getCashPosition,
  getCollectionsByInstallmentMonth,
  getCollectionsByLocation,
  getCollectionsSeries,
  getDailySeries,
  getDashboardSummary,
  getExpensesByCategory,
} from '../services/dashboard.service';
import {
  getActiveCollectionList,
  getAdvanceBikeList,
  getAdvanceCashList,
  getDrawnClosedList,
  getLocationList,
  getOverduePartialList,
} from '../services/list.service';
import { getTokenRegister } from '../services/token.service';
import { getEligibleList } from '../services/draw.service';
import { asyncHandler, ok } from '../utils/http';
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from '../utils/money';

export const dashboardSummaryController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getDashboardSummary(req.query as never));
});

export const dashboardCollectionsController = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { months?: string; dateFrom?: string; dateTo?: string; location?: 'MACH' | 'QUETTA' };
  const months = Number(q.months ?? 12);
  const from = q.dateFrom ? new Date(q.dateFrom) : startOfMonth(new Date());
  const to = q.dateTo ? endOfDay(new Date(q.dateTo)) : endOfDay(new Date());

  const [monthly, daily, byLocation, byMonth] = await Promise.all([
    getCollectionsSeries(months, q.location),
    getDailySeries(startOfDay(from), to, q.location),
    getCollectionsByLocation(from, to),
    getCollectionsByInstallmentMonth(from, to),
  ]);
  ok(res, { monthly, daily, byLocation, byInstallmentMonth: byMonth });
});

export const dashboardExpensesController = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { dateFrom?: string; dateTo?: string; location?: 'MACH' | 'QUETTA' };
  const from = q.dateFrom ? startOfDay(new Date(q.dateFrom)) : startOfMonth(new Date());
  const to = q.dateTo ? endOfDay(new Date(q.dateTo)) : endOfDay(new Date());
  const [daily, byCategory] = await Promise.all([
    getDailySeries(from, to, q.location),
    getExpensesByCategory(from, to, q.location),
  ]);
  ok(res, { daily, byCategory });
});

export const dashboardCashPositionController = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { dateFrom?: string; dateTo?: string };
  const from = q.dateFrom ? startOfDay(new Date(q.dateFrom)) : startOfMonth(new Date());
  const to = q.dateTo ? endOfDay(new Date(q.dateTo)) : endOfDay(new Date());
  ok(res, await getCashPosition(from, to));
});

/* ---------------------------------------------------------- automatic lists -------- */

export const activeCollectionListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getActiveCollectionList(req.query as never));
});

export const drawnClosedListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getDrawnClosedList(req.query as never));
});

export const advanceBikeListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getAdvanceBikeList(req.query as never));
});

export const advanceCashListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getAdvanceCashList(req.query as never));
});

export const overduePartialListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getOverduePartialList(req.query as never));
});

export const tokenRegisterListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getTokenRegister(req.query as never));
});

export const machListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getLocationList('MACH', req.query as never));
});

export const quettaListController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getLocationList('QUETTA', req.query as never));
});

export const drawEligibleListController = asyncHandler(async (req: Request, res: Response) => {
  const { schemeMonth, location } = req.query as { schemeMonth?: string; location?: 'MACH' | 'QUETTA' };
  ok(res, await getEligibleList(Number(schemeMonth ?? 1), 'S1', location));
});
