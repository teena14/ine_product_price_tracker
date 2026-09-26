import { jest } from '@jest/globals';
import request from 'supertest';

const mockRunActiveTrackedProductScrape = jest.fn();

jest.unstable_mockModule('../src/services/scrapeRunService.js', () => ({
  runActiveTrackedProductScrape: mockRunActiveTrackedProductScrape,
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
    expect(mockRunActiveTrackedProductScrape).not.toHaveBeenCalled();
  });

  test('rejects an incorrect cron bearer secret before starting a scrape', async () => {
    await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer incorrect-secret')
      .expect(401);

    expect(mockRunActiveTrackedProductScrape).not.toHaveBeenCalled();
  });

  test('does not trigger a scrape when the server cron secret is absent', async () => {
    delete process.env.CRON_SECRET;

    await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(401);

    expect(mockRunActiveTrackedProductScrape).not.toHaveBeenCalled();
  });

  test('returns a safe run summary to an authenticated cron request', async () => {
    mockRunActiveTrackedProductScrape.mockResolvedValue({
      runId: 'run-123',
      total: 3,
      successful: 2,
      failed: 1,
      results: [{ errorCode: 'SCRAPE_TIMEOUT', internalOnly: true }],
    });

    const response = await request(app)
      .post('/internal/scrape')
      .set('Authorization', 'Bearer test-cron-secret')
      .expect(200);

    expect(response.body).toEqual({
      runId: 'run-123',
      total: 3,
      successful: 2,
      failed: 1,
    });
    expect(mockRunActiveTrackedProductScrape).toHaveBeenCalledWith();
  });

  test('does not expose an unauthenticated GET scrape trigger', async () => {
    await request(app).get('/internal/scrape').expect(404);
    expect(mockRunActiveTrackedProductScrape).not.toHaveBeenCalled();
  });
});
