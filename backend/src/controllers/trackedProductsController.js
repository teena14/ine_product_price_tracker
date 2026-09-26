import {
  createTrackedProductWithInitialScrape,
  getTrackedProduct,
  getTrackedProductHistory,
  listTrackedProducts,
} from '../services/trackedProductsService.js';
import { exportTrackedProductHistory } from '../services/scrapeExportService.js';
import { errors } from '../utils/errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTrackedProductId(id) {
  if (!UUID_PATTERN.test(id)) {
    throw errors.validationError('Tracked product id must be a UUID');
  }
  return id;
}

/** POST /api/tracked-products - public, additive shared-dashboard action. */
export async function handleCreateTrackedProduct(req, res, next) {
  try {
    const productId = String(req.body?.productId || '');
    const optionId = typeof req.body?.optionId === 'string' ? req.body.optionId.trim() : '';

    if (!/^\d+$/.test(productId)) {
      throw errors.validationError('productId must be a numeric string');
    }
    if (!optionId) {
      throw errors.validationError('optionId is required');
    }

    const trackedProduct = await createTrackedProductWithInitialScrape({ productId, optionId });
    res.status(201).json(trackedProduct);
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products - public shared dashboard list. */
export async function handleListTrackedProducts(_req, res, next) {
  try {
    const trackedProducts = await listTrackedProducts();
    res.json({ trackedProducts });
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products/:id - public shared dashboard detail. */
export async function handleGetTrackedProduct(req, res, next) {
  try {
    const trackedProduct = await getTrackedProduct(getTrackedProductId(req.params.id));
    res.json(trackedProduct);
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products/:id/history - public immutable scrape history. */
export async function handleGetTrackedProductHistory(req, res, next) {
  try {
    const history = await getTrackedProductHistory(getTrackedProductId(req.params.id));
    res.json(history);
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products/:id/export - public CSV of immutable history. */
export async function handleExportTrackedProductHistory(req, res, next) {
  try {
    const { trackedProduct, csv } = await exportTrackedProductHistory(getTrackedProductId(req.params.id));
    const filename = `tracked-product-${trackedProduct.id}-scrape-history.csv`;

    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      })
      .send(csv);
  } catch (error) {
    next(error);
  }
}
