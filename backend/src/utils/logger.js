/**
 * Minimal structured logger.
 *
 * Outputs JSON lines in production so log aggregators can parse fields.
 * Falls back to readable output in development.
 *
 * Usage:
 *   logger.info('scrape started', { runId, trackedProductId });
 *   logger.error('scrape failed', { runId, errorCode, durationMs });
 */

const isProd = process.env.NODE_ENV === 'production';

function log(level, message, context = {}) {
  // Never log secrets
  const safeContext = { ...context };
  delete safeContext.authorization;
  delete safeContext.cronSecret;
  delete safeContext.token;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...safeContext,
  };

  if (isProd) {
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
  } else {
    const ctx = Object.keys(safeContext).length
      ? ` ${JSON.stringify(safeContext)}`
      : '';
    console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}${ctx}`);
  }
}

export const logger = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
  debug: (message, context) => {
    if (process.env.NODE_ENV !== 'production') {
      log('debug', message, context);
    }
  },
};
