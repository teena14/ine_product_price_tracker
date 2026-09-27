import 'dotenv/config';
import app from './app.js';
import { validateSupabaseConfig } from './config/supabase.js';
import { closeQuoteScraperBrowser } from './scraper/priceQuoteScraper.js';
import { createDueCustomScrapePoller } from './services/scrapeJobService.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 3001;
let server;
let stopCustomScrapePoller;
let shuttingDown = false;

try {
  validateSupabaseConfig();
  server = app.listen(PORT, () => {
    logger.info('Server listening', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    });
  });
  stopCustomScrapePoller = createDueCustomScrapePoller();
} catch (error) {
  logger.error('Server failed to start', { error });
  process.exitCode = 1;
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('Server shutdown requested', { signal });

  stopCustomScrapePoller?.();

  await new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(resolve);
  });

  try {
    await closeQuoteScraperBrowser();
  } catch (error) {
    logger.error('Failed to close quote scraper browser', { error });
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
