/**
 * INE HTTP product client.
 *
 * Talks to the INE mock store catalog API using plain fetch (no Playwright needed).
 * All INE API details are encapsulated here — the rest of the app uses normalized types.
 *
 * Confirmed API structure from live exploration:
 *
 * GET /api/v2/listings
 *   Query params: search (string), page (number) — returns 20 per page
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
 * Search products by partial or full name.
 * The INE API accepts a `search` query param.
 *
 * @param {string} query - search term (e.g. "camera", "Halvard")
 * @param {{ page?: number }} [options]
 * @returns {Promise<{ products: NormalizedProduct[], total: number, page: number, totalPages: number }>}
 */
export async function searchProducts(query, options = {}) {
  const params = new URLSearchParams({
    search: query,
  });
  if (options.page) {
    params.set('page', String(options.page));
  }

  const url = `${BASE_URL}/api/v2/listings?${params}`;
  const data = await fetchWithTimeout(url);

  return {
    products: (data.results || []).map(normalizeProduct),
    total: data.count || 0,
    page: data.page || 1,
    totalPages: data.totalPages || 1,
  };
}

/**
 * Get product details and available options by product ID.
 *
 * @param {string} productId - numeric product ID as string
 * @returns {Promise<NormalizedProductDetail>}
 */
export async function getProductById(productId) {
  const url = `${BASE_URL}/api/v2/items/${productId}`;
  const data = await fetchWithTimeout(url);

  return normalizeProductDetail(data);
}
