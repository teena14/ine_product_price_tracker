import { runActiveTrackedProductScrape } from '../services/scrapeRunService.js';

/**
 * POST /internal/scrape - authenticated external-cron trigger.
 *
 * The response intentionally omits the per-product `results` array so the
 * payload stays small (a few bytes) and never triggers cron-job.org's
 * "output too large" limit regardless of how many products are tracked.
 * Full per-product outcome data is still written to server logs by the
 * scrape run service.
 */
export async function handleInternalScrape(req, res, next) {
  try {
    const summary = await runActiveTrackedProductScrape();
    // Return only the small summary — omit the verbose per-product results array.
    res.json({
      ok: true,
      runId: summary.runId,
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed,
    });
  } catch (error) {
    next(error);
  }
}
