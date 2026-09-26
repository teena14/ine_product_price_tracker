import { jest } from '@jest/globals';

const mockLaunch = jest.fn();
const mockGetProductById = jest.fn();

class MockIneHttpError extends Error {}

jest.unstable_mockModule('playwright', () => ({
  chromium: { launch: mockLaunch },
}));
jest.unstable_mockModule('../src/scraper/ineHttpClient.js', () => ({
  IneHttpError: MockIneHttpError,
  getProductById: mockGetProductById,
}));

const {
  closeQuoteScraperBrowser,
  QuoteScraperError,
  scrapeCurrentQuote,
} = await import('../src/scraper/priceQuoteScraper.js');

function createPage({ gotoError, offerFailed = false } = {}) {
  const optionButton = {
    waitFor: jest.fn().mockResolvedValue(),
    click: jest.fn().mockResolvedValue(),
  };
  const priceControl = { click: jest.fn().mockResolvedValue() };
  const panel = {
    waitFor: jest.fn().mockResolvedValue(),
    boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
    locator: jest.fn().mockReturnValue(priceControl),
    evaluate: jest.fn().mockResolvedValue(offerFailed),
  };
  const picker = { getByRole: jest.fn().mockReturnValue(optionButton) };
  const price = { innerText: jest.fn().mockResolvedValue('₹18,145.50') };
  const stock = { innerText: jest.fn().mockResolvedValue('Available (12)') };
  const page = {
    close: jest.fn().mockResolvedValue(),
    goto: gotoError ? jest.fn().mockRejectedValue(gotoError) : jest.fn().mockResolvedValue(),
    locator: jest.fn((selector) => {
      if (selector === '.opt-picker') {
        return picker;
      }
      if (selector === '.offer-panel') {
        return panel;
      }
      if (selector === '.offer-panel .offer-row b:visible') {
        return price;
      }
      if (selector === '.offer-panel .avail-pill:visible') {
        return stock;
      }
      throw new Error(`Unexpected locator: ${selector}`);
    }),
    mouse: { move: jest.fn().mockResolvedValue() },
    setDefaultTimeout: jest.fn(),
    waitForFunction: jest.fn().mockResolvedValue(),
    waitForTimeout: jest.fn().mockResolvedValue(),
  };

  return { optionButton, page, panel, priceControl };
}

function configureBrowser(page) {
  const browser = {
    close: jest.fn().mockResolvedValue(),
    newPage: jest.fn().mockResolvedValue(page),
  };
  mockLaunch.mockResolvedValue(browser);
  return browser;
}

describe('Playwright quote workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProductById.mockResolvedValue({
      options: [
        { optionId: 'o1', label: 'Solo' },
        { optionId: 'o2', label: 'Duo' },
      ],
    });
  });

  afterEach(async () => {
    await closeQuoteScraperBrowser();
  });

  test('selects the option, satisfies the required interaction, and closes the page', async () => {
    const { optionButton, page, priceControl } = createPage();
    const browser = configureBrowser(page);

    await expect(scrapeCurrentQuote({ productId: '2037', optionId: 'o2' })).resolves.toEqual({
      price: 18145.5,
      stock: 12,
    });

    expect(mockGetProductById).toHaveBeenCalledWith('2037');
    expect(page.goto).toHaveBeenCalledWith(expect.stringMatching(/\/item\/2037$/), {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    expect(optionButton.click).toHaveBeenCalledWith();
    expect(page.mouse.move).toHaveBeenCalledTimes(10);
    expect(priceControl.click).toHaveBeenCalledWith();
    expect(page.close).toHaveBeenCalledTimes(1);

    await closeQuoteScraperBrowser();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('maps browser navigation timeouts and still closes the page', async () => {
    const timeoutError = new Error('navigation timed out');
    timeoutError.name = 'TimeoutError';
    const { page } = createPage({ gotoError: timeoutError });
    configureBrowser(page);

    await expect(scrapeCurrentQuote({ productId: '2037', optionId: 'o2' })).rejects.toMatchObject({
      code: 'SCRAPE_TIMEOUT',
      name: 'QuoteScraperError',
    });
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  test('turns the store failed-quote state into a retryable quote error', async () => {
    const { page } = createPage({ offerFailed: true });
    configureBrowser(page);

    await expect(scrapeCurrentQuote({ productId: '2037', optionId: 'o2' })).rejects.toMatchObject({
      code: 'QUOTE_UNAVAILABLE',
      name: QuoteScraperError.name,
    });
    expect(page.close).toHaveBeenCalledTimes(1);
  });
});
