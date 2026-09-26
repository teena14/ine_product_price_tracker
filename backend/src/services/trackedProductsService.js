import { getProductById } from '../scraper/ineHttpClient.js';
import {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts as listTrackedProductsFromRepository,
} from '../repositories/trackedProductsRepository.js';
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
