/**
 * Application configuration. Every value comes from the environment; required values are
 * validated at startup and errors never echo secret values back (PRD section 11).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPath = process.env.ENV_FILE ?? path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  isTest: boolean;
  port: number;
  mongoUri: string;
  dbName: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshExpiresIn: string;
  frontendUrls: string[];
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authRateLimitMax: number;
  bcryptRounds: number;
  trustProxy: boolean | number;
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  useTransactions: boolean;
  seedDefaultAdmin: boolean;
  defaultAdminEmail: string;
  defaultAdminPassword: string;
  uploadsDir: string;
  maxUploadMb: number;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const env = (process.env.NODE_ENV ?? 'development') as AppConfig['env'];
  const isTest = env === 'test';
  const isProduction = env === 'production';

  const jwtSecret = process.env.JWT_SECRET ?? '';
  const mongoUri = process.env.MONGODB_URI ?? '';

  const problems: string[] = [];
  if (!mongoUri) problems.push('MONGODB_URI is required (e.g. mongodb://127.0.0.1:27017/showroom)');
  if (!jwtSecret) problems.push('JWT_SECRET is required (use a long random string)');
  else if (jwtSecret.length < 16) problems.push('JWT_SECRET must be at least 16 characters long');

  if (problems.length > 0 && !isTest) {
    // Deliberately avoids printing any secret material.
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n` +
        `Copy .env.example to .env and fill in the values.`
    );
  }

  const frontendUrls = list('FRONTEND_URL', ['http://localhost:5173']);
  const corsOrigins = list('CORS_ORIGINS', frontendUrls);

  cached = {
    env,
    isProduction,
    isTest,
    port: int('PORT', 4000),
    mongoUri,
    dbName: process.env.MONGODB_DB ?? (isTest ? 'showroom_test' : 'showroom'),
    jwtSecret: jwtSecret || 'test-only-insecure-jwt-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    frontendUrls,
    corsOrigins,
    rateLimitWindowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    rateLimitMax: int('RATE_LIMIT_MAX', 600),
    authRateLimitMax: int('AUTH_RATE_LIMIT_MAX', 30),
    bcryptRounds: int('BCRYPT_ROUNDS', 10),
    trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || true : false,
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) ?? (isTest ? 'silent' : 'info'),
    useTransactions: bool('USE_TRANSACTIONS', true),
    seedDefaultAdmin: bool('SEED_DEFAULT_ADMIN', true),
    defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@showroom.local',
    defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMe@123',
    uploadsDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads'),
    maxUploadMb: int('MAX_UPLOAD_MB', 5),
  };

  return cached;
}

/** Test helper: reset the memoised config after mutating process.env. */
export function resetConfigCache(): void {
  cached = null;
}

export const config = loadConfig();
