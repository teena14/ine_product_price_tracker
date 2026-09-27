import { randomUUID } from 'crypto';
import { runActiveTrackedProductScrape } from './scrapeRunService.js';
import { logger } from '../utils/logger.js';

/**
 * Creates an in-process dispatcher for scheduled scrape runs.
 *
 * Render receives the cron request on its web service, so the request should
 * be acknowledged immediately instead of remaining open for the duration of
 * every product scrape. The dispatcher keeps one run active per Node process
 * to prevent an overlapping cron delivery from creating duplicate attempt
 * rows for the same tracked products.
 */
export function createScrapeJobStarter(
  {
    executeRun = runActiveTrackedProductScrape,
    createRunId = randomUUID,
    log = logger,
  } = {}
) {
  let activeJob = null;

  function start() {
    if (activeJob) {
      log.warn('Scheduled scrape trigger received while a run is already active', {
        runId: activeJob.runId,
      });
      return { runId: activeJob.runId, started: false, completion: activeJob.completion };
    }

    const runId = createRunId();
    // Deferring execution by one microtask guarantees the controller can send
    // its 202 response before the first database or browser operation starts.
    const completion = Promise.resolve()
      .then(() => executeRun({ runId }))
      .catch((error) => {
        // The request has already been acknowledged, so preserve the error in
        // server logs rather than allowing an unhandled rejection.
        log.error('Scheduled scrape run failed unexpectedly', { runId, error });
      })
      .finally(() => {
        if (activeJob?.runId === runId) {
          activeJob = null;
        }
      });

    activeJob = { runId, completion };
    return { runId, started: true, completion };
  }

  return { start };
}

const scheduledScrapeJobStarter = createScrapeJobStarter();

export function startActiveTrackedProductScrapeJob() {
  return scheduledScrapeJobStarter.start();
}
