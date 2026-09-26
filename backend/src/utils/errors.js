/**
 * Application-level error with a machine-readable code and HTTP status.
 * Thrown from any layer; caught by the centralized Express error handler.
 */
export class AppError extends Error {
  /**
   * @param {string} code  - Machine-readable error code (e.g. PRODUCT_NOT_FOUND)
   * @param {string} message - Human-readable description
   * @param {number} [statusCode=500] - HTTP status to return
   * @param {Array<object>} [details=[]] - Safe, field-level details for clients
   */
  constructor(code, message, statusCode = 500, details = []) {
    super(message);

    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Convenience factory functions for common error codes
export const errors = {
  productNotFound: (id) =>
    new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404, [{ field: 'productId', value: id }]),

  invalidOption: (optionId) =>
    new AppError('INVALID_OPTION', 'The selected option is invalid or unavailable', 400, [
      { field: 'optionId', value: optionId },
    ]),

  trackedProductNotFound: (id) =>
    new AppError('TRACKED_PRODUCT_NOT_FOUND', 'Tracked product not found', 404, [
      { field: 'trackedProductId', value: id },
    ]),

  duplicateTracking: () =>
    new AppError('DUPLICATE_TRACKING', 'This product option is already being tracked', 409),

  cronUnauthorized: () =>
    new AppError('CRON_UNAUTHORIZED', 'Invalid or missing cron secret', 401),

  scrapeTimeout: () =>
    new AppError('SCRAPE_TIMEOUT', 'The scrape timed out before a quote was available', 504),

  scrapeNetworkError: () =>
    new AppError('SCRAPE_NETWORK_ERROR', 'Unable to reach the store while scraping', 502),

  scrapeValidationError: () =>
    new AppError('SCRAPE_VALIDATION_ERROR', 'The store returned an invalid quote', 422),

  quoteUnavailable: () =>
    new AppError('QUOTE_UNAVAILABLE', 'The store could not provide a current quote', 503),

  productCatalogUnavailable: () =>
    new AppError('PRODUCT_CATALOG_UNAVAILABLE', 'The product catalog is temporarily unavailable', 502),

  validationError: (message, details = []) =>
    new AppError('VALIDATION_ERROR', message, 400, details),
};
