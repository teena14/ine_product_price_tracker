/**
 * INE HTTP product client.
 *
 * Talks to the INE mock store catalog API using plain fetch (no Playwright needed).
 * All INE API details are encapsulated here — the rest of the app uses normalized types.
 *
 * Confirmed API structure from live exploration:
 *
 * GET /api/v2/listings
 *   Query params: page (number) — returns 20 per page
 *   Response: { page, perPage, totalPages, count, results: Product[] }
 *
 * GET /api/v2/items/:id
 *   Response: { id, slug, name, brand, category, sku, description,
 *               specs, reviews, optionAxis, options: [{id, label}] }
 *
 * Product URL pattern: /item/:id
 */

const BASE_URL = process.env.INE_BASE_URL || 'https://demo.inelabteamdev.com';
const REQUEST_TIMEOUT_MS = 10000;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_PAGE_LIMIT = 60;
const CATALOG_PAGE_CONCURRENCY = 3;
const CATALOG_PAGE_MAX_ATTEMPTS = 3;
const CATALOG_PAGE_RETRY_DELAY_MS = 300;

let catalogCache;
let catalogLoadPromise;
const productDetailCache = new Map();

export class IneHttpError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'IneHttpError';
    this.code = code;
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Fetch with a timeout to avoid hanging indefinitely.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new IneHttpError('INE_HTTP_ERROR', `INE API responded with status ${response.status}`, {
        status: response.status,
      });
    }

    return response.json();
  } catch (err) {
    if (err instanceof IneHttpError) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw new IneHttpError('INE_HTTP_TIMEOUT', `INE API request timed out after ${REQUEST_TIMEOUT_MS}ms`, {
        cause: err,
      });
    }
    throw new IneHttpError('INE_NETWORK_ERROR', 'INE API request failed', { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalize a raw INE listing result into our application type.
 * Keeps only the fields we actually use.
 *
 * @param {object} raw
 * @returns {NormalizedProduct}
 */
function normalizeProduct(raw) {
  return {
    productId: String(raw.id),
    slug: raw.slug,
    name: raw.name,
    brand: raw.brand,
    category: raw.category,
    sku: raw.sku,
    description: raw.description,
    productUrl: `${BASE_URL}/item/${raw.id}`,
  };
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

function pageCount(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function pageSize(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 20;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRetryableCatalogError(error) {
  return (
    error instanceof IneHttpError &&
    (error.code === 'INE_HTTP_TIMEOUT' ||
      error.code === 'INE_NETWORK_ERROR' ||
      error.status === 429 ||
      error.status >= 500)
  );
}

async function fetchCatalogPage(page) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(CATALOG_PAGE_LIMIT),
  });
  const url = `${BASE_URL}/api/v2/listings?${params}`;

  for (let attempt = 1; attempt <= CATALOG_PAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchWithTimeout(url);
    } catch (error) {
      if (attempt === CATALOG_PAGE_MAX_ATTEMPTS || !isRetryableCatalogError(error)) {
        throw error;
      }

      await wait(CATALOG_PAGE_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw new Error('Catalog page retry loop ended unexpectedly');
}

async function fetchRemainingCatalogPages(totalPages) {
  const pagesToLoad = Math.max(0, totalPages - 1);
  const results = new Array(pagesToLoad);
  let nextPage = 2;

  async function loadNextPages() {
    while (nextPage <= totalPages) {
      const page = nextPage;
      nextPage += 1;
      results[page - 2] = await fetchCatalogPage(page);
    }
  }

  // Fetch a small number of pages at once: this removes most first-search
  // latency without overwhelming INE's deliberately unreliable mock API. A
  // transient overload is still handled by fetchCatalogPage's retry policy.
  await Promise.all(
    Array.from({ length: Math.min(CATALOG_PAGE_CONCURRENCY, pagesToLoad) }, loadNextPages)
  );

  return results;
}

async function loadCatalog() {
  const firstPage = await fetchCatalogPage(1);
  const remainingPages = await fetchRemainingCatalogPages(pageCount(firstPage.totalPages));

  return {
    pageSize: pageSize(firstPage.perPage),
    products: [firstPage, ...remainingPages].flatMap((page) =>
      (page.results || []).map(normalizeProduct)
    ),
  };
}

async function getCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.value;
  }

  if (!catalogLoadPromise) {
    catalogLoadPromise = loadCatalog();
  }

  try {
    const value = await catalogLoadPromise;
    catalogCache = { value, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
    return value;
  } finally {
    catalogLoadPromise = undefined;
  }
}

/** Clears process-local catalog state so each HTTP-mocked test starts clean. */
export function resetCatalogCacheForTests() {
  catalogCache = undefined;
  catalogLoadPromise = undefined;
  productDetailCache.clear();
}

/**
 * Normalize a raw INE item detail into our application type.
 *
 * @param {object} raw
 * @returns {NormalizedProductDetail}
 */
function normalizeProductDetail(raw) {
  return {
    productId: String(raw.id),
    slug: raw.slug,
    name: raw.name,
    brand: raw.brand,
    category: raw.category,
    sku: raw.sku,
    description: raw.description,
    productUrl: `${BASE_URL}/item/${raw.id}`,
    specs: raw.specs || {},
    optionAxis: raw.optionAxis || null,
    options: (raw.options || []).map((opt) => ({
      optionId: String(opt.id),
      label: opt.label,
    })),
  };
}

/**
 * Search products by partial or full name. The upstream listing endpoint can
 * return its entire catalog even when given a search query, so this client
 * owns normalized name filtering and paginates the truthful result set.
 *
 * @param {string} query - search term (e.g. "camera", "Halvard")
 * @param {{ page?: number }} [options]
 * @returns {Promise<{ products: NormalizedProduct[], total: number, page: number, totalPages: number }>}
 */
export async function searchProducts(query, options = {}) {
  const catalog = await getCatalog();
  const searchQuery = normalizeSearchText(query);
  const filteredProducts = catalog.products.filter((product) =>
    normalizeSearchText(product.name).includes(searchQuery)
  );
  const total = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(total / catalog.pageSize));
  const requestedPage = Number.isSafeInteger(options.page) && options.page > 0 ? options.page : 1;
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * catalog.pageSize;

  return {
    products: filteredProducts.slice(start, start + catalog.pageSize),
    total,
    page,
    totalPages,
  };
}

/**
 * Get product details and available options by product ID.
 *
 * @param {string} productId - numeric product ID as string
 * @returns {Promise<NormalizedProductDetail>}
 */
export async function getProductById(productId) {
  const normalizedProductId = String(productId);
  const cached = productDetailCache.get(normalizedProductId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `${BASE_URL}/api/v2/items/${encodeURIComponent(normalizedProductId)}`;
  const data = await fetchWithTimeout(url);
  const product = normalizeProductDetail(data);

  productDetailCache.set(normalizedProductId, {
    value: product,
    expiresAt: Date.now() + PRODUCT_DETAIL_CACHE_TTL_MS,
  });

  return product;
}
