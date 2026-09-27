import { startActiveTrackedProductScrapeJob } from '../services/scrapeJobService.js';

/**
 * POST /internal/scrape - authenticated external-cron trigger.
 *
 * The request is an acknowledgement, not a long-running scrape response.
 * This keeps cron providers from timing out while the background job records
 * each active product's result in Supabase.
 */
export function handleInternalScrape(_req, res, next) {
  try {
    const job = startActiveTrackedProductScrapeJob();

    res.status(202).json({
      ok: true,
      runId: job.runId,
      status: job.started ? 'started' : 'already_running',
    });
  } catch (error) {
    next(error);
  }
}
