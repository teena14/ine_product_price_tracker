import { getSessionId } from '../middleware/session.js';
import {
  createTrackedProductForSession,
  deactivateTrackedProductForSession,
  getTrackedProductForSession,
  listTrackedProductsForSession,
} from '../services/trackedProductsService.js';
import { errors } from '../utils/errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTrackedProductId(id) {
  if (!UUID_PATTERN.test(id)) {
    throw errors.validationError('Tracked product id must be a UUID');
  }
  return id;
}

/** POST /api/tracked-products */
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

    const trackedProduct = await createTrackedProductForSession({
      productId,
      optionId,
      sessionId: getSessionId(req),
    });

    res.status(201).json(trackedProduct);
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products */
export async function handleListTrackedProducts(req, res, next) {
  try {
    const trackedProducts = await listTrackedProductsForSession(getSessionId(req));
    res.json({ trackedProducts });
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products/:id */
export async function handleGetTrackedProduct(req, res, next) {
  try {
    const trackedProduct = await getTrackedProductForSession(
      getTrackedProductId(req.params.id),
      getSessionId(req)
    );
    res.json(trackedProduct);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/tracked-products/:id */
export async function handleDeactivateTrackedProduct(req, res, next) {
  try {
    await deactivateTrackedProductForSession(getTrackedProductId(req.params.id), getSessionId(req));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
