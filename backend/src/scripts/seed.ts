/* eslint-disable no-console */
import bcrypt from 'bcryptjs';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { bootstrap } from '../db/bootstrap';
import { config } from '../config/env';
import { ROLES } from '../constants';
import { Customer, FinancialAccount, Partner, SchemeEnrollment, Token, User } from '../models';
import { createCustomer } from '../services/customer.service';
import { recordPayment } from '../services/payment.service';
import { createExpense, createPartnerTransaction, createTransfer } from '../services/finance.service';
import { createAdvance } from '../services/advance.service';
import { AuthUser } from '../types/express';

/**
 * Seed script.
 *
 *  npm run seed       -> infrastructure only (users, token register, partners, accounts)
 *  npm run seed:demo  -> plus a small, clearly labelled demonstration data set
 *
 * Real production data must arrive through the migration/import workflow
 * (`npm run import:csv`) so that historical values are never invented.
 */

const adminActor: AuthUser = {
  id: '000000000000000000000000',
  name: 'Seed Script',
  email: 'seed@local',
  role: ROLES.OWNER,
  permissions: ['customer:create', 'payment:create', 'advance:create', 'expense:create', 'partner:txn:create', 'transfer:create'],
  mustChangePassword: false,
};

async function seedUsers() {
  const users = [
    { name: 'System Administrator', email: 'admin@showroom.local', role: ROLES.OWNER, password: 'Admin@12345' },
    { name: 'Accounts Officer', email: 'accountant@showroom.local', role: ROLES.ACCOUNTANT, password: 'Account@12345' },
    { name: 'Front Desk Staff', email: 'staff@showroom.local', role: ROLES.CUSTOMER_SERVICE, password: 'Staff@12345' },
    { name: 'Draw Manager', email: 'draw@showroom.local', role: ROLES.DRAW_MANAGER, password: 'Draw@12345' },
    { name: 'Read Only Viewer', email: 'viewer@showroom.local', role: ROLES.VIEWER, password: 'Viewer@12345' },
  ];

  for (const u of users) {
    const existing = await User.findOne({ email: u.email });
    if (existing) continue;
    await User.create({
      name: u.name,
      email: u.email,
      passwordHash: await bcrypt.hash(u.password, config.bcryptRounds),
      role: u.role,
      mustChangePassword: false,
    });
    console.log(`  + user ${u.email} (${u.role}) password: ${u.password}`);
  }
}

const DEMO_CUSTOMERS = [
  { name: 'Abdul Rehman', cnic: '5430112345671', phone: '03001234567', location: 'MACH' as const, monthly: 12000 },
  { name: 'Muhammad Aslam', cnic: '5430112345672', phone: '03011234568', location: 'MACH' as const, monthly: 15000 },
  { name: 'Ghulam Nabi', cnic: '5430112345673', phone: '03331234569', location: 'QUETTA' as const, monthly: 10000 },
  { name: 'Khalid Mehmood', cnic: '5430112345674', phone: '03451234570', location: 'QUETTA' as const, monthly: 12000 },
  { name: 'Noor Muhammad', cnic: '5430112345675', phone: '03121234571', location: 'MACH' as const, monthly: 18000 },
  { name: 'Sanaullah Khan', cnic: '5430112345676', phone: '03211234572', location: 'QUETTA' as const, monthly: 12000 },
];

async function seedDemoData() {
  const existing = await Customer.countDocuments({});
  if (existing > 0) {
    console.log('  ! demo customers already present - skipping demo data');
    return;
  }

  const freeTokens = await Token.find({ status: 'unassigned' }).sort({ number: 1 }).limit(DEMO_CUSTOMERS.length).lean();

  for (let i = 0; i < DEMO_CUSTOMERS.length; i += 1) {
    const c = DEMO_CUSTOMERS[i];
    const token = freeTokens[i];
    if (!token) break;

    const start = new Date();
    start.setMonth(start.getMonth() - 6);

    const created = await createCustomer(
      {
        name: c.name,
        cnic: c.cnic,
        phone: c.phone,
        location: c.location,
        joiningDate: start,
        monthlyInstallmentPkr: c.monthly,
        tokenNumber: token.number,
      },
      adminActor
    );

    console.log(`  + customer ${c.name} on token ${String(token.number).padStart(3, '0')} (${created.installmentCount} installments)`);

    // Record the first three months of payments (one partial to exercise that path).
    for (let month = 1; month <= 3; month += 1) {
      const amount = month === 2 ? c.monthly / 2 : c.monthly;
      await recordPayment(
        {
          customerId: String((created.customer as unknown as { _id: unknown })._id),
          monthNumbers: [month],
          amountPkr: amount,
          method: month === 3 ? 'BANK' : 'CASH',
        },
        adminActor
      );
    }
  }

  const customers = await Customer.find({}).sort({ createdAt: 1 }).limit(3).lean();
  const enrollments = await SchemeEnrollment.find({}).sort({ createdAt: 1 }).limit(3).lean();

  if (customers[0]) {
    await createAdvance(
      {
        customerId: String(customers[0]._id),
        enrollmentId: String(enrollments[0]?._id),
        type: 'BIKE',
        advanceDate: new Date(),
        amountPkr: 185000,
        bikeModel: 'Honda CD 70',
        bikeDescription: 'Red Honda CD 70, new',
        approver: 'Owner',
        authorizedBy: 'Owner',
        supportingReference: 'ADV-REF-001',
      },
      adminActor
    );
    console.log('  + advance bike case');
  }

  if (customers[1]) {
    await createAdvance(
      {
        customerId: String(customers[1]._id),
        enrollmentId: String(enrollments[1]?._id),
        type: 'CASH',
        advanceDate: new Date(),
        amountPkr: 45000,
        method: 'CASH',
        purpose: 'Advance cash agreed before draw',
        approver: 'Owner',
      },
      adminActor
    );
    console.log('  + advance cash case');
  }

  await createExpense(
    { category: 'UTILITY_BILLS', amountPkr: 8500, purpose: 'Electricity bill', paidTo: 'QESCO', method: 'CASH' },
    adminActor
  );
  await createExpense(
    { category: 'DAILY_FOOD', amountPkr: 3200, purpose: 'Shop meals', method: 'CASH' },
    adminActor
  );
  await createExpense(
    { category: 'TRAVELING', amountPkr: 6400, purpose: 'Mach to Quetta trip', method: 'CASH' },
    adminActor
  );
  console.log('  + operating expenses');

  const partners = await Partner.find({}).sort({ partnerCode: 1 }).lean();
  if (partners[0]) {
    await createPartnerTransaction(String(partners[0]._id), { type: 'WITHDRAWAL', amountPkr: 25000, purpose: 'Personal withdrawal', method: 'CASH' }, adminActor);
    console.log('  + partner withdrawal');
  }
  if (partners[1]) {
    await createPartnerTransaction(String(partners[1]._id), { type: 'CONTRIBUTION', amountPkr: 100000, purpose: 'Capital contribution', method: 'BANK' }, adminActor);
    console.log('  + partner contribution');
  }

  const accounts = await FinancialAccount.find({ isActive: true }).lean();
  const cash = accounts.find((a) => a.type === 'CASH');
  const bank = accounts.find((a) => a.type === 'BANK');
  if (cash && bank) {
    await createTransfer(
      { fromAccountId: String(bank._id), toAccountId: String(cash._id), amountPkr: 20000, notes: 'Cash top-up for the counter' },
      adminActor
    );
    console.log('  + bank to cash transfer');
  }
}

async function main() {
  await connectMongo();
  await bootstrap();
  console.log('Seeding base configuration...');
  await seedUsers();

  if (process.env.SEED_DEMO === '1') {
    console.log('Seeding DEMO data (labelled demonstration records only)...');
    await seedDemoData();
  }

  console.log('Seed complete.');
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
