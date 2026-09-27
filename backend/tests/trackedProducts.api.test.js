import { jest } from '@jest/globals';
import request from 'supertest';
import { AppError } from '../src/utils/errors.js';

const mockCreateTrackedProductWithInitialScrape = jest.fn();
const mockCreateMultipleTrackedProducts = jest.fn();
const mockListTrackedProducts = jest.fn();
const mockGetTrackedProduct = jest.fn();
const mockGetTrackedProductHistory = jest.fn();
const mockSetTrackedProductFrequency = jest.fn();
const mockExportAllTrackedProductsHistory = jest.fn();
const mockExportTrackedProductHistory = jest.fn();
const mockStartActiveTrackedProductScrapeJob = jest.fn();

jest.unstable_mockModule('../src/services/trackedProductsService.js', () => ({
  createTrackedProductWithInitialScrape: mockCreateTrackedProductWithInitialScrape,
  createMultipleTrackedProducts: mockCreateMultipleTrackedProducts,
  listTrackedProducts: mockListTrackedProducts,
  getTrackedProduct: mockGetTrackedProduct,
  getTrackedProductHistory: mockGetTrackedProductHistory,
  setTrackedProductFrequency: mockSetTrackedProductFrequency,
}));
jest.unstable_mockModule('../src/services/scrapeExportService.js', () => ({
  exportAllTrackedProductsHistory: mockExportAllTrackedProductsHistory,
  exportTrackedProductHistory: mockExportTrackedProductHistory,
}));
jest.unstable_mockModule('../src/services/scrapeJobService.js', () => ({
  startActiveTrackedProductScrapeJob: mockStartActiveTrackedProductScrapeJob,
}));

const { default: app } = await import('../src/app.js');

const TRACKED_PRODUCT_ID = 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c';

describe('public shared tracked-product API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('adds and initially scrapes a product option without a cookie', async () => {
    const trackedProduct = { id: TRACKED_PRODUCT_ID, product_name: 'Halvard Headlamp One' };
    mockCreateTrackedProductWithInitialScrape.mockResolvedValue(trackedProduct);

    const response = await request(app)
      .post('/api/tracked-products')
      .send({ productId: '2037', optionId: 'o2' })
      .expect(201);

    expect(response.body).toEqual(trackedProduct);
    expect(mockCreateTrackedProductWithInitialScrape).toHaveBeenCalledWith({
      productId: '2037',
      optionId: 'o2',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('validates required identifiers before calling the service', async () => {
    await request(app).post('/api/tracked-products').send({ productId: 'not-a-number' }).expect(400);

    expect(mockCreateTrackedProductWithInitialScrape).not.toHaveBeenCalled();
  });

  test('returns the same public dashboard list to requests with different cookies', async () => {
    const products = [{ id: TRACKED_PRODUCT_ID }];
    mockListTrackedProducts.mockResolvedValue(products);

    const first = await request(app)
      .get('/api/tracked-products')
      .set('Cookie', `unused=${'a'.repeat(64)}`)
      .expect(200);
    const second = await request(app)
      .get('/api/tracked-products')
      .set('Cookie', `unused=${'b'.repeat(64)}`)
      .expect(200);

    expect(first.body).toEqual({ trackedProducts: products });
    expect(second.body).toEqual({ trackedProducts: products });
    expect(mockListTrackedProducts).toHaveBeenCalledTimes(2);
    expect(mockListTrackedProducts).toHaveBeenCalledWith();
  });

  test('returns a public tracked-product detail by ID', async () => {
    mockGetTrackedProduct.mockResolvedValue({ id: TRACKED_PRODUCT_ID });

    await request(app).get(`/api/tracked-products/${TRACKED_PRODUCT_ID}`).expect(200);

    expect(mockGetTrackedProduct).toHaveBeenCalledWith(TRACKED_PRODUCT_ID);
  });

  test('returns public scrape history and logs by tracked-product ID', async () => {
    const history = {
      trackedProduct: { id: TRACKED_PRODUCT_ID, product_name: 'Halvard Headlamp One' },
      attempts: [
        {
          id: 'attempt-1',
          outcome: 'success',
          price: '18145.5000',
          stock: 12,
          scraped_at: '2026-09-26T12:00:00.000Z',
        },
      ],
    };
    mockGetTrackedProductHistory.mockResolvedValue(history);

    const response = await request(app)
      .get(`/api/tracked-products/${TRACKED_PRODUCT_ID}/history`)
      .expect(200);

    expect(response.body).toEqual(history);
    expect(mockGetTrackedProductHistory).toHaveBeenCalledWith(TRACKED_PRODUCT_ID);
  });

  test('validates history tracked-product IDs before calling the service', async () => {
    await request(app).get('/api/tracked-products/not-a-uuid/history').expect(400);

    expect(mockGetTrackedProductHistory).not.toHaveBeenCalled();
  });

  test('queues an immediate scrape for one active tracked product', async () => {
    mockGetTrackedProduct.mockResolvedValue({ id: TRACKED_PRODUCT_ID, active: true });
    mockStartActiveTrackedProductScrapeJob.mockReturnValue({ runId: 'manual-run', started: true });

    const response = await request(app)
      .post(`/api/tracked-products/${TRACKED_PRODUCT_ID}/scrape`)
      .expect(202);

    expect(response.body).toEqual({ ok: true, runId: 'manual-run', status: 'started' });
    expect(mockGetTrackedProduct).toHaveBeenCalledWith(TRACKED_PRODUCT_ID);
    expect(mockStartActiveTrackedProductScrapeJob).toHaveBeenCalledWith({
      trackedProductId: TRACKED_PRODUCT_ID,
    });
  });

  test('reports an existing scrape run when an immediate scrape cannot start yet', async () => {
    mockGetTrackedProduct.mockResolvedValue({ id: TRACKED_PRODUCT_ID, active: true });
    mockStartActiveTrackedProductScrapeJob.mockReturnValue({ runId: 'active-run', started: false });

    const response = await request(app)
      .post(`/api/tracked-products/${TRACKED_PRODUCT_ID}/scrape`)
      .expect(202);

    expect(response.body).toEqual({ ok: true, runId: 'active-run', status: 'already_running' });
  });

  test('downloads the complete public scrape history as a CSV attachment', async () => {
    const csv =
      'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
      '2037,Halvard Headlamp One,Duo,2026-09-26T12:00:00.000Z,,,failed\r\n';
    mockExportTrackedProductHistory.mockResolvedValue({
      trackedProduct: { id: TRACKED_PRODUCT_ID },
      csv,
    });

    const response = await request(app)
      .get(`/api/tracked-products/${TRACKED_PRODUCT_ID}/export`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="tracked-product-${TRACKED_PRODUCT_ID}-scrape-history.csv"`
    );
    expect(response.text).toBe(csv);
    expect(mockExportTrackedProductHistory).toHaveBeenCalledWith(TRACKED_PRODUCT_ID);
  });

  test('downloads one CSV with the scrape history for every tracked product', async () => {
    const csv =
      'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
      '2037,Halvard Headlamp One,Duo,2026-09-26T12:00:00.000Z,18145.5000,12,success\r\n';
    mockExportAllTrackedProductsHistory.mockResolvedValue({ csv });

    const response = await request(app).get('/api/tracked-products/export').expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="all-tracked-products-scrape-history.csv"'
    );
    expect(response.text).toBe(csv);
    expect(mockExportAllTrackedProductsHistory).toHaveBeenCalledWith();
  });

  test('validates export tracked-product IDs before calling the service', async () => {
    await request(app).get('/api/tracked-products/not-a-uuid/export').expect(400);

    expect(mockExportTrackedProductHistory).not.toHaveBeenCalled();
  });

  test('does not expose public stop, reactivate, or delete routes', async () => {
    await request(app).patch(`/api/tracked-products/${TRACKED_PRODUCT_ID}/deactivate`).expect(404);
    await request(app).patch(`/api/tracked-products/${TRACKED_PRODUCT_ID}/activate`).expect(404);
    await request(app).delete(`/api/tracked-products/${TRACKED_PRODUCT_ID}`).expect(404);
  });

  test('returns a safe generic response for unexpected errors', async () => {
    mockListTrackedProducts.mockRejectedValue(
      new Error('database password=not-for-clients at C:\\private\\backend.js')
    );

    const response = await request(app).get('/api/tracked-products').expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [],
      },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(response.body)).not.toContain('not-for-clients');
    expect(JSON.stringify(response.body)).not.toContain('private');
    expect(response.body.error.stack).toBeUndefined();
  });

  test('redacts a sensitive value accidentally included in operational error details', async () => {
    mockCreateTrackedProductWithInitialScrape.mockRejectedValue(
      new AppError('VALIDATION_ERROR', 'Invalid input', 400, [
        { field: 'password', value: 'must-not-leak' },
      ])
    );

    const response = await request(app)
      .post('/api/tracked-products')
      .send({ productId: '2037', optionId: 'o2' })
      .expect(400);

    expect(response.body.error.details).toEqual([{ field: 'password', value: '[REDACTED]' }]);
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });

  test('treats malformed JSON as a safe validation error', async () => {
    const response = await request(app)
      .post('/api/tracked-products')
      .set('Content-Type', 'application/json')
      .send('{invalid-json')
      .expect(400);

    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body must contain valid JSON',
      details: [],
    });
  });
});
