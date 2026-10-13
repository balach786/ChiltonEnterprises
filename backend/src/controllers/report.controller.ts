import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { actor } from '../middleware/auth';
import {
  advancesReport,
  allCustomersReport,
  archiveReport,
  cashBankReport,
  collectionsReport,
  drawReport,
  expensesReport,
  financialSummaryReport,
  installmentScheduleReport,
  partnersReport,
  ReportBundle,
  ReportFilter,
} from '../services/report.service';
import { renderCsv, renderPdf, renderWorkbook } from '../reports/exporters';
import { asyncHandler, ok } from '../utils/http';
import { ApiError } from '../utils/ApiError';
import { writeAudit } from '../services/audit.service';

type Builder = (filter: ReportFilter, actorName: string) => Promise<ReportBundle>;

const BUILDERS: Record<string, Builder> = {
  customers: allCustomersReport,
  collections: collectionsReport,
  draws: drawReport,
  advances: advancesReport,
  expenses: expensesReport,
  partners: partnersReport,
  'cash-bank': cashBankReport,
  'financial-summary': financialSummaryReport,
  archive: (_filter, actorName) => archiveReport(actorName),
};

function filterFrom(req: Request): ReportFilter {
  const q = req.query as Record<string, string | undefined>;
  return {
    dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
    dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    location: q.location as ReportFilter['location'],
    status: q.status,
    category: q.category,
    method: q.method,
    schemeMonth: q.schemeMonth ? Number(q.schemeMonth) : undefined,
    partnerId: q.partnerId,
    customerId: q.customerId,
    tokenNumber: q.tokenNumber ? Number(q.tokenNumber) : undefined,
  };
}

async function sendReport(req: Request, res: Response, bundle: ReportBundle) {
  const format = (req.query.format as string) ?? 'xlsx';
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${bundle.reportId}-${stamp}`;

  await writeAudit({
    actor: req.user,
    action: 'EXPORT',
    entityType: 'Report',
    entityId: bundle.reportId,
    description: `Exported ${bundle.title} as ${format.toUpperCase()}`,
    newValue: { filters: bundle.filters, sheets: bundle.sheets.map((s) => ({ name: s.name, rows: s.rows.length })) },
    request: req,
  });

  if (format === 'json') {
    ok(res, bundle);
    return;
  }
  if (format === 'csv') {
    const csv = renderCsv(bundle);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    res.send(csv);
    return;
  }
  if (format === 'pdf') {
    const pdf = await renderPdf(bundle);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${base}.pdf"`);
    res.send(pdf);
    return;
  }
  if (format === 'xlsx') {
    const buf = await renderWorkbook(bundle);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    res.send(buf);
    return;
  }
  throw ApiError.badRequest(`Unsupported export format: ${format}`, 'UNSUPPORTED_FORMAT');
}

export const reportController = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type;
  const builder = BUILDERS[type];
  if (!builder) throw ApiError.notFound(`Report "${type}"`);
  const bundle = await builder(filterFrom(req), actor(req).name);
  await sendReport(req, res, bundle);
});

export const customerStatementReportController = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.params.customerId;
  if (!Types.ObjectId.isValid(customerId)) throw ApiError.badRequest('customerId must be a valid id', 'INVALID_CUSTOMER');
  const bundle = await installmentScheduleReport(customerId, actor(req).name);
  await sendReport(req, res, bundle);
});

/** Preview of a report as JSON - used by the on-screen print view. */
export const reportPreviewController = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type;
  if (type === 'customer-statement') {
    if (!req.query.customerId) throw ApiError.badRequest('customerId is required', 'CUSTOMER_REQUIRED');
    ok(res, await installmentScheduleReport(String(req.query.customerId), actor(req).name));
    return;
  }
  const builder = BUILDERS[type];
  if (!builder) throw ApiError.notFound(`Report "${type}"`);
  ok(res, await builder(filterFrom(req), actor(req).name));
});

export const reportCatalogController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, [
    { id: 'customers', name: 'All Customers', description: 'Token, name, CNIC, phone, location, joining date, fixed monthly amount, status' },
    { id: 'customer-statement', name: 'Customer Statement', description: '28-month schedule, payments, receipts, draw history, advances, closure' },
    { id: 'collections', name: 'Monthly Collections', description: 'Collections with receipt, method and allocation detail' },
    { id: 'draws', name: 'Draw Register and History', description: 'Draw month, eligible tokens, winner, confirmation and corrections' },
    { id: 'advances', name: 'Advance Bike and Cash Cases', description: 'Advance records with approval and installment behaviour' },
    { id: 'expenses', name: 'Daily and Monthly Expenses', description: 'Expense transactions split by category and classification' },
    { id: 'partners', name: 'Partner Statements', description: 'Individual ledgers plus a combined partner comparison' },
    { id: 'cash-bank', name: 'Cash and Bank Ledgers', description: 'Opening balance, receipts, payments, transfers, closing balance' },
    { id: 'financial-summary', name: 'Monthly Financial Summary', description: 'Revenue, collections, expenses, advances, withdrawals, cash position' },
    { id: 'archive', name: 'Complete Transaction Archive', description: 'Every customer, payment, draw, advance, income, expense, partner and audit record' },
  ]);
});
