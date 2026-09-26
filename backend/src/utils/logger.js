/**
 * Small structured logger with centralized, non-mutating secret redaction.
 * Production emits one JSON object per line; development stays readable.
 */

const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';
const TRUNCATED = '[Truncated]';
const MAX_STRING_LENGTH = 4_096;
const LEVEL_PRIORITY = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 99 });
const SENSITIVE_EXACT_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'secret',
  'apikey',
  'cronsecret',
  'servicerolekey',
  'supabaseservicerolekey',
  'sessiontoken',
  'sessionid',
  'credential',
  'credentials',
]);

function normalizedKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isSensitiveKey(key) {
  const keyName = normalizedKey(key);

  return (
    SENSITIVE_EXACT_KEYS.has(keyName) ||
    keyName.includes('authorization') ||
    keyName.includes('cookie') ||
    keyName.includes('token') ||
    keyName.includes('password') ||
    keyName.includes('secret') ||
    keyName.includes('apikey') ||
    keyName.includes('credential')
  );
}

function redactString(value) {
  const bounded = value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED}` : value;

  return bounded
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(/(bearer\s+)[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(
      /((?:token|password|secret|api[_-]?key|authorization|cookie)\s*[=:]\s*)[^\s,;]+/gi,
      `$1${REDACTED}`
    )
    .replace(
      /([?&](?:access[_-]?token|refresh[_-]?token|token|secret|api[_-]?key|password)=)[^&\s]+/gi,
      `$1${REDACTED}`
    );
}

/**
 * Produces a bounded deep clone suitable for logs. It never mutates `value`.
 * Sensitive fields are redacted at any depth, including objects in arrays.
 * Circular values, large containers, buffers, and functions are represented
 * safely instead of being allowed to crash logging.
 */
export function redactSensitiveData(value, options = {}) {
  const maxDepth = options.maxDepth ?? 6;
  const maxArrayLength = options.maxArrayLength ?? 50;
  const maxObjectKeys = options.maxObjectKeys ?? 100;
  const seen = new WeakSet();

  function visit(input, depth) {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return redactString(input);
    }
    if (typeof input === 'number' || typeof input === 'boolean') {
      return input;
    }
    if (typeof input === 'bigint') {
      return input.toString();
    }
    if (typeof input === 'symbol') {
      return input.toString();
    }
    if (typeof input === 'function') {
      return `[Function ${input.name || 'anonymous'}]`;
    }
    if (depth >= maxDepth) {
      return TRUNCATED;
    }
    if (Buffer.isBuffer(input)) {
      return `[Buffer length=${input.length}]`;
    }
    if (input instanceof Date) {
      return Number.isNaN(input.getTime()) ? '[Invalid Date]' : input.toISOString();
    }
    if (seen.has(input)) {
      return CIRCULAR;
    }

    seen.add(input);

    if (input instanceof Error) {
      const error = {
        name: input.name,
        message: redactString(input.message || ''),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.statusCode !== undefined ? { statusCode: input.statusCode } : {}),
        ...(input.details !== undefined ? { details: visit(input.details, depth + 1) } : {}),
        ...(input.stack ? { stack: redactString(input.stack) } : {}),
        ...(input.cause ? { cause: visit(input.cause, depth + 1) } : {}),
      };

      for (const key of Object.keys(input).slice(0, maxObjectKeys)) {
        if (!(key in error)) {
          error[key] = isSensitiveKey(key) ? REDACTED : visit(input[key], depth + 1);
        }
      }

      return error;
    }

    if (Array.isArray(input)) {
      const values = input.slice(0, maxArrayLength).map((item) => visit(item, depth + 1));
      if (input.length > maxArrayLength) {
        values.push(TRUNCATED);
      }
      return values;
    }

    if (input instanceof Map) {
      return visit(Object.fromEntries(input.entries()), depth + 1);
    }
    if (input instanceof Set) {
      return visit([...input], depth + 1);
    }

    const output = {};
    const keys = Object.keys(input);
    for (const key of keys.slice(0, maxObjectKeys)) {
      output[key] = isSensitiveKey(key) ? REDACTED : visit(input[key], depth + 1);
    }
    if (keys.length > maxObjectKeys) {
      output.__truncatedKeys = keys.length - maxObjectKeys;
    }

    return output;
  }

  return visit(value, 0);
}

function resolveLevel(level, environment) {
  const defaultLevel = environment === 'production' ? 'info' : environment === 'test' ? 'silent' : 'debug';
  const candidate = String(level || defaultLevel).toLowerCase();
  return LEVEL_PRIORITY[candidate] === undefined ? defaultLevel : candidate;
}

function writeToSink(sink, level, output) {
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  const writer = sink[method] || sink.log;
  writer.call(sink, output);
}

/**
 * Factory exported for deterministic tests. The application uses `logger`.
 */
export function createLogger({
  environment = process.env.NODE_ENV || 'development',
  level = process.env.LOG_LEVEL,
  sink = console,
} = {}) {
  const threshold = LEVEL_PRIORITY[resolveLevel(level, environment)];

  function log(logLevel, message, context = {}) {
    if (LEVEL_PRIORITY[logLevel] < threshold) {
      return;
    }

    const redactedContext = redactSensitiveData(context);
    const safeContext =
      redactedContext && typeof redactedContext === 'object' && !Array.isArray(redactedContext)
        ? redactedContext
        : redactedContext === null || redactedContext === undefined
          ? {}
          : { context: redactedContext };
    const entry = {
      ...safeContext,
      timestamp: new Date().toISOString(),
      level: logLevel,
      message: redactString(String(message)),
    };

    if (environment === 'production') {
      writeToSink(sink, logLevel, JSON.stringify(entry));
      return;
    }

    const contextText = Object.keys(safeContext).length ? ` ${JSON.stringify(safeContext)}` : '';
    writeToSink(sink, logLevel, `[${logLevel.toUpperCase()}] ${entry.message}${contextText}`);
  }

  return {
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    debug: (message, context) => log('debug', message, context),
  };
}

export const logger = createLogger();
