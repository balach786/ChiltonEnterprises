import bcrypt from 'bcryptjs';
import { ROLES, Role } from '../constants';
import { Permission, permissionsForRole } from '../constants/permissions';
import {
  Customer,
  FinancialAccount,
  Partner,
  PARTNER_NAMES,
  SchemeEnrollment,
  Token,
  User,
} from './helpersModels';
import { AuthUser } from '../types/express';
import { signAccessToken } from '../middleware/auth';
import { bootstrap } from '../db/bootstrap';
import { createCustomer } from '../services/customer.service';
import { ensureTokenRegister } from '../services/token.service';

export function actorFor(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '507f1f77bcf86cd799439011',
    name: `Test ${role}`,
    email: `${role}@test.local`,
    role,
    permissions: permissionsForRole(role),
    mustChangePassword: false,
    ...overrides,
  };
}

export function actorWithPermissions(role: Role, permissions: Permission[]): AuthUser {
  return actorFor(role, { permissions });
}

/** Creates the token register, partners and default accounts used by every test. */
export async function seedBase() {
  await bootstrap();
  await ensureTokenRegister();
  return {
    partners: await Partner.find({}).sort({ partnerCode: 1 }).lean(),
    accounts: await FinancialAccount.find({}).sort({ type: 1 }).lean(),
  };
}

let customerSeq = 0;

export interface TestCustomerInput {
  tokenNumber?: number;
  name?: string;
  monthlyInstallmentPkr?: number;
  location?: 'MACH' | 'QUETTA';
  cnic?: string;
  phone?: string;
  joiningDate?: Date;
}

export async function createTestCustomer(input: TestCustomerInput = {}) {
  customerSeq += 1;
  const tokenNumber = input.tokenNumber ?? (await nextFreeToken());
  const start = input.joiningDate ?? new Date();

  const result = await createCustomer(
    {
      name: input.name ?? `Test Customer ${customerSeq}`,
      cnic: input.cnic ?? uniqueCnic(),
      phone: input.phone ?? `0300${String(1000000 + customerSeq).slice(-7)}`,
      location: input.location ?? 'MACH',
      joiningDate: start,
      monthlyInstallmentPkr: input.monthlyInstallmentPkr ?? 10000,
      tokenNumber,
    },
    actorFor(ROLES.OWNER)
  );

  return { ...result, tokenNumber };
}

export async function nextFreeToken(): Promise<number> {
  const assigned = await Token.find({ status: 'assigned' }, { number: 1 }).lean();
  const taken = new Set(assigned.map((t) => t.number));
  for (let n = 1; n <= 120; n += 1) if (!taken.has(n)) return n;
  throw new Error('No free token available');
}

let cnicSeq = 1000;
export function uniqueCnic(): string {
  cnicSeq += 1;
  return `54301${String(cnicSeq).padStart(8, '0')}`;
}

export async function createTestUser(role: Role = ROLES.OWNER, email?: string) {
  const finalEmail = email ?? `${role}-${Date.now()}@test.local`;
  const user = await User.create({
    name: `Test ${role}`,
    email: finalEmail,
    passwordHash: await bcrypt.hash('Password@123', 4),
    role,
  });
  return { user, token: signAccessToken(user), password: 'Password@123' };
}

export async function getEnrollment(customerId: string) {
  return SchemeEnrollment.findOne({ customer: customerId }).lean();
}

export async function getTokenByNumber(number: number) {
  return Token.findOne({ number }).lean();
}

export async function getCustomer(id: string) {
  return Customer.findById(id).lean();
}

export { PARTNER_NAMES };
