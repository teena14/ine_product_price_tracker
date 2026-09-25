import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { sessionMiddleware } from './middleware/session.js';
import productsRouter from './routes/products.js';

const app = express();

// --- Security middleware ---
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // required for cross-origin cookies
  })
);

// --- Body and cookie parsing ---
app.use(express.json());
app.use(cookieParser());

// --- Anonymous session (applied to all routes except internal/scrape) ---
// Internal scrape endpoint uses CRON_SECRET auth, not session cookies.
app.use((req, res, next) => {
  if (req.path.startsWith('/internal/')) {
    return next();
  }
  return sessionMiddleware(req, res, next);
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/products', productsRouter);

// TODO (Phase 4): mount tracked-product routes
// TODO (Phase 9): mount internal scrape route

// --- Centralized error handler (must be last middleware) ---
app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Never expose stack traces in production
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${code}:`, err);
  } else {
    console.error(`[ERROR] ${code}: ${message}`);
  }

  res.status(status).json({ error: { code, message } });
});

export default app;
