/**
 * Phase 2 tests — INE product discovery API
 *
 * Tests the Express API endpoints using supertest.
 * INE HTTP calls are mocked with nock so tests run offline and deterministically.
 */

import 'dotenv/config';
import request from 'supertest';
import nock from 'nock';
import app from '../src/app.js';
import { resetCatalogCacheForTests } from '../src/scraper/ineHttpClient.js';

const INE_BASE = process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com';

// Sample fixture data matching the real INE API shape
const MOCK_LISTINGS_PAGE_ONE = {
  page: 1,
  perPage: 2,
  totalPages: 2,
  count: 3,
  results: [
    {
      id: 2037,
      slug: 'halvard-headlamp-one',
      name: 'Halvard Headlamp One',
      brand: 'Halvard',
      category: 'Outdoor',
      sku: 'SK-2037-HA',
      description: 'A dependable outdoor pick.',
    },
    {
      id: 2081,
      slug: 'halvard-headlamp-two',
      name: 'Halvard Headlamp Two',
      brand: 'Halvard',
      category: 'Outdoor',
      sku: 'SK-2081-HA',
      description: 'A brighter outdoor pick.',
    },
  ],
};

const MOCK_LISTINGS_PAGE_TWO = {
  page: 2,
  perPage: 2,
  totalPages: 2,
  count: 3,
  results: [
    {
      id: 2103,
      slug: 'halvard-headlamp-three',
      name: 'Halvard Headlamp Three',
      brand: 'Halvard',
      category: 'Outdoor',
      sku: 'SK-2103-HA',
      description: 'A lightweight outdoor pick.',
    },
  ],
};

const MOCK_ITEM_2037 = {
  id: 2037,
  slug: 'halvard-headlamp-one',
  name: 'Halvard Headlamp One',
  brand: 'Halvard',
  category: 'Outdoor',
  sku: 'SK-2037-HA',
  description: 'A dependable outdoor pick.',
  specs: { warranty: '18 months', weightGrams: 2638 },
  reviews: [],
  optionAxis: 'Capacity',
  options: [
    { id: 'o1', label: 'Solo' },
    { id: 'o2', label: 'Duo' },
    { id: 'o3', label: 'Family' },
  ],
};

afterEach(() => {
  nock.cleanAll();
  resetCatalogCacheForTests();
});

function mockFullCatalog() {
  nock(INE_BASE)
    .get('/api/v2/listings')
    .query({ page: '1', limit: '60' })
    .reply(200, MOCK_LISTINGS_PAGE_ONE)
    .get('/api/v2/listings')
    .query({ page: '2', limit: '60' })
    .reply(200, MOCK_LISTINGS_PAGE_TWO);
}

describe('GET /api/products/search', () => {
  test('filters the complete catalog by normalized product name instead of trusting the upstream count', async () => {
    mockFullCatalog();

    const res = await request(app)
      .get('/api/products/search?q=headlamp')
      .expect(200);

    expect(res.body.products).toHaveLength(2);
    expect(res.body.products.map((product) => product.name)).toEqual([
      'Halvard Headlamp One',
      'Halvard Headlamp Two',
    ]);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.totalPages).toBe(2);

    const first = res.body.products[0];
    expect(first.productId).toBe('2037');
    expect(first.name).toBe('Halvard Headlamp One');
    expect(first.productUrl).toContain('/item/2037');
    // Ensure no raw INE fields leak through
    expect(first.id).toBeUndefined();
    expect(first.slug).toBeDefined();
  });

  test('returns the next page from the filtered result set', async () => {
    mockFullCatalog();

    const res = await request(app)
      .get('/api/products/search?q=HEADLAMP&page=2')
      .expect(200);

    expect(res.body).toMatchObject({ total: 3, page: 2, totalPages: 2 });
    expect(res.body.products).toEqual([
      expect.objectContaining({ productId: '2103', name: 'Halvard Headlamp Three' }),
    ]);
  });

  test('reuses the cached complete catalog for later search terms', async () => {
    mockFullCatalog();

    await request(app).get('/api/products/search?q=one').expect(200);
    const secondSearch = await request(app).get('/api/products/search?q=three').expect(200);

    expect(secondSearch.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(secondSearch.body.products).toEqual([
      expect.objectContaining({ productId: '2103', name: 'Halvard Headlamp Three' }),
    ]);
    expect(nock.isDone()).toBe(true);
  });

  test('retries a transient catalog page failure before filtering the result', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query({ page: '1', limit: '60' })
      .reply(503, 'Temporarily unavailable')
      .get('/api/v2/listings')
      .query({ page: '1', limit: '60' })
      .reply(200, MOCK_LISTINGS_PAGE_ONE)
      .get('/api/v2/listings')
      .query({ page: '2', limit: '60' })
      .reply(200, MOCK_LISTINGS_PAGE_TWO);

    const res = await request(app).get('/api/products/search?q=three').expect(200);

    expect(res.body.products).toEqual([
      expect.objectContaining({ productId: '2103', name: 'Halvard Headlamp Three' }),
    ]);
  });

  test('returns 400 when query param q is missing', async () => {
    const res = await request(app)
      .get('/api/products/search')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when query param q is empty', async () => {
    const res = await request(app)
      .get('/api/products/search?q=')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for an invalid search page before loading the catalog', async () => {
    const res = await request(app)
      .get('/api/products/search?q=headlamp&page=0')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('handles INE API 500 error gracefully', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query({ page: '1', limit: '60' })
      .reply(500, 'Internal Server Error');

    const res = await request(app)
      .get('/api/products/search?q=camera')
      .expect(502);

    expect(res.body.error).toEqual({
      code: 'PRODUCT_CATALOG_UNAVAILABLE',
      message: 'The product catalog is temporarily unavailable',
      details: [],
    });
  });

  test('handles INE API network error gracefully', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query({ page: '1', limit: '60' })
      .replyWithError('ECONNREFUSED');

    const res = await request(app)
      .get('/api/products/search?q=laptop')
      .expect(502);

    expect(res.body.error.code).toBe('PRODUCT_CATALOG_UNAVAILABLE');
  });
});

describe('GET /api/products/:productId', () => {
  test('returns normalized product detail with options', async () => {
    nock(INE_BASE)
      .get('/api/v2/items/2037')
      .query(true)
      .reply(200, MOCK_ITEM_2037);

    const res = await request(app)
      .get('/api/products/2037')
      .expect(200);

    expect(res.body.productId).toBe('2037');
    expect(res.body.name).toBe('Halvard Headlamp One');
    expect(res.body.optionAxis).toBe('Capacity');
    expect(res.body.options).toHaveLength(3);
    expect(res.body.options[0]).toEqual({ optionId: 'o1', label: 'Solo' });
    expect(res.body.productUrl).toContain('/item/2037');
  });

  test('returns 404 when INE returns 404', async () => {
    nock(INE_BASE)
      .get('/api/v2/items/9999')
      .query(true)
      .reply(404, { error: 'not found' });

    const res = await request(app)
      .get('/api/products/9999')
      .expect(404);

    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('returns 400 for non-numeric product ID', async () => {
    const res = await request(app)
      .get('/api/products/abc')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
