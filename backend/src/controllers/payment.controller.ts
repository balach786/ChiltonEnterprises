import { Request, Response } from 'express';
import { actor } from '../middleware/auth';
import { adjustInstallment, getInstallmentsForCustomer, listInstallments } from '../services/installment.service';
import {
  allocateCredit,
  getCustomerCreditPaisa,
  getPaymentCashTrail,
  getReceipt,
  listPayments,
  recordPayment,
  reversePayment,
} from '../services/payment.service';
import { asyncHandler, ok, okPaginated } from '../utils/http';
import { amount } from '../utils/serialize';

export const listInstallmentsController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await listInstallments(req.query as never));
});

export const customerInstallmentsController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getInstallmentsForCustomer(req.params.customerId));
});

export const adjustInstallmentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await adjustInstallment({ ...req.body, user: actor(req) }), 200, 'Installment adjusted');
});

export const recordPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordPayment(req.body, actor(req));
  ok(res, result, 201, `Payment recorded${result.credit ? ' as an unallocated customer credit' : ''}`);
});

export const listPaymentsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listPayments(req.query as never);
  okPaginated(res, result.items, result.pagination);
});

export const reversePaymentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await reversePayment(req.params.id, req.body.reason, actor(req)), 200, 'Payment reversed');
});

export const receiptController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getReceipt(req.params.id));
});

export const creditController = asyncHandler(async (req: Request, res: Response) => {
  const paisa = await getCustomerCreditPaisa(req.params.customerId);
  ok(res, { customerId: req.params.customerId, credit: amount(paisa) });
});

export const allocateCreditController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await allocateCredit(req.body, actor(req)), 200, 'Credit allocated');
});

export const paymentTrailController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await getPaymentCashTrail(req.params.id));
});
