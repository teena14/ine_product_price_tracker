import { jest } from '@jest/globals';

const mockGetTrackedProductById = jest.fn();
const mockGetAllScrapeAttemptsForExport = jest.fn();

jest.unstable_mockModule('../src/repositories/trackedProductsRepository.js', () => ({
  getTrackedProductById: mockGetTrackedProductById,
}));
jest.unstable_mockModule('../src/repositories/scrapeAttemptsRepository.js', () => ({
  getAllScrapeAttemptsForExport: mockGetAllScrapeAttemptsForExport,
}));

const { buildScrapeHistoryCsv, exportTrackedProductHistory } = await import(
  '../src/services/scrapeExportService.js'
);

const TRACKED_PRODUCT = {
  id: 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c',
  product_id: '2037',
  product_name: 'Halvard Headlamp One',
  option_name: 'Duo',
};

describe('scrapeExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds chronological CSV rows for every outcome with UTC timestamps', () => {
    const csv = buildScrapeHistoryCsv(TRACKED_PRODUCT, [
      {
        outcome: 'success',
        scraped_at: '2026-09-26T17:30:00+05:30',
        price: '18145.5000',
        stock: 12,
      },
      {
        outcome: 'retried',
        scraped_at: '2026-09-26T12:05:00.000Z',
        price: 999,
        stock: 1,
      },
      {
        outcome: 'failed',
        scraped_at: '2026-09-26T12:06:00.000Z',
        price: null,
        stock: null,
      },
    ]);

    expect(csv).toBe(
      'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:00:00.000Z,18145.5000,12,success\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:05:00.000Z,,,retried\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:06:00.000Z,,,failed\r\n'
    );
  });

  test('escapes quotes, commas, and newlines according to CSV rules', () => {
    const csv = buildScrapeHistoryCsv(
      {
        ...TRACKED_PRODUCT,
        product_name: 'Trail "Master", Pro',
        option_name: 'Blue\nLarge',
      },
      [
        {
          outcome: 'success',
          scraped_at: '2026-09-26T12:00:00.000Z',
          price: 100,
          stock: 2,
        },
      ]
    );

    expect(csv).toContain('2037,"Trail ""Master"", Pro","Blue\nLarge",2026-09-26T12:00:00.000Z,100,2,success');
  });

  test('rejects an invalid scrape timestamp instead of producing an ambiguous CSV row', () => {
    expect(() =>
      buildScrapeHistoryCsv(TRACKED_PRODUCT, [
        { outcome: 'success', scraped_at: 'not-a-timestamp', price: 100, stock: 2 },
      ])
    ).toThrow('invalid timestamp');
  });

  test('resolves the parent then queries the complete chronological attempt history', async () => {
    const attempts = [{ outcome: 'failed', scraped_at: '2026-09-26T12:00:00.000Z' }];
    mockGetTrackedProductById.mockResolvedValue(TRACKED_PRODUCT);
    mockGetAllScrapeAttemptsForExport.mockResolvedValue(attempts);

    await expect(exportTrackedProductHistory(TRACKED_PRODUCT.id)).resolves.toEqual({
      trackedProduct: TRACKED_PRODUCT,
      csv:
        'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:00:00.000Z,,,failed\r\n',
    });
    expect(mockGetTrackedProductById).toHaveBeenCalledWith(TRACKED_PRODUCT.id);
    expect(mockGetAllScrapeAttemptsForExport).toHaveBeenCalledWith(TRACKED_PRODUCT.id);
  });

  test('does not query scrape attempts if the tracked product is missing', async () => {
    mockGetTrackedProductById.mockRejectedValue(new Error('not found'));

    await expect(exportTrackedProductHistory('missing-id')).rejects.toThrow('not found');
    expect(mockGetAllScrapeAttemptsForExport).not.toHaveBeenCalled();
  });
});
