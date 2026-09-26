import { jest } from '@jest/globals';
import request from 'supertest';
import { AppError } from '../src/utils/errors.js';

const mockCreateTrackedProductFromSelection = jest.fn();
const mockListTrackedProducts = jest.fn();
const mockGetTrackedProduct = jest.fn();

jest.unstable_mockModule('../src/services/trackedProductsService.js', () => ({
  createTrackedProductFromSelection: mockCreateTrackedProductFromSelection,
  listTrackedProducts: mockListTrackedProducts,
  getTrackedProduct: mockGetTrackedProduct,
}));

const { default: app } = await import('../src/app.js');

const TRACKED_PRODUCT_ID = 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c';

describe('public shared tracked-product API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('adds a product option to the public shared tracker without a cookie', async () => {
    const trackedProduct = { id: TRACKED_PRODUCT_ID, product_name: 'Halvard Headlamp One' };
    mockCreateTrackedProductFromSelection.mockResolvedValue(trackedProduct);

    const response = await request(app)
      .post('/api/tracked-products')
      .send({ productId: '2037', optionId: 'o2' })
      .expect(201);

    expect(response.body).toEqual(trackedProduct);
    expect(mockCreateTrackedProductFromSelection).toHaveBeenCalledWith({
      productId: '2037',
      optionId: 'o2',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('validates required identifiers before calling the service', async () => {
    await request(app).post('/api/tracked-products').send({ productId: 'not-a-number' }).expect(400);

    expect(mockCreateTrackedProductFromSelection).not.toHaveBeenCalled();
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
    mockCreateTrackedProductFromSelection.mockRejectedValue(
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
