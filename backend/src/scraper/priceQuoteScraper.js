import { chromium } from 'playwright';
import { IneHttpError, getProductById } from './ineHttpClient.js';
import { AppError } from '../utils/errors.js';

const BASE_URL = process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com';
const NAVIGATION_TIMEOUT_MS = 20_000;
const QUOTE_TIMEOUT_MS = 35_000;
const QUOTE_START_TIMEOUT_MS = 2_000;
const QUOTE_START_MAX_ATTEMPTS = 5;
const CHECK_PRICE_ENABLE_TIMEOUT_MS = 30_000;
const CHECK_PRICE_CLICK_TIMEOUT_MS = 5_000;
const COOKIE_CONSENT_TIMEOUT_MS = 20_000;
const COOKIE_CONSENT_CLICK_TIMEOUT_MS = 2_000;
const COOKIE_CONSENT_DISMISS_TIMEOUT_MS = 20_000;
const MIN_POINTER_MOVES = 10;
const POINTER_MOVE_DELAY_MS = 75;
const UI_MANIFEST_PATH = '/api/v2/ui/manifest';
const SAFE_HTML_TAG = /^[a-z][a-z0-9-]*$/i;
const SAFE_CLASS_TOKEN = /^[a-z_-][a-z0-9_-]*$/i;
const COOKIE_ALLOW_BUTTON_NAME = /^(?:allow|accept)(?: all)?(?: cookies)?$|^(?:agree|i agree|ok)$/i;

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
  const text = normalizeText(value);
  const europeanMatch = text.match(/\d{1,3}(?:\.\d{3})+,\d{2}\b/);
  const match = text.match(/(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?/);
  const normalizedNumber = europeanMatch
    ? europeanMatch[0].replace(/\./g, '').replace(',', '.')
    : match?.[0].replace(/[\s,]/g, '');

  if (!normalizedNumber) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'The displayed price is missing or malformed');
  }

  const price = Number(normalizedNumber);
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
  if (/\b(sold\s*out|out of stock|unavailable)\b/i.test(text)) {
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
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    const openDevtools = !isHeadless && process.env.PLAYWRIGHT_DEVTOOLS === 'true';
    browserPromise = chromium.launch({
      headless: isHeadless,
      devtools: openDevtools,
    });
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

function isResponseAtPath(response, path) {
  try {
    return new URL(response.url()).pathname === path;
  } catch {
    return false;
  }
}

function requireSuccessfulStoreResponse(response, label) {
  if (!response.ok()) {
    throw new QuoteScraperError('SCRAPE_UPSTREAM_ERROR', `The store could not load ${label}`);
  }
}

/**
 * The store rotates the visible price tag and class through its public UI
 * manifest. Use the response loaded by this browser page, rather than a
 * separately fetched manifest that could describe a newer layout. Attribute
 * selectors avoid interpreting manifest data as arbitrary CSS.
 */
export function priceSelectorFromUiManifest(manifest) {
  const tag = typeof manifest?.priceTag === 'string' ? manifest.priceTag.trim().toLowerCase() : '';
  const classTokens =
    typeof manifest?.classes?.priceValue === 'string'
      ? manifest.classes.priceValue.trim().split(/\s+/).filter(Boolean)
      : [];

  if (!SAFE_HTML_TAG.test(tag) || classTokens.length === 0 || !classTokens.every((token) => SAFE_CLASS_TOKEN.test(token))) {
    throw new QuoteScraperError(
      'SCRAPE_UPSTREAM_ERROR',
      'The store layout metadata did not identify the current price'
    );
  }

  const requiredClasses = classTokens.map((token) => `[class~="${token}"]`).join('');
  return `.offer-panel.offer-ready .offer-row ${tag}${requiredClasses}:visible`;
}

async function navigateToProductAndLoadUiManifest(page, productId) {
  const manifestResponse = page.waitForResponse(
    (response) => isResponseAtPath(response, UI_MANIFEST_PATH),
    {
      timeout: NAVIGATION_TIMEOUT_MS,
    }
  );
  const productResponse = page.waitForResponse(
    (response) => isResponseAtPath(response, `/api/v2/items/${encodeURIComponent(productId)}`),
    {
      timeout: NAVIGATION_TIMEOUT_MS,
    }
  );
  const [manifest, product] = await Promise.all([
    manifestResponse,
    productResponse,
    page.goto(productPageUrl(productId), {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
  ]);

  requireSuccessfulStoreResponse(manifest, 'the current price layout');
  requireSuccessfulStoreResponse(product, 'the selected product');
  return manifest.json();
}

/**
 * The store may show a cookie-consent prompt shortly after navigation. Wait
 * for its Allow/Accept control, then confirm that control disappears before
 * sending any price-flow interaction to the page.
 */
async function dismissCookieConsent(page, timeoutMs) {
  const button = page.getByRole('button', { name: COOKIE_ALLOW_BUTTON_NAME }).first();

  // The 20-second timeout is for a consent banner that is actually shown. Do
  // not spend that time looking for a banner on every scrape: most visits do
  // not show one, and waiting here would make every normal quote needlessly
  // slow.
  try {
    if (!(await button.isVisible())) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    await button.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return false;
    }
    throw error;
  }

  await button.click({ timeout: COOKIE_CONSENT_CLICK_TIMEOUT_MS });
  try {
    await button.waitFor({ state: 'hidden', timeout: COOKIE_CONSENT_DISMISS_TIMEOUT_MS });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new QuoteScraperError(
        'SCRAPE_TIMEOUT',
        'Timed out waiting for the cookie-consent popup to disappear',
        error
      );
    }
    throw error;
  }
  return true;
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

  const priceControl = panel.locator('button.ctl-main');

  for (let startAttempt = 1; startAttempt <= QUOTE_START_MAX_ATTEMPTS; startAttempt += 1) {
    // Skip the mouse-move ritual if the button is already enabled — no need
    // to burn time on moves the store already rewarded on a prior interaction.
    const alreadyEnabled =
      typeof page.evaluate === 'function'
        ? await page.evaluate(() => {
            const button = document.querySelector('.offer-panel button.ctl-main');
            return Boolean(button && !button.disabled);
          })
        : false;

    if (!alreadyEnabled) {
      // The mock store requires several distinct mouse moves and a dwell period.
      // Hover the disabled Check price control only after completing that motion.
      // If the store enables it slowly, retry this same-page interaction rather
      // than closing the page and starting the full product scrape again.
      for (let step = 0; step < MIN_POINTER_MOVES; step += 1) {
        await page.mouse.move(box.x + 16 + step * 12, box.y + 16 + (step % 3) * 8);
        await page.waitForTimeout(POINTER_MOVE_DELAY_MS);
        // If the store enables the button mid-loop, stop moving immediately.
        const enabledEarly =
          typeof page.evaluate === 'function'
            ? await page.evaluate(() => {
                const button = document.querySelector('.offer-panel button.ctl-main');
                return Boolean(button && !button.disabled);
              })
            : false;
        if (enabledEarly) {
          break;
        }
      }
      await priceControl.hover({ timeout: NAVIGATION_TIMEOUT_MS });

      try {
        await page.waitForFunction(
          () => {
            const button = document.querySelector('.offer-panel button.ctl-main');
            return Boolean(button && !button.disabled);
          },
          { timeout: CHECK_PRICE_ENABLE_TIMEOUT_MS }
        );
      } catch (error) {
        if (error.name === 'TimeoutError' && startAttempt < QUOTE_START_MAX_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }

    await priceControl.click({ timeout: CHECK_PRICE_CLICK_TIMEOUT_MS });

    try {
      await page.waitForFunction(
        () => {
          const pricePanel = document.querySelector('.offer-panel');
          return Boolean(pricePanel && !pricePanel.classList.contains('offer-locked'));
        },
        { timeout: QUOTE_START_TIMEOUT_MS }
      );
      return;
    } catch (error) {
      if (error.name !== 'TimeoutError' || startAttempt === QUOTE_START_MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
}

async function waitForQuote(page) {
  try {
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('.offer-panel');
        return Boolean(
          panel?.classList.contains('offer-ready') || panel?.classList.contains('offer-failed')
        );
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
 * Injects a small red-dot overlay into the page so the synthetic Playwright
 * cursor is visible when running in headed mode. Playwright dispatches real
 * DOM `mousemove` events, so the overlay tracks every `page.mouse.move` call.
 * No-ops in headless mode so production behaviour is unchanged.
 */
async function injectVisibleCursor(page) {
  if (process.env.PLAYWRIGHT_HEADLESS !== 'false') {
    return;
  }

  // addInitScript runs before any page JS on every navigation, ensuring the
  // dot is present from the first paint and survives client-side route changes.
  await page.addInitScript(() => {
    /* global window */
    function mountCursor() {
      if (document.getElementById('__scraper_cursor__')) {
        return;
      }
      const dot = document.createElement('div');
      dot.id = '__scraper_cursor__';
      // Start at viewport centre so the dot is visible before any mouse move.
      const cx = Math.round(window.innerWidth / 2);
      const cy = Math.round(window.innerHeight / 2);
      // Inline every style as !important so the page's own CSS can't hide it.
      dot.setAttribute('style', [
        'position:fixed !important',
        `top:${cy}px !important`,
        `left:${cx}px !important`,
        'width:18px !important',
        'height:18px !important',
        'background:rgba(220,38,38,0.9) !important',
        'border:2.5px solid #fff !important',
        'border-radius:50% !important',
        'pointer-events:none !important',
        'z-index:2147483647 !important',
        'transform:translate(-50%,-50%) !important',
        'box-shadow:0 0 0 3px rgba(220,38,38,0.35) !important',
        'display:block !important',
        'visibility:visible !important',
        'opacity:1 !important',
      ].join(';'));
      (document.body || document.documentElement).appendChild(dot);
      document.addEventListener('mousemove', (e) => {
        dot.style.setProperty('left', `${e.clientX}px`, 'important');
        dot.style.setProperty('top', `${e.clientY}px`, 'important');
      });
    }
    // Mount immediately if body is ready, otherwise wait for it.
    if (document.body) {
      mountCursor();
    } else {
      document.addEventListener('DOMContentLoaded', mountCursor, { once: true });
    }
  });
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
    await injectVisibleCursor(page);

    if (process.env.PLAYWRIGHT_HEADLESS === 'false' && process.env.PLAYWRIGHT_THROTTLE_3G === 'true') {
      try {
        if (typeof page.context?.().newCDPSession === 'function') {
          const client = await page.context().newCDPSession(page);
          await client.send('Network.enable');
          await client.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 400,
            downloadThroughput: Math.round((400 * 1024) / 8),
            uploadThroughput: Math.round((400 * 1024) / 8),
          });
        }
      } catch {
        // Non-fatal if CDP session is unsupported
      }
    }

    if (process.env.PLAYWRIGHT_HEADLESS === 'false' && process.env.PLAYWRIGHT_START_PAUSE_MS) {
      const pauseMs = Number(process.env.PLAYWRIGHT_START_PAUSE_MS) || 6000;
      await page.waitForTimeout(pauseMs);
    }

    const uiManifest = await navigateToProductAndLoadUiManifest(page, productId);
    await dismissCookieConsent(page, COOKIE_CONSENT_TIMEOUT_MS);
    await selectOption(page, productId, optionId);
    await satisfyPriceInteraction(page);
    await waitForQuote(page);

    // The storefront includes aria-hidden decoys and rotates its real price
    // element. The manifest response from this page identifies the sole
    // visible selling-price element without relying on a fixed tag or class.
    const priceText = await page.locator(priceSelectorFromUiManifest(uiManifest)).innerText();
    const stockText = await page.locator('.offer-panel .avail-pill:visible').innerText();

    const quote = validateQuote({
      price: parseDisplayedPrice(priceText),
      stock: parseDisplayedStock(stockText),
    });

    // Attach the manifest so the persistence layer can detect layout changes.
    // The field is enumerable but ignored by validateQuote and callers that
    // only destructure { price, stock }.
    quote.uiManifest = uiManifest;
    return quote;
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
