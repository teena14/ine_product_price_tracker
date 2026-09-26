import { getAllScrapeAttemptsForExport } from '../repositories/scrapeAttemptsRepository.js';
import { getTrackedProductById } from '../repositories/trackedProductsRepository.js';

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

/**
 * Builds a standards-compatible, chronological CSV without exposing database
 * access to the browser. Retried and failed attempts deliberately have empty
 * price/stock cells because only successful attempts hold a valid quote.
 */
export function buildScrapeHistoryCsv(trackedProduct, attempts) {
  const rows = attempts.map((attempt) => [
    trackedProduct.product_id,
    trackedProduct.product_name,
    trackedProduct.option_name,
    formatUtcTimestamp(attempt.scraped_at),
    attempt.outcome === 'success' ? attempt.price : '',
    attempt.outcome === 'success' ? attempt.stock : '',
    attempt.outcome,
  ]);

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')
    .concat('\r\n');
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
