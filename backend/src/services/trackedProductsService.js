import { getProductById } from '../scraper/ineHttpClient.js';
import {
  createTrackedProduct,
  deactivateTrackedProduct,
  getTrackedProductByIdAndSession,
  listTrackedProductsBySession,
} from '../repositories/trackedProductsRepository.js';
import { errors } from '../utils/errors.js';

/**
 * Creates a tracked product from an INE product and option selection.
 *
 * Product and option metadata is always retrieved from INE here. The browser
 * only supplies identifiers, so it cannot forge a product name, option name,
 * or URL that gets persisted.
 */
export async function createTrackedProductForSession({ productId, optionId, sessionId }) {
  let product;

  try {
    product = await getProductById(productId);
  } catch (error) {
    if (error.message?.includes('status 404')) {
      throw errors.productNotFound(productId);
    }
    throw error;
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
    session_id: sessionId,
  });
}

export function listTrackedProductsForSession(sessionId) {
  return listTrackedProductsBySession(sessionId);
}

export function getTrackedProductForSession(id, sessionId) {
  return getTrackedProductByIdAndSession(id, sessionId);
}

export function deactivateTrackedProductForSession(id, sessionId) {
  return deactivateTrackedProduct(id, sessionId);
}
