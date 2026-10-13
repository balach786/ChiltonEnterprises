/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { bootstrap } from '../db/bootstrap';
import { ROLES } from '../constants';
import { Customer, Token } from '../models';
import { createCustomer, isValidCnic, isValidPhone } from '../services/customer.service';
import { recordPayment } from '../services/payment.service';
import { normalizeCnic } from '../models/Customer';
import { AuthUser } from '../types/express';

/**
 * Historical data migration (PRD p.16 "Initial data migration").
 *
 * Usage:
 *   npm run import:csv -- ./data/customers.csv [--payments ./data/payments.csv] [--dry-run]
 *
 * Customer CSV columns (header row required):
 *   tokenNumber,name,cnic,phone,location,joiningDate,monthlyInstallment[,fatherName,address,notes]
 *
 * Payment CSV columns:
 *   tokenNumber,monthNumber,amount,date,method[,notes]
 *
 * Every row is validated before anything is written; the script reports duplicates and
 * rejects them instead of inventing values.
 */

const migrationActor: AuthUser = {
  id: '000000000000000000000000',
  name: 'Migration Script',
  email: 'migration@local',
  role: ROLES.OWNER,
  permissions: ['customer:create', 'payment:create'],
  mustChangePassword: false,
};

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

async function importCustomers(file: string, dryRun: boolean) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  console.log(`Reading ${rows.length} customer rows from ${file}`);

  const existingCnics = new Set((await Customer.find({}, { cnic: 1 }).lean()).map((c) => c.cnic));
  const assignedTokens = new Set((await Token.find({ status: 'assigned' }, { number: 1 }).lean()).map((t) => t.number));

  const errors: string[] = [];
  const seenTokens = new Set<number>();
  const seenCnics = new Set<string>();
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    const lineNo = index + 2;
    const tokenNumber = Number(row.tokennumber ?? row.token);
    const name = row.name;
    const cnic = normalizeCnic(row.cnic);
    const phone = row.phone;
    const location = String(row.location ?? '').toUpperCase();

    const problems: string[] = [];
    if (!Number.isInteger(tokenNumber) || tokenNumber < 1 || tokenNumber > 120) problems.push('tokenNumber must be 1-120');
    if (!name) problems.push('name is required');
    if (!isValidCnic(cnic)) problems.push('cnic must be 13 digits');
    if (!isValidPhone(phone)) problems.push('phone must be a valid Pakistani number');
    if (!['MACH', 'QUETTA'].includes(location)) problems.push('location must be MACH or QUETTA');
    const monthly = Number(row.monthlyinstallment ?? row.monthly);
    if (!Number.isFinite(monthly) || monthly <= 0) problems.push('monthlyInstallment must be positive');
    const joiningDate = new Date(row.joiningdate);
    if (Number.isNaN(joiningDate.getTime())) problems.push('joiningDate must be a valid date');

    if (seenTokens.has(tokenNumber)) problems.push('duplicate token inside the import file');
    if (assignedTokens.has(tokenNumber)) problems.push('token already assigned in the database');
    if (seenCnics.has(cnic)) problems.push('duplicate CNIC inside the import file');
    if (existingCnics.has(cnic)) problems.push('CNIC already exists in the database');

    if (problems.length > 0) {
      errors.push(`line ${lineNo} (token ${tokenNumber || '?'}): ${problems.join('; ')}`);
      continue;
    }

    seenTokens.add(tokenNumber);
    seenCnics.add(cnic);

    if (dryRun) {
      imported += 1;
      continue;
    }

    try {
      await createCustomer(
        {
          name,
          cnic,
          phone,
          location: location as 'MACH' | 'QUETTA',
          joiningDate,
          monthlyInstallmentPkr: monthly,
          tokenNumber,
          fatherName: row.fathername,
          address: row.address,
          notes: row.notes,
        },
        migrationActor
      );
      imported += 1;
    } catch (err) {
      errors.push(`line ${lineNo} (token ${tokenNumber}): ${(err as Error).message}`);
    }
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}imported ${imported} customers, ${errors.length} rejected`);
  errors.slice(0, 40).forEach((e) => console.log(`  ! ${e}`));
  if (errors.length > 40) console.log(`  ! ...and ${errors.length - 40} more`);
  return { imported, errors };
}

async function importPayments(file: string, dryRun: boolean) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  console.log(`Reading ${rows.length} payment rows from ${file}`);

  const enrollments = await (await import('../models/SchemeEnrollment')).SchemeEnrollment.find({})
    .select('customer tokenNumber')
    .lean();
  const byToken = new Map(enrollments.map((e) => [e.tokenNumber, e]));

  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const lineNo = index + 2;
    const tokenNumber = Number(row.tokennumber ?? row.token);
    const monthNumber = Number(row.monthnumber ?? row.month);
    const amount = Number(row.amount);
    const enrollment = byToken.get(tokenNumber);

    if (!enrollment) {
      errors.push(`line ${lineNo}: no enrollment for token ${tokenNumber}`);
      continue;
    }
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 28) {
      errors.push(`line ${lineNo}: monthNumber must be 1-28`);
      continue;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`line ${lineNo}: amount must be positive`);
      continue;
    }

    if (dryRun) {
      imported += 1;
      continue;
    }

    try {
      await recordPayment(
        {
          customerId: String(enrollment.customer),
          enrollmentId: String(enrollment._id),
          monthNumbers: [monthNumber],
          amountPkr: amount,
          paymentDate: row.date ? new Date(row.date) : new Date(),
          method: (row.method?.toUpperCase() as never) ?? 'CASH',
          notes: row.notes ?? 'Imported historical payment',
        },
        migrationActor
      );
      imported += 1;
    } catch (err) {
      errors.push(`line ${lineNo} (token ${tokenNumber} month ${monthNumber}): ${(err as Error).message}`);
    }
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}imported ${imported} payments, ${errors.length} rejected`);
  errors.slice(0, 40).forEach((e) => console.log(`  ! ${e}`));
  return { imported, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const customerFile = args.find((a) => !a.startsWith('--') && a !== 'dry-run');
  const paymentsIdx = args.indexOf('--payments');
  const paymentFile = paymentsIdx >= 0 ? args[paymentsIdx + 1] : undefined;

  if (!customerFile) {
    console.log('Usage: npm run import:csv -- <customers.csv> [--payments <payments.csv>] [--dry-run]');
    console.log(`Example file: ${path.resolve(__dirname, '../../../docs/sample-customers.csv')}`);
    process.exit(1);
  }

  await connectMongo();
  await bootstrap();

  await importCustomers(customerFile, dryRun);
  if (paymentFile) await importPayments(paymentFile, dryRun);

  console.log(dryRun ? 'Dry run complete - nothing was written.' : 'Import complete. The owner must now review and approve opening balances.');
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
