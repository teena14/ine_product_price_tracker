import { IneHttpError, searchProducts, getProductById } from '../scraper/ineHttpClient.js';
import { errors } from '../utils/errors.js';

/**
 * GET /api/products/search?q=<query>
 *
 * Proxies the INE catalog search. Frontend never calls INE directly.
 */
export async function handleSearchProducts(req, res, next) {
  try {
    const query = req.query.q?.trim();
    if (!query || query.length < 1) {
      throw errors.validationError('Query parameter "q" is required');
    }

    const requestedPage = req.query.page;
    if (requestedPage !== undefined && !/^[1-9]\d*$/.test(requestedPage)) {
      throw errors.validationError('Query parameter "page" must be a positive integer');
    }
    const page = requestedPage === undefined ? 1 : Number(requestedPage);
    const result = await searchProducts(query, { page });

    res.json(result);
  } catch (err) {
    next(err instanceof IneHttpError ? errors.productCatalogUnavailable() : err);
  }
}

/**
 * GET /api/products/:productId
 *
 * Returns product details and available options.
 */
export async function handleGetProduct(req, res, next) {
  try {
    const { productId } = req.params;

    if (!productId || !/^\d+$/.test(productId)) {
      throw errors.validationError('productId must be a numeric string');
    }

    const product = await getProductById(productId);

    // getProductById throws a fetch error on 404, which we map to PRODUCT_NOT_FOUND
    if (!product) {
      throw errors.productNotFound(productId);
    }

    res.json(product);
  } catch (err) {
    // Only a genuine upstream 404 maps to the public not-found response.
    if (err.status === 404) {
      return next(errors.productNotFound(req.params.productId));
    }
    next(err instanceof IneHttpError ? errors.productCatalogUnavailable() : err);
  }
}
