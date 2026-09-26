import { jest } from '@jest/globals';
import { createLogger, redactSensitiveData } from '../src/utils/logger.js';

function createSink() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe('logger', () => {
  test('redacts nested secrets and never mutates the original context', () => {
    const sink = createSink();
    const logger = createLogger({ environment: 'production', level: 'debug', sink });
    const context = {
      token: 'top-level-token',
      headers: {
        Authorization: 'Bearer nested-token',
        Cookie: 'session=secret-cookie',
      },
      user: {
        credentials: {
          Password: 'nested-password',
          apiKey: 'nested-api-key',
        },
      },
      attempts: [{ refreshToken: 'array-token' }],
    };
    context.self = context;

    logger.info('request token=message-token', context);

    const entry = JSON.parse(sink.log.mock.calls[0][0]);
    expect(entry.token).toBe('[REDACTED]');
    expect(entry.headers.Authorization).toBe('[REDACTED]');
    expect(entry.headers.Cookie).toBe('[REDACTED]');
    expect(entry.user.credentials).toBe('[REDACTED]');
    expect(entry.attempts[0].refreshToken).toBe('[REDACTED]');
    expect(entry.self).toBe('[Circular]');
    expect(entry.message).toContain('[REDACTED]');

    expect(context.token).toBe('top-level-token');
    expect(context.headers.Authorization).toBe('Bearer nested-token');
    expect(context.user.credentials.Password).toBe('nested-password');
    expect(context.attempts[0].refreshToken).toBe('array-token');
  });

  test('keeps a redacted Error stack in production error logs', () => {
    const sink = createSink();
    const logger = createLogger({ environment: 'production', sink });
    const error = new Error('database password=super-secret postgresql://user:db-password@example.test/db');
    error.authorization = 'Bearer should-not-log';

    logger.error('scrape failed', { error, runId: 'run-123' });

    const entry = JSON.parse(sink.error.mock.calls[0][0]);
    expect(entry.error.stack).toContain('[REDACTED]');
    expect(entry.error.stack).not.toContain('db-password');
    expect(entry.error.authorization).toBe('[REDACTED]');
    expect(entry.runId).toBe('run-123');
  });

  test('uses readable development output and supports all log levels', () => {
    const sink = createSink();
    const logger = createLogger({ environment: 'development', level: 'debug', sink });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(sink.log.mock.calls.map(([line]) => line)).toEqual([
      '[DEBUG] debug message',
      '[INFO] info message',
    ]);
    expect(sink.warn).toHaveBeenCalledWith('[WARN] warn message');
    expect(sink.error).toHaveBeenCalledWith('[ERROR] error message');
  });

  test('suppresses debug in production by default and obeys a configured threshold', () => {
    const productionSink = createSink();
    createLogger({ environment: 'production', sink: productionSink }).debug('hidden');
    expect(productionSink.log).not.toHaveBeenCalled();

    const warningSink = createSink();
    const warningLogger = createLogger({ environment: 'development', level: 'warn', sink: warningSink });
    warningLogger.info('hidden');
    warningLogger.warn('shown');

    expect(warningSink.log).not.toHaveBeenCalled();
    expect(warningSink.warn).toHaveBeenCalledWith('[WARN] shown');
  });

  test('handles standalone Error values, circular references, arrays, and null', () => {
    const error = new Error('cookie=not-visible');
    const value = { error, values: [null, { serviceRoleKey: 'nope' }] };
    value.loop = value;

    const safe = redactSensitiveData(value);

    expect(safe.error.message).toContain('[REDACTED]');
    expect(safe.values).toEqual([null, { serviceRoleKey: '[REDACTED]' }]);
    expect(safe.loop).toBe('[Circular]');
  });

  test('accepts null and array contexts without failing', () => {
    const sink = createSink();
    const logger = createLogger({ environment: 'production', level: 'debug', sink });

    logger.info('null context', null);
    logger.debug('array context', [{ token: 'hidden' }]);

    expect(JSON.parse(sink.log.mock.calls[0][0])).not.toHaveProperty('context');
    expect(JSON.parse(sink.log.mock.calls[1][0]).context).toEqual([{ token: '[REDACTED]' }]);
  });

  test('bounds very large string values before logging', () => {
    const safe = redactSensitiveData({ payload: 'x'.repeat(5_000) });

    expect(safe.payload).toContain('[Truncated]');
    expect(safe.payload.length).toBeLessThan(4_200);
  });
});
