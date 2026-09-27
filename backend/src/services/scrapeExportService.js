import {
  getAllScrapeAttemptsForExport,
  getAllScrapeAttemptsForFullExport,
} from '../repositories/scrapeAttemptsRepository.js';
import {
  getTrackedProductById,
  listAllTrackedProductsForExport,
} from '../repositories/trackedProductsRepository.js';

const CSV_HEADERS = [
  'product_id',
  'product_name',
  'selected_option',
  'timestamp',
  'price',
  'stock',
  'outcome',
];

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatUtcTimestamp(value) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Cannot export a scrape attempt with an invalid timestamp');
  }

  return timestamp.toISOString();
}

function buildCsvRow(trackedProduct, attempt) {
  return [
    trackedProduct.product_id,
    trackedProduct.product_name,
    trackedProduct.option_name,
    formatUtcTimestamp(attempt.scraped_at),
    attempt.outcome === 'success' ? attempt.price : '',
    attempt.outcome === 'success' ? attempt.stock : '',
    attempt.outcome,
  ];
}

function buildCsv(rows) {
  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')
    .concat('\r\n');
}

/**
 * Builds a standards-compatible, chronological CSV without exposing database
 * access to the browser. Retried and failed attempts deliberately have empty
 * price/stock cells because only successful attempts hold a valid quote.
 */
export function buildScrapeHistoryCsv(trackedProduct, attempts) {
  const rows = attempts.map((attempt) => buildCsvRow(trackedProduct, attempt));

  return buildCsv(rows);
}

/**
 * Builds one chronological file for every product and every recorded scrape
 * attempt. The tracked-product lookup prevents a partial, mislabelled export
 * if the database ever contains an orphaned attempt.
 */
export function buildAllScrapeHistoriesCsv(trackedProducts, attempts) {
  const productsById = new Map(trackedProducts.map((product) => [product.id, product]));
  const rows = attempts.map((attempt) => {
    const trackedProduct = productsById.get(attempt.tracked_product_id);
    if (!trackedProduct) {
      throw new Error('Cannot export a scrape attempt without its tracked product');
    }

    return buildCsvRow(trackedProduct, attempt);
  });

  return buildCsv(rows);
}

/**
 * Resolve the parent before querying attempts so an unknown tracked product
 * remains a 404 rather than producing an empty export that appears valid.
 */
export async function exportTrackedProductHistory(id) {
  const trackedProduct = await getTrackedProductById(id);
  const attempts = await getAllScrapeAttemptsForExport(id);

  return {
    trackedProduct,
    csv: buildScrapeHistoryCsv(trackedProduct, attempts),
  };
}

/**
 * Produces a complete CSV for the main page. Both queries are read-only and
 * include historical inactive products, so the file remains a full audit of
 * every scrape recorded up to the time the queries run.
 */
export async function exportAllTrackedProductsHistory() {
  const [trackedProducts, attempts] = await Promise.all([
    listAllTrackedProductsForExport(),
    getAllScrapeAttemptsForFullExport(),
  ]);

  return { csv: buildAllScrapeHistoriesCsv(trackedProducts, attempts) };
}
