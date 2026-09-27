import { jest } from '@jest/globals';
import request from 'supertest';

const mockStartActiveTrackedProductScrapeJob = jest.fn();

jest.unstable_mockModule('../src/services/scrapeJobService.js', () => ({
  startActiveTrackedProductScrapeJob: mockStartActiveTrackedProductScrapeJob,
}));

const { default: app } = await import('../src/app.js');
const originalCronSecret = process.env.CRON_SECRET;

describe('POST /internal/scrape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  test('rejects a missing cron bearer secret before starting a scrape', async () => {
    const response = await request(app).post('/internal/scrape').expect(401);

    expect(response.body.error).toEqual({
      code: 'CRON_UNAUTHORIZED',
      message: 'Invalid or missing cron secret',
      details: [],
    });
    expect(mockStartActiveTrackedProductScrapeJob).not.toHaveBeenCalled();
  });

  test('rejects an incorrect cron bearer secret before starting a scrape', async () => {
    await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer incorrect-secret')
      .expect(401);

    expect(mockStartActiveTrackedProductScrapeJob).not.toHaveBeenCalled();
  });

  test('does not trigger a scrape when the server cron secret is absent', async () => {
    delete process.env.CRON_SECRET;

    await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(401);

    expect(mockStartActiveTrackedProductScrapeJob).not.toHaveBeenCalled();
  });

  test('accepts an authenticated cron trigger without waiting for the scrape run', async () => {
    mockStartActiveTrackedProductScrapeJob.mockReturnValue({
      runId: 'run-123',
      started: true,
    });

    const response = await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(202);

    expect(response.body).toEqual({
      ok: true,
      runId: 'run-123',
      status: 'started',
    });
    expect(mockStartActiveTrackedProductScrapeJob).toHaveBeenCalledWith();
  });

  test('acknowledges an overlapping authenticated trigger without starting a second job', async () => {
    mockStartActiveTrackedProductScrapeJob.mockReturnValue({
      runId: 'run-123',
      started: false,
    });

    const response = await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(202);

    expect(response.body).toEqual({
      ok: true,
      runId: 'run-123',
      status: 'already_running',
    });
  });

  test('does not expose an unauthenticated GET scrape trigger', async () => {
    await request(app).get('/internal/scrape').expect(404);
    expect(mockStartActiveTrackedProductScrapeJob).not.toHaveBeenCalled();
  });
});
