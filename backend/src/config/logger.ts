import { config } from './env';

const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function write(level: 'error' | 'warn' | 'info' | 'debug', message: string, meta?: unknown) {
  const current = LEVELS[config.logLevel ?? 'info'];
  if (config.logLevel === 'silent' || current === undefined || LEVELS[level] > current) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta === undefined) out(line);
  else out(line, meta);
}

export const logger = {
  error: (m: string, meta?: unknown) => write('error', m, meta),
  warn: (m: string, meta?: unknown) => write('warn', m, meta),
  info: (m: string, meta?: unknown) => write('info', m, meta),
  debug: (m: string, meta?: unknown) => write('debug', m, meta),
};
