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

const INE_BASE = process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com';

// Sample fixture data matching the real INE API shape
const MOCK_LISTINGS = {
  page: 1,
  perPage: 20,
  totalPages: 2,
  count: 40,
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
      slug: 'mosella-mirrorless-camera-go',
      name: 'Mosella Mirrorless Camera Go',
      brand: 'Mosella',
      category: 'Cameras',
      sku: 'SK-2081-MO',
      description: 'A dependable cameras pick.',
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
});

describe('GET /api/products/search', () => {
  test('returns normalized product list for a valid query', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query(true) // match any query string
      .reply(200, MOCK_LISTINGS);

    const res = await request(app)
      .get('/api/products/search?q=headlamp')
      .expect(200);

    expect(res.body.products).toHaveLength(2);
    expect(res.body.total).toBe(40);
    expect(res.body.page).toBe(1);

    const first = res.body.products[0];
    expect(first.productId).toBe('2037');
    expect(first.name).toBe('Halvard Headlamp One');
    expect(first.productUrl).toContain('/products/halvard-headlamp-one');
    // Ensure no raw INE fields leak through
    expect(first.id).toBeUndefined();
    expect(first.slug).toBeDefined();
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

  test('handles INE API 500 error gracefully', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query(true)
      .reply(500, 'Internal Server Error');

    const res = await request(app)
      .get('/api/products/search?q=camera')
      .expect(500);

    expect(res.body.error).toBeDefined();
  });

  test('handles INE API network error gracefully', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query(true)
      .replyWithError('ECONNREFUSED');

    const res = await request(app)
      .get('/api/products/search?q=laptop')
      .expect(500);

    expect(res.body.error).toBeDefined();
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
    expect(res.body.productUrl).toContain('/products/halvard-headlamp-one');
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

describe('Session cookie', () => {
  test('sets session cookie on first request', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query(true)
      .reply(200, { page: 1, perPage: 20, totalPages: 1, count: 0, results: [] });

    const res = await request(app)
      .get('/api/products/search?q=test')
      .expect(200);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find((c) => c.startsWith('ine_tracker_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
  });

  test('does not regenerate session cookie when valid cookie is present', async () => {
    nock(INE_BASE)
      .get('/api/v2/listings')
      .query(true)
      .reply(200, { page: 1, perPage: 20, totalPages: 1, count: 0, results: [] });

    const fakeSession = 'a'.repeat(64); // 64 hex chars = valid session ID
    const res = await request(app)
      .get('/api/products/search?q=test')
      .set('Cookie', `ine_tracker_session=${fakeSession}`)
      .expect(200);

    // Should not set a new cookie when a valid one exists
    const cookies = res.headers['set-cookie'];
    const sessionCookie = cookies?.find((c) => c.startsWith('ine_tracker_session='));
    expect(sessionCookie).toBeUndefined();
  });
});
