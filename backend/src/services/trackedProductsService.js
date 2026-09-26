import { getProductById } from '../scraper/ineHttpClient.js';
import {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts as listTrackedProductsFromRepository,
} from '../repositories/trackedProductsRepository.js';
import { getScrapeHistory } from '../repositories/scrapeAttemptsRepository.js';
import { errors } from '../utils/errors.js';

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
