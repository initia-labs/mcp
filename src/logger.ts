export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let current: LogLevel = 'info';

export function setLogLevel(level: LogLevel) { current = level; }

function shouldLog(level: LogLevel) { return LEVELS[level] >= LEVELS[current]; }

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => shouldLog('debug') && write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => shouldLog('info') && write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => shouldLog('warn') && write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => shouldLog('error') && write('error', msg, meta),
};

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta }) + '\n');
}
