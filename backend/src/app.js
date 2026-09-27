import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'crypto';
import productsRouter from './routes/products.js';
import trackedProductsRouter from './routes/trackedProducts.js';
import { handleInternalScrape } from './controllers/internalScrapeController.js';
import { requireCronAuth } from './middleware/cronAuth.js';
import { AppError } from './utils/errors.js';
import { isSensitiveKey, logger, redactSensitiveData } from './utils/logger.js';

const app = express();

// Server-generated correlation ID. We intentionally do not accept a caller's
// supplied value, which avoids letting one request impersonate another in logs.
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// --- Security middleware ---
app.use(helmet());

// CORS is driven entirely by the FRONTEND_URL environment variable.
// In local development set FRONTEND_URL=http://localhost:5173 in your .env file.
// In production set it to the deployed frontend origin (e.g. https://your-app.vercel.app).
// No origins are hardcoded so production never leaks a dev address and vice versa.
const allowedOrigins = new Set(
  (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- Body parsing ---
app.use(express.json());

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/products', productsRouter);
app.use('/api/tracked-products', trackedProductsRouter);
app.post('/internal/scrape', requireCronAuth, handleInternalScrape);

function safeClientDetails(details) {
  const safeDetails = redactSensitiveData(details);

  return safeDetails.map((detail) => {
    if (
      detail &&
      typeof detail === 'object' &&
      typeof detail.field === 'string' &&
      isSensitiveKey(detail.field)
    ) {
      return {
        ...detail,
        ...(Object.hasOwn(detail, 'value') ? { value: '[REDACTED]' } : {}),
        ...(Object.hasOwn(detail, 'message') ? { message: '[REDACTED]' } : {}),
      };
    }
    return detail;
  });
}

// --- Centralized error handler (must be last middleware) ---
app.use((err, req, res, _next) => {
  const isMalformedJson = err instanceof SyntaxError && err.status === 400;
  const isOperationalError = err instanceof AppError || isMalformedJson;
  let error;

  if (err instanceof AppError) {
    error = err;
  } else if (isMalformedJson) {
    error = new AppError('VALIDATION_ERROR', 'Request body must contain valid JSON', 400);
  } else {
    error = new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
  const details = Array.isArray(error.details) ? safeClientDetails(error.details) : [];
  const context = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    errorCode: error.code,
    statusCode: error.statusCode,
  };

  if (isOperationalError) {
    // Development logs retain operational stacks. Production keeps a causal
    // stack when one exists, without exposing either stack to API clients.
    logger.warn('Request failed with an operational error', {
      ...context,
      details,
      ...(process.env.NODE_ENV !== 'production' || err.cause ? { error: err } : {}),
    });
  } else {
    // Unexpected errors retain their redacted stack in server logs, including
    // production JSON logs, but never cross the API boundary.
    logger.error('Request failed unexpectedly', { ...context, error: err });
  }

  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      details,
    },
  });
});

export default app;
