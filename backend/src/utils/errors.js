/**
 * Application-level error with a machine-readable code and HTTP status.
 * Thrown from any layer; caught by the centralized Express error handler.
 */
export class AppError extends Error {
  /**
   * @param {string} code  - Machine-readable error code (e.g. PRODUCT_NOT_FOUND)
   * @param {string} message - Human-readable description
   * @param {number} [statusCode=500] - HTTP status to return
   */
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Convenience factory functions for common error codes
export const errors = {
  productNotFound: (id) =>
    new AppError('PRODUCT_NOT_FOUND', `Product not found: ${id}`, 404),

  invalidOption: (optionId) =>
    new AppError('INVALID_OPTION', `Invalid or unavailable option: ${optionId}`, 400),

  trackedProductNotFound: (id) =>
    new AppError('TRACKED_PRODUCT_NOT_FOUND', `Tracked product not found: ${id}`, 404),

  duplicateTracking: () =>
    new AppError('DUPLICATE_TRACKING', 'This product option is already being tracked', 409),

  cronUnauthorized: () =>
    new AppError('CRON_UNAUTHORIZED', 'Invalid or missing cron secret', 401),

  scrapeTimeout: (productId) =>
    new AppError('SCRAPE_TIMEOUT', `Scrape timed out for product: ${productId}`, 504),

  scrapeNetworkError: (message) =>
    new AppError('SCRAPE_NETWORK_ERROR', `Network error during scrape: ${message}`, 502),

  scrapeValidationError: (message) =>
    new AppError('SCRAPE_VALIDATION_ERROR', `Scraped data failed validation: ${message}`, 422),

  quoteUnavailable: (productId) =>
    new AppError('QUOTE_UNAVAILABLE', `Price quote unavailable for product: ${productId}`, 503),

  validationError: (message) =>
    new AppError('VALIDATION_ERROR', message, 400),
};
