import { chromium } from 'playwright';
import { IneHttpError, getProductById } from './ineHttpClient.js';
import { AppError } from '../utils/errors.js';

const BASE_URL = process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com';
const NAVIGATION_TIMEOUT_MS = 20_000;
const QUOTE_TIMEOUT_MS = 35_000;
const MIN_POINTER_MOVES = 10;
const POINTER_MOVE_DELAY_MS = 75;

let browserPromise;

const STATUS_BY_CODE = Object.freeze({
  INVALID_OPTION: 400,
  PRODUCT_NOT_FOUND: 404,
  SCRAPE_TIMEOUT: 504,
  SCRAPE_NETWORK_ERROR: 502,
  SCRAPE_UPSTREAM_ERROR: 502,
  SCRAPE_VALIDATION_ERROR: 422,
  QUOTE_UNAVAILABLE: 503,
  SCRAPE_BROWSER_ERROR: 502,
  SCRAPE_FAILED: 502,
});

export class QuoteScraperError extends AppError {
  constructor(code, message, cause) {
    super(code, message, STATUS_BY_CODE[code] || 500);
    this.name = 'QuoteScraperError';
    if (cause) {
      this.cause = cause;
    }
  }
}

function normalizeText(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\uFF10-\uFF19]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));
}

/**
 * Converts a displayed currency value into a number. The selector passed to
 * this function must identify the visible selling price, not surrounding text.
 */
export function parseDisplayedPrice(value) {
  const match = normalizeText(value).match(/(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?/);
  if (!match) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'The displayed price is missing or malformed');
  }

  const price = Number(match[0].replace(/[\s,]/g, ''));
  if (!Number.isFinite(price) || price <= 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'The displayed price is not a positive number');
  }

  return price;
}

/**
 * Parses explicit stock wording. A missing stock count is never treated as 0.
 */
export function parseDisplayedStock(value) {
  const text = normalizeText(value);
  if (/\b(out of stock|unavailable)\b/i.test(text)) {
    return 0;
  }

  const match = text.match(/\d+/);
  if (!match) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'The displayed stock is missing or malformed');
  }

  const stock = Number(match[0]);
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'The displayed stock is not a valid integer');
  }

  return stock;
}

export function validateQuote(quote) {
  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'Price failed validation');
  }
  if (!Number.isSafeInteger(quote.stock) || quote.stock < 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'Stock failed validation');
  }

  return quote;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' });
  }

  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

/**
 * Closes the reusable browser. Call this once at process shutdown or at the
 * end of a scheduled run; individual product scrapes only close their page.
 */
export async function closeQuoteScraperBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  browserPromise = undefined;
  await browser.close();
}

function productPageUrl(productId) {
  return new URL(`/item/${encodeURIComponent(productId)}`, BASE_URL).toString();
}

async function selectOption(page, productId, optionId) {
  const product = await getProductById(productId);
  const option = product.options.find((candidate) => candidate.optionId === optionId);

  if (!option) {
    throw new QuoteScraperError('INVALID_OPTION', 'The selected option is invalid or unavailable');
  }

  // A single-option product has no picker and is selected by the storefront automatically.
  if (product.options.length <= 1) {
    return;
  }

  const picker = page.locator('.opt-picker');
  const optionButton = picker.getByRole('button', { name: option.label, exact: true });
  await optionButton.waitFor({ state: 'visible', timeout: NAVIGATION_TIMEOUT_MS });
  await optionButton.click();
}

async function satisfyPriceInteraction(page) {
  const panel = page.locator('.offer-panel');
  await panel.waitFor({ state: 'visible', timeout: NAVIGATION_TIMEOUT_MS });
  const box = await panel.boundingBox();

  if (!box) {
    throw new QuoteScraperError('QUOTE_UNAVAILABLE', 'Price panel has no visible bounding box');
  }

  // The mock store requires several distinct mouse moves and a dwell period.
  // These short bounded delays model that documented interaction; they are not
  // a blind wait for a network response.
  for (let step = 0; step < MIN_POINTER_MOVES; step += 1) {
    await page.mouse.move(box.x + 16 + step * 12, box.y + 16 + (step % 3) * 8);
    await page.waitForTimeout(POINTER_MOVE_DELAY_MS);
  }

  const priceControl = panel.locator('button.ctl-main');
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.offer-panel button.ctl-main');
      return Boolean(button && !button.disabled);
    },
    { timeout: NAVIGATION_TIMEOUT_MS }
  );
  await priceControl.click();
}

async function waitForQuote(page) {
  try {
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('.offer-panel');
        return Boolean(panel?.querySelector('.offer-row b')) || panel?.classList.contains('offer-failed');
      },
      { timeout: QUOTE_TIMEOUT_MS }
    );
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new QuoteScraperError('SCRAPE_TIMEOUT', 'Timed out waiting for the current price and stock', error);
    }
    throw error;
  }

  const panel = page.locator('.offer-panel');
  if (await panel.evaluate((element) => element.classList.contains('offer-failed'))) {
    throw new QuoteScraperError('QUOTE_UNAVAILABLE', 'The store could not provide a current quote');
  }
}

/**
 * Uses the browser-only INE quote flow and returns normalized, validated data.
 * The page is isolated per product, while the browser process is reused across
 * calls to keep scheduled runs efficient.
 */
export async function scrapeCurrentQuote({ productId, optionId }) {
  let page;

  try {
    const browser = await getBrowser();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    await page.goto(productPageUrl(productId), {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await selectOption(page, productId, optionId);
    await satisfyPriceInteraction(page);
    await waitForQuote(page);

    // The storefront also includes aria-hidden price decoys. Read only the
    // visible <b> in the rendered offer row and the explicit stock pill.
    const priceText = await page.locator('.offer-panel .offer-row b:visible').innerText();
    const stockText = await page.locator('.offer-panel .avail-pill:visible').innerText();

    return validateQuote({
      price: parseDisplayedPrice(priceText),
      stock: parseDisplayedStock(stockText),
    });
  } catch (error) {
    if (error instanceof QuoteScraperError) {
      throw error;
    }
    if (error instanceof IneHttpError) {
      if (error.code === 'INE_HTTP_TIMEOUT') {
        throw new QuoteScraperError('SCRAPE_TIMEOUT', 'The store API timed out while preparing the quote', error);
      }
      if (error.code === 'INE_NETWORK_ERROR') {
        throw new QuoteScraperError('SCRAPE_NETWORK_ERROR', 'Unable to reach the store while scraping', error);
      }
      if (error.status === 404) {
        throw new QuoteScraperError('PRODUCT_NOT_FOUND', 'The selected product is no longer available', error);
      }
      if (error.status >= 500) {
        throw new QuoteScraperError('SCRAPE_UPSTREAM_ERROR', 'The store is temporarily unavailable', error);
      }
      throw new QuoteScraperError('SCRAPE_FAILED', 'The store rejected the quote request', error);
    }
    if (error.name === 'TimeoutError') {
      throw new QuoteScraperError('SCRAPE_TIMEOUT', 'The browser operation timed out', error);
    }
    throw new QuoteScraperError('SCRAPE_BROWSER_ERROR', 'The browser quote operation failed', error);
  } finally {
    await page?.close();
  }
}
