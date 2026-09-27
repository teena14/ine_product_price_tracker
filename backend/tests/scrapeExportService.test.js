import { jest } from '@jest/globals';

const mockGetTrackedProductById = jest.fn();
const mockListAllTrackedProductsForExport = jest.fn();
const mockGetAllScrapeAttemptsForExport = jest.fn();
const mockGetAllScrapeAttemptsForFullExport = jest.fn();

jest.unstable_mockModule('../src/repositories/trackedProductsRepository.js', () => ({
  getTrackedProductById: mockGetTrackedProductById,
  listAllTrackedProductsForExport: mockListAllTrackedProductsForExport,
}));
jest.unstable_mockModule('../src/repositories/scrapeAttemptsRepository.js', () => ({
  getAllScrapeAttemptsForExport: mockGetAllScrapeAttemptsForExport,
  getAllScrapeAttemptsForFullExport: mockGetAllScrapeAttemptsForFullExport,
}));

const {
  buildAllScrapeHistoriesCsv,
  buildScrapeHistoryCsv,
  exportAllTrackedProductsHistory,
  exportTrackedProductHistory,
} = await import('../src/services/scrapeExportService.js');

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

  test('builds one chronological CSV across every tracked product', () => {
    const secondProduct = {
      id: 'b1c2d3e4-f5a6-4b78-9c0d-1e2f3a4b5c6d',
      product_id: '4120',
      product_name: 'Ridge Pack',
      option_name: 'Blue',
    };

    const csv = buildAllScrapeHistoriesCsv([TRACKED_PRODUCT, secondProduct], [
      {
        tracked_product_id: secondProduct.id,
        outcome: 'success',
        scraped_at: '2026-09-26T12:00:00.000Z',
        price: 125,
        stock: 4,
      },
      {
        tracked_product_id: TRACKED_PRODUCT.id,
        outcome: 'failed',
        scraped_at: '2026-09-26T12:01:00.000Z',
        price: null,
        stock: null,
      },
    ]);

    expect(csv).toBe(
      'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
        '4120,Ridge Pack,Blue,2026-09-26T12:00:00.000Z,125,4,success\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:01:00.000Z,,,failed\r\n'
    );
  });

  test('exports every product and every scrape attempt', async () => {
    const attempts = [
      {
        tracked_product_id: TRACKED_PRODUCT.id,
        outcome: 'success',
        scraped_at: '2026-09-26T12:00:00.000Z',
        price: 100,
        stock: 2,
      },
    ];
    mockListAllTrackedProductsForExport.mockResolvedValue([TRACKED_PRODUCT]);
    mockGetAllScrapeAttemptsForFullExport.mockResolvedValue(attempts);

    await expect(exportAllTrackedProductsHistory()).resolves.toEqual({
      csv:
        'product_id,product_name,selected_option,timestamp,price,stock,outcome\r\n' +
        '2037,Halvard Headlamp One,Duo,2026-09-26T12:00:00.000Z,100,2,success\r\n',
    });
    expect(mockListAllTrackedProductsForExport).toHaveBeenCalledWith();
    expect(mockGetAllScrapeAttemptsForFullExport).toHaveBeenCalledWith();
  });
});
