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

function createTimeoutError() {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  return error;
}

function createPage({ gotoError, offerFailed = false, ignoredStartClicks = 0, cookieConsent = false } = {}) {
  const uiManifest = {
    priceTag: 'strong',
    classes: { priceValue: 'amt-h8' },
  };
  const manifestResponse = {
    ok: jest.fn().mockReturnValue(true),
    url: jest.fn().mockReturnValue('https://demo.inelabteamdev.com/api/v2/ui/manifest'),
    json: jest.fn().mockResolvedValue(uiManifest),
  };
  const productResponse = {
    ok: jest.fn().mockReturnValue(true),
    url: jest.fn().mockReturnValue('https://demo.inelabteamdev.com/api/v2/items/2037'),
  };
  const optionButton = {
    waitFor: jest.fn().mockResolvedValue(),
    click: jest.fn().mockResolvedValue(),
  };
  const priceControl = { click: jest.fn().mockResolvedValue() };
  let cookieConsentVisible = cookieConsent;
  const cookieConsentButton = {
    first: jest.fn(),
    isVisible: jest.fn().mockImplementation(() => Promise.resolve(cookieConsentVisible)),
    click: jest.fn().mockImplementation(async () => {
      cookieConsentVisible = false;
    }),
  };
  cookieConsentButton.first.mockReturnValue(cookieConsentButton);
  const panel = {
    waitFor: jest.fn().mockResolvedValue(),
    boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
    locator: jest.fn().mockReturnValue(priceControl),
    evaluate: jest.fn().mockResolvedValue(offerFailed),
  };
  const picker = { getByRole: jest.fn().mockReturnValue(optionButton) };
  const price = { innerText: jest.fn().mockResolvedValue('₹18,145.50') };
  const stock = { innerText: jest.fn().mockResolvedValue('Available (12)') };
  let remainingIgnoredStartClicks = ignoredStartClicks;
  const page = {
    close: jest.fn().mockResolvedValue(),
    goto: gotoError ? jest.fn().mockRejectedValue(gotoError) : jest.fn().mockResolvedValue(),
    getByRole: jest.fn().mockReturnValue(cookieConsentButton),
    locator: jest.fn((selector) => {
      if (selector === '.opt-picker') {
        return picker;
      }
      if (selector === '.offer-panel') {
        return panel;
      }
      if (selector === '.offer-panel.offer-ready .offer-row strong[class~="amt-h8"]:visible') {
        return price;
      }
      if (selector === '.offer-panel .avail-pill:visible') {
        return stock;
      }
      throw new Error(`Unexpected locator: ${selector}`);
    }),
    mouse: { move: jest.fn().mockResolvedValue() },
    setDefaultTimeout: jest.fn(),
    waitForFunction: jest.fn().mockImplementation((_predicate, options = {}) => {
      if (options.timeout === 2_000 && remainingIgnoredStartClicks > 0) {
        remainingIgnoredStartClicks -= 1;
        return Promise.reject(createTimeoutError());
      }
      return Promise.resolve();
    }),
    waitForResponse: jest.fn().mockImplementation((predicate) => {
      if (predicate(manifestResponse)) {
        return Promise.resolve(manifestResponse);
      }
      if (predicate(productResponse)) {
        return Promise.resolve(productResponse);
      }
      return Promise.reject(new Error('Unexpected response predicate'));
    }),
    waitForTimeout: jest.fn().mockResolvedValue(),
  };

  return { cookieConsentButton, optionButton, page, panel, priceControl };
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
    expect(page.waitForResponse).toHaveBeenCalledWith(expect.any(Function), { timeout: 20_000 });
    expect(page.waitForResponse).toHaveBeenCalledTimes(2);
    expect(page.close).toHaveBeenCalledTimes(1);

    await closeQuoteScraperBrowser();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('dismisses an early cookie-consent prompt before interacting with the price panel', async () => {
    const { cookieConsentButton, page } = createPage({ cookieConsent: true });
    configureBrowser(page);

    await expect(scrapeCurrentQuote({ productId: '2037', optionId: 'o2' })).resolves.toEqual({
      price: 18145.5,
      stock: 12,
    });

    expect(cookieConsentButton.click).toHaveBeenCalledTimes(1);
    expect(cookieConsentButton.click).toHaveBeenCalledWith({ timeout: 2_000 });
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

  test('repeats the genuine interaction when the storefront silently drops a click', async () => {
    const { page, priceControl } = createPage({ ignoredStartClicks: 1 });
    configureBrowser(page);

    await expect(scrapeCurrentQuote({ productId: '2037', optionId: 'o2' })).resolves.toEqual({
      price: 18145.5,
      stock: 12,
    });

    expect(priceControl.click).toHaveBeenCalledTimes(2);
    expect(page.mouse.move).toHaveBeenCalledTimes(20);
  });
});
