import { jest } from '@jest/globals';
import request from 'supertest';

const mockCreateTrackedProductForSession = jest.fn();
const mockListTrackedProductsForSession = jest.fn();
const mockGetTrackedProductForSession = jest.fn();
const mockDeactivateTrackedProductForSession = jest.fn();

jest.unstable_mockModule('../src/services/trackedProductsService.js', () => ({
  createTrackedProductForSession: mockCreateTrackedProductForSession,
  listTrackedProductsForSession: mockListTrackedProductsForSession,
  getTrackedProductForSession: mockGetTrackedProductForSession,
  deactivateTrackedProductForSession: mockDeactivateTrackedProductForSession,
}));

const { default: app } = await import('../src/app.js');

const TRACKED_PRODUCT_ID = 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c';
const SESSION_A = 'a'.repeat(64);

describe('tracked product API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a tracked product using the server-managed session', async () => {
    const trackedProduct = { id: TRACKED_PRODUCT_ID, product_name: 'Halvard Headlamp One' };
    mockCreateTrackedProductForSession.mockResolvedValue(trackedProduct);

    const response = await request(app)
      .post('/api/tracked-products')
      .set('Cookie', `ine_tracker_session=${SESSION_A}`)
      .send({ productId: '2037', optionId: 'o2', session_id: 'forged-session' })
      .expect(201);

    expect(response.body).toEqual(trackedProduct);
    expect(mockCreateTrackedProductForSession).toHaveBeenCalledWith({
      productId: '2037',
      optionId: 'o2',
      sessionId: SESSION_A,
    });
  });

  test('validates required identifiers before calling the service', async () => {
    await request(app)
      .post('/api/tracked-products')
      .send({ productId: 'not-a-number' })
      .expect(400);

    expect(mockCreateTrackedProductForSession).not.toHaveBeenCalled();
  });

  test('lists only the current session’s tracked products', async () => {
    mockListTrackedProductsForSession.mockResolvedValue([{ id: TRACKED_PRODUCT_ID }]);

    const response = await request(app)
      .get('/api/tracked-products')
      .set('Cookie', `ine_tracker_session=${SESSION_A}`)
      .expect(200);

    expect(response.body).toEqual({ trackedProducts: [{ id: TRACKED_PRODUCT_ID }] });
    expect(mockListTrackedProductsForSession).toHaveBeenCalledWith(SESSION_A);
  });

  test('passes session ownership through when retrieving and deactivating a product', async () => {
    mockGetTrackedProductForSession.mockResolvedValue({ id: TRACKED_PRODUCT_ID });

    await request(app)
      .get(`/api/tracked-products/${TRACKED_PRODUCT_ID}`)
      .set('Cookie', `ine_tracker_session=${SESSION_A}`)
      .expect(200);

    mockDeactivateTrackedProductForSession.mockResolvedValue({ id: TRACKED_PRODUCT_ID });

    await request(app)
      .delete(`/api/tracked-products/${TRACKED_PRODUCT_ID}`)
      .set('Cookie', `ine_tracker_session=${SESSION_A}`)
      .expect(204);

    expect(mockGetTrackedProductForSession).toHaveBeenCalledWith(TRACKED_PRODUCT_ID, SESSION_A);
    expect(mockDeactivateTrackedProductForSession).toHaveBeenCalledWith(TRACKED_PRODUCT_ID, SESSION_A);
  });
});
