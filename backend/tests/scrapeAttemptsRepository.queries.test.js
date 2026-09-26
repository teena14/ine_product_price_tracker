import { jest } from '@jest/globals';

const mockGetSupabaseClient = jest.fn();

jest.unstable_mockModule('../src/config/supabase.js', () => ({
  getSupabaseClient: mockGetSupabaseClient,
}));

const {
  getAllScrapeAttemptsForExport,
  getScrapeHistory,
} = await import('../src/repositories/scrapeAttemptsRepository.js');

function configureQuery(result) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
  };

  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method].mockReturnValue(query);
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);

  mockGetSupabaseClient.mockReturnValue({ from: jest.fn().mockReturnValue(query) });
  return query;
}

describe('scrape-attempt history queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns newest-first history and applies an explicit limit only when requested', async () => {
    const query = configureQuery({ data: [{ id: 'attempt-2' }], error: null });

    await expect(getScrapeHistory('tracked-id')).resolves.toEqual([{ id: 'attempt-2' }]);
    expect(query.eq).toHaveBeenCalledWith('tracked_product_id', 'tracked-id');
    expect(query.order).toHaveBeenCalledWith('scraped_at', { ascending: false });
    expect(query.limit).not.toHaveBeenCalled();

    const limitedQuery = configureQuery({ data: [{ id: 'attempt-1' }], error: null });
    await expect(getScrapeHistory('tracked-id', { limit: 25 })).resolves.toEqual([{ id: 'attempt-1' }]);
    expect(limitedQuery.limit).toHaveBeenCalledWith(25);
  });

  test('returns every export row in chronological order', async () => {
    const query = configureQuery({ data: [{ id: 'oldest' }, { id: 'newest' }], error: null });

    await expect(getAllScrapeAttemptsForExport('tracked-id')).resolves.toEqual([
      { id: 'oldest' },
      { id: 'newest' },
    ]);
    expect(query.eq).toHaveBeenCalledWith('tracked_product_id', 'tracked-id');
    expect(query.order).toHaveBeenCalledWith('scraped_at', { ascending: true });
    expect(query.limit).not.toHaveBeenCalled();
  });

  test('wraps export-query failures in a server-side database error', async () => {
    configureQuery({ data: null, error: { message: 'database password=secret' } });

    await expect(getAllScrapeAttemptsForExport('tracked-id')).rejects.toThrow(
      'Database error while fetching scrape export data'
    );
  });
});
