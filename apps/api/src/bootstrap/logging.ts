type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info:  'INFO ',
  warn:  'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

/**
 * Structured logger.
 *
 * Usage:
 *   log('Server started on port 3000')             // info by default
 *   log('Tenant not found', 'warn', { tenantId })
 *   log('DB connection failed', 'fatal')
 *
 * In production, output is a single JSON line per event for easy ingestion
 * by log aggregators (Loki, Datadog, Cloudwatch, etc.).
 * In development, output is human-readable coloured text.
 */
export function log(
  message: string,
  level: LogLevel = 'info',
  meta?: Record<string, unknown>,
): void {
  const ts = new Date().toISOString();
  const prefix = LEVEL_PREFIX[level];

  if (process.env.NODE_ENV === 'production') {
    // JSON format for log aggregators
    const entry: Record<string, unknown> = { ts, level, msg: message };
    if (meta && Object.keys(meta).length > 0) entry.meta = meta;
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    // Human-readable for development
    const time = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
    const metaStr = meta && Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
    const line = `${time} [${prefix}] ${message}${metaStr}`;

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}

/**
 * Convenience wrappers — useful for one-liner imports.
 */
export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log(msg, 'debug', meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log(msg, 'info',  meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log(msg, 'warn',  meta),
  error: (msg: string, meta?: Record<string, unknown>) => log(msg, 'error', meta),
  fatal: (msg: string, meta?: Record<string, unknown>) => log(msg, 'fatal', meta),
};
