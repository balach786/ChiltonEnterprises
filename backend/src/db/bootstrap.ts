import bcrypt from 'bcryptjs';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { PARTNER_SEED, ROLES } from '../constants';
import {
  AuditLog,
  BackupRecord,
  CashMovement,
  Counter,
  Customer,
  CustomerAdvance,
  CustomerClosure,
  DrawEvent,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  Installment,
  Partner,
  PartnerTransaction,
  Payment,
  Receipt,
  Reconciliation,
  SchemeEnrollment,
  Settings,
  Token,
  tokenCode,
  Transfer,
  User,
} from '../models';
import { ensureTokenRegister } from '../services/token.service';
import { SCHEME } from '../constants';

/**
 * Idempotent first-run setup:
 *  - the 120-slot token register (Token 001 - Token 120)
 *  - the three partner accounts (Irfan, Ghulam Muhammad, Hafiz Khalid)
 *  - a default cash and bank account with a zero opening balance
 *  - global settings
 *  - an initial administrator account (only when none exists)
 *
 * No business data is invented here - opening balances are zero until the owner enters
 * the real figures through the migration workflow.
 */
export async function bootstrap(): Promise<void> {
  await Settings.updateOne({}, { $setOnInsert: {} }, { upsert: true, setDefaultsOnInsert: true });

  const tokenCount = await Token.countDocuments({});
  if (tokenCount < SCHEME.TOTAL_TOKEN_SLOTS) {
    await ensureTokenRegister();
    logger.info(`Token register initialised with ${SCHEME.TOTAL_TOKEN_SLOTS} slots (${tokenCode(1)}-${tokenCode(SCHEME.TOTAL_TOKEN_SLOTS)})`);
  }

  for (const partner of PARTNER_SEED) {
    await Partner.updateOne(
      { partnerCode: partner.code },
      { $setOnInsert: { partnerCode: partner.code, name: partner.name, isActive: true } },
      { upsert: true }
    );
  }

  await FinancialAccount.updateOne(
    { code: 'ACC-CASH-MAIN' },
    {
      $setOnInsert: {
        code: 'ACC-CASH-MAIN',
        name: 'Showroom Cash',
        type: 'CASH',
        openingBalancePaisa: 0,
        balancePaisa: 0,
        isDefault: true,
        isActive: true,
        location: 'ALL',
      },
    },
    { upsert: true }
  );
  await FinancialAccount.updateOne(
    { code: 'ACC-BANK-MAIN' },
    {
      $setOnInsert: {
        code: 'ACC-BANK-MAIN',
        name: 'Showroom Bank Account',
        type: 'BANK',
        openingBalancePaisa: 0,
        balancePaisa: 0,
        isDefault: true,
        isActive: true,
        location: 'ALL',
      },
    },
    { upsert: true }
  );

  const userCount = await User.countDocuments({});
  if (userCount === 0 && config.seedDefaultAdmin) {
    await User.create({
      name: 'System Administrator',
      email: config.defaultAdminEmail,
      passwordHash: await bcrypt.hash(config.defaultAdminPassword, config.bcryptRounds),
      role: ROLES.OWNER,
      mustChangePassword: true,
    });
    logger.warn(
      `Created the initial administrator (${config.defaultAdminEmail}). Change this password immediately after the first login.`
    );
  }

  // Create missing indexes and drop stale ones so the schema is the single source of truth.
  const models = [
    User, Token, Customer, SchemeEnrollment, Installment, Payment, Receipt, Counter, DrawEvent,
    CustomerClosure, CustomerAdvance, IncomeTransaction, ExpenseTransaction, Partner,
    PartnerTransaction, FinancialAccount, CashMovement, Transfer, Reconciliation, AuditLog,
    Settings, BackupRecord,
  ];
  await Promise.all(models.map((m) => m.syncIndexes().catch(() => undefined)));
}
