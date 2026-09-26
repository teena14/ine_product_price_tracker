import { getProductById } from '../scraper/ineHttpClient.js';
import {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts as listTrackedProductsFromRepository,
} from '../repositories/trackedProductsRepository.js';
import { getScrapeHistory } from '../repositories/scrapeAttemptsRepository.js';
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
 * Creates a shared tracking record and immediately records its first quote.
 * Expected scraper failures are returned by the retry service and persisted
 * as immutable attempts. If persistence itself fails unexpectedly, retain the
 * successfully created tracking record so a visitor is not encouraged to
 * retry the add action and hit the global duplicate constraint.
 */
export async function createTrackedProductWithInitialScrape(
  { productId, optionId },
  { scrapeTrackedProduct = scrapeAndPersistTrackedProduct, log = logger } = {}
) {
  const trackedProduct = await createTrackedProductFromSelection({ productId, optionId });

  try {
    await scrapeTrackedProduct(trackedProduct);
  } catch (error) {
    log.error('Initial tracked-product scrape failed unexpectedly', {
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
