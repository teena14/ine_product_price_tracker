import { jest } from '@jest/globals';

const mockGetSupabaseClient = jest.fn();

jest.unstable_mockModule('../src/config/supabase.js', () => ({
  getSupabaseClient: mockGetSupabaseClient,
}));

const {
  createTrackedProduct,
  getTrackedProductById,
  listAllActiveTrackedProducts,
  listTrackedProducts,
} = await import('../src/repositories/trackedProductsRepository.js');

function createQuery(result) {
  const query = {
    insert: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    single: jest.fn(),
  };

  for (const method of ['insert', 'select', 'eq', 'order']) {
    query[method].mockReturnValue(query);
  }
  query.single.mockResolvedValue(result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);

  return query;
}

function configureQuery(result) {
  const query = createQuery(result);
  const client = { from: jest.fn().mockReturnValue(query) };
  mockGetSupabaseClient.mockReturnValue(client);
  return { client, query };
}

const TRACKING_INPUT = {
  product_id: '2037',
  product_url: 'https://demo.inelabteamdev.com/item/2037',
  product_name: 'Halvard Headlamp One',
  option_id: 'o2',
  option_name: 'Duo',
};

describe('tracked-products repository queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a globally active tracking record and maps a duplicate constraint', async () => {
    const created = { id: 'tracked-id', ...TRACKING_INPUT, active: true };
    const { client, query } = configureQuery({ data: created, error: null });

    await expect(createTrackedProduct(TRACKING_INPUT)).resolves.toEqual(created);
    expect(client.from).toHaveBeenCalledWith('tracked_products');
    expect(query.insert).toHaveBeenCalledWith({ ...TRACKING_INPUT, active: true });
    expect(query.select).toHaveBeenCalledWith();
    expect(query.single).toHaveBeenCalledWith();

    configureQuery({ data: null, error: { code: '23505' } });
    await expect(createTrackedProduct(TRACKING_INPUT)).rejects.toMatchObject({
      code: 'DUPLICATE_TRACKING',
      statusCode: 409,
    });
  });

  test('uses distinct active-list ordering for the dashboard and trusted scraper', async () => {
    const newestFirst = configureQuery({ data: [{ id: 'newest' }], error: null });

    await expect(listTrackedProducts()).resolves.toEqual([{ id: 'newest' }]);
    expect(newestFirst.query.eq).toHaveBeenCalledWith('active', true);
    expect(newestFirst.query.order).toHaveBeenCalledWith('created_at', { ascending: false });

    const oldestFirst = configureQuery({ data: [{ id: 'oldest' }], error: null });
    await expect(listAllActiveTrackedProducts()).resolves.toEqual([{ id: 'oldest' }]);
    expect(oldestFirst.query.eq).toHaveBeenCalledWith('active', true);
    expect(oldestFirst.query.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  test('maps a missing tracked product to a safe not-found error', async () => {
    const { query } = configureQuery({ data: null, error: { code: 'PGRST116' } });

    await expect(getTrackedProductById('missing-id')).rejects.toMatchObject({
      code: 'TRACKED_PRODUCT_NOT_FOUND',
      statusCode: 404,
    });
    expect(query.eq).toHaveBeenCalledWith('id', 'missing-id');
  });

  test('wraps unexpected database failures without exposing their cause in the message', async () => {
    configureQuery({ data: null, error: { code: 'XX000', message: 'connection password=secret' } });

    await expect(listTrackedProducts()).rejects.toThrow('Database error while listing tracked products');
  });
});
