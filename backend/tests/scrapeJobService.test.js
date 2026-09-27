import { jest } from '@jest/globals';
import { createScrapeJobStarter } from '../src/services/scrapeJobService.js';

function createLog() {
  return { warn: jest.fn(), error: jest.fn() };
}

describe('scheduled scrape job dispatcher', () => {
  test('accepts a job immediately and starts the all-active scrape after the response can be sent', async () => {
    const executeRun = jest.fn().mockResolvedValue({ total: 2 });
    const starter = createScrapeJobStarter({
      executeRun,
      createRunId: () => 'run-accepted',
      log: createLog(),
    });

    const job = starter.start();

    expect(job).toMatchObject({ runId: 'run-accepted', started: true });
    expect(executeRun).not.toHaveBeenCalled();

    await job.completion;

    expect(executeRun).toHaveBeenCalledWith({ runId: 'run-accepted' });
  });

  test('returns the existing run for an overlapping trigger and only executes once', async () => {
    let finishRun;
    const executeRun = jest.fn(
      () =>
        new Promise((resolve) => {
          finishRun = resolve;
        })
    );
    const log = createLog();
    const starter = createScrapeJobStarter({
      executeRun,
      createRunId: () => 'run-active',
      log,
    });

    const first = starter.start();
    const second = starter.start();
    await Promise.resolve();

    expect(second).toMatchObject({ runId: 'run-active', started: false });
    expect(executeRun).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      'Scheduled scrape trigger received while a run is already active',
      { runId: 'run-active' }
    );

    finishRun();
    await first.completion;
  });

  test('logs an asynchronous run failure and releases the dispatcher for the next trigger', async () => {
    const executeRun = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ total: 0 });
    const log = createLog();
    const createRunId = jest.fn().mockReturnValueOnce('run-failed').mockReturnValueOnce('run-next');
    const starter = createScrapeJobStarter({ executeRun, createRunId, log });

    const failed = starter.start();
    await failed.completion;

    expect(log.error).toHaveBeenCalledWith(
      'Scheduled scrape run failed unexpectedly',
      expect.objectContaining({ runId: 'run-failed' })
    );

    const next = starter.start();
    await next.completion;

    expect(next).toMatchObject({ runId: 'run-next', started: true });
    expect(executeRun).toHaveBeenCalledTimes(2);
  });
});
