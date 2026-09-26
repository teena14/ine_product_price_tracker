import { runActiveTrackedProductScrape } from '../services/scrapeRunService.js';

/** POST /internal/scrape - authenticated external-cron trigger. */
export async function handleInternalScrape(req, res, next) {
  try {
    const summary = await runActiveTrackedProductScrape();
    res.json({
      runId: summary.runId,
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed,
    });
  } catch (error) {
    next(error);
  }
}
