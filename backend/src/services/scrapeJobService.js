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

  function start(runOptions = {}) {
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
      .then(() => executeRun({ runId, ...runOptions }))
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

export function startActiveTrackedProductScrapeJob(runOptions) {
  return scheduledScrapeJobStarter.start(runOptions);
}

/**
 * Checks persistent next_scrape_at values on a short interval so a custom
 * five-minute schedule is actually executed even when the global cron runs
 * less often. The shared job starter prevents overlap with a cron-triggered
 * all-products scrape.
 */
export function createDueCustomScrapePoller(
  {
    startJob = startActiveTrackedProductScrapeJob,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    intervalMs = 60_000,
    log = logger,
  } = {}
) {
  function poll() {
    try {
      const job = startJob({ customOnly: true });
      if (!job.started) {
        log.info('Custom scrape poll skipped because another scrape run is active', {
          runId: job.runId,
        });
      }
    } catch (error) {
      log.error('Custom scrape poll could not start', { error });
    }
  }

  poll();
  const intervalId = setIntervalFn(poll, intervalMs);
  intervalId?.unref?.();

  return () => clearIntervalFn(intervalId);
}
