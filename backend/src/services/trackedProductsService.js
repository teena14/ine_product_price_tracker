import { randomUUID } from 'crypto';
import { getProductById } from '../scraper/ineHttpClient.js';
import {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts as listTrackedProductsFromRepository,
} from '../repositories/trackedProductsRepository.js';
import { getScrapeHistory } from '../repositories/scrapeAttemptsRepository.js';
import { setTrackedProductFrequency as setFrequency } from '../repositories/scrapeFrequencyRepository.js';
import { scrapeAndPersistTrackedProduct } from './scrapePersistenceService.js';
import { errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Creates a shared tracking record from authoritative INE metadata. The client
 * supplies only product and option identifiers; names and URLs are never
 * trusted from the browser.
 */
export async function createTrackedProductFromSelection({ productId, optionId }) {
  let product;

  try {
    product = await getProductById(productId);
  } catch (error) {
    if (error.status === 404) {
      throw errors.productNotFound(productId);
    }
    throw errors.productCatalogUnavailable();
  }

  const option = product.options.find((candidate) => candidate.optionId === optionId);
  if (!option) {
    throw errors.invalidOption(optionId);
  }

  return createTrackedProduct({
    product_id: product.productId,
    product_url: product.productUrl,
    product_name: product.name,
    option_id: option.optionId,
    option_name: option.label,
  });
}

/**
 * Starts the first quote scrape after a tracking record is safely saved. This
 * never blocks the browser's "Track Product" request: the initial price and
 * scrape log entries arrive shortly afterwards through the normal dashboard
 * refresh flow. Expected scraper failures are persisted as immutable attempts.
 */
export function queueInitialTrackedProductScrape(
  trackedProduct,
  {
    scrapeTrackedProduct = scrapeAndPersistTrackedProduct,
    createRunId = randomUUID,
    log = logger,
  } = {}
) {
  const runId = createRunId();
  const completion = Promise.resolve()
    .then(() => scrapeTrackedProduct(trackedProduct, { runId }))
    .catch((error) => {
      log.error('Initial tracked-product scrape failed unexpectedly', {
        runId,
        trackedProductId: trackedProduct.id,
        productId: trackedProduct.product_id,
        optionId: trackedProduct.option_id,
        error,
      });
    });

  return { runId, completion };
}

/**
 * Creates a shared tracking record, then queues its first quote scrape without
 * delaying the API response. The persisted record remains available even if
 * an unexpected scheduling failure occurs.
 */
export async function createTrackedProductWithInitialScrape(
  { productId, optionId },
  { queueInitialScrape = queueInitialTrackedProductScrape, log = logger } = {}
) {
  const trackedProduct = await createTrackedProductFromSelection({ productId, optionId });

  try {
    queueInitialScrape(trackedProduct, { log });
  } catch (error) {
    log.error('Initial tracked-product scrape could not be queued', {
      trackedProductId: trackedProduct.id,
      productId: trackedProduct.product_id,
      optionId: trackedProduct.option_id,
      error,
    });
  }

  return trackedProduct;
}

export function listTrackedProducts() {
  return listTrackedProductsFromRepository();
}

export function getTrackedProduct(id) {
  return getTrackedProductById(id);
}

/**
 * Public history is available for every shared tracked product. Resolve the
 * parent record first so an unknown UUID remains a 404 rather than looking
 * like an empty, valid history collection.
 */
export async function getTrackedProductHistory(id) {
  const trackedProduct = await getTrackedProductById(id);
  const attempts = await getScrapeHistory(id);

  return { trackedProduct, attempts };
}

/**
 * Feature 4: Sets a custom scrape frequency (in minutes) for a tracked product.
 * Pass frequencyMinutes=null to reset to the global cron schedule.
 */
export async function setTrackedProductFrequency(id, frequencyMinutes) {
  // Verify the product exists first
  await getTrackedProductById(id);
  return setFrequency(id, frequencyMinutes);
}

/**
 * Feature 5: Creates tracking records for multiple options of the same product
 * in one API call, then queues initial scrapes for each. Duplicate options that
 * are already tracked are silently skipped (they throw DUPLICATE_TRACKING which
 * we catch per-item so the rest still succeed).
 */
export async function createMultipleTrackedProducts(
  { productId, optionIds },
  { queueInitialScrape = queueInitialTrackedProductScrape, log = logger } = {}
) {
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    throw errors.validationError('optionIds must be a non-empty array');
  }

  let product;
  try {
    product = await getProductById(productId);
  } catch (error) {
    if (error.status === 404) {
      throw errors.productNotFound(productId);
    }
    throw errors.productCatalogUnavailable();
  }

  const results = [];

  for (const optionId of optionIds) {
    const option = product.options.find((candidate) => candidate.optionId === optionId);
    if (!option) {
      results.push({ optionId, status: 'error', error: 'INVALID_OPTION' });
      continue;
    }

    try {
      const trackedProduct = await createTrackedProduct({
        product_id: product.productId,
        product_url: product.productUrl,
        product_name: product.name,
        option_id: option.optionId,
        option_name: option.label,
      });

      try {
        queueInitialScrape(trackedProduct, { log });
      } catch (queueError) {
        log.error('Initial scrape queue failed for bulk-tracked product', {
          trackedProductId: trackedProduct.id,
          optionId,
          error: queueError,
        });
      }

      results.push({ optionId, status: 'created', trackedProduct });
    } catch (error) {
      if (error.code === 'DUPLICATE_TRACKING') {
        results.push({ optionId, status: 'duplicate' });
      } else {
        results.push({ optionId, status: 'error', error: error.code ?? 'UNKNOWN' });
      }
    }
  }

  return results;
}
