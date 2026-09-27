import {
  createTrackedProductWithInitialScrape,
  getTrackedProduct,
  getTrackedProductHistory,
  listTrackedProducts,
  setTrackedProductFrequency,
  createMultipleTrackedProducts,
} from '../services/trackedProductsService.js';
import {
  exportAllTrackedProductsHistory,
  exportTrackedProductHistory,
} from '../services/scrapeExportService.js';
import { listAlertsForProduct } from '../repositories/alertsRepository.js';
import { startActiveTrackedProductScrapeJob } from '../services/scrapeJobService.js';
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

/** POST /api/tracked-products/bulk - track multiple options in one request. */
export async function handleBulkCreateTrackedProducts(req, res, next) {
  try {
    const productId = String(req.body?.productId || '');
    const optionIds = req.body?.optionIds;

    if (!/^\d+$/.test(productId)) {
      throw errors.validationError('productId must be a numeric string');
    }
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      throw errors.validationError('optionIds must be a non-empty array');
    }
    if (optionIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw errors.validationError('each optionId must be a non-empty string');
    }

    const results = await createMultipleTrackedProducts({
      productId,
      optionIds: optionIds.map((id) => id.trim()),
    });
    res.status(207).json({ results });
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

/** GET /api/tracked-products/export - CSV of every product's scrape history. */
export async function handleExportAllTrackedProductsHistory(_req, res, next) {
  try {
    const { csv } = await exportAllTrackedProductsHistory();

    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="all-tracked-products-scrape-history.csv"',
      })
      .send(csv);
  } catch (error) {
    next(error);
  }
}

/** GET /api/tracked-products/:id/alerts - alerts for a specific product. */
export async function handleGetTrackedProductAlerts(req, res, next) {
  try {
    const id = getTrackedProductId(req.params.id);
    // Ensure the product exists
    await getTrackedProduct(id);
    const alerts = await listAlertsForProduct(id);
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/tracked-products/:id/frequency - set custom scrape frequency. */
export async function handleSetTrackedProductFrequency(req, res, next) {
  try {
    const id = getTrackedProductId(req.params.id);
    const { frequencyMinutes } = req.body ?? {};

    // Allow null to reset, or a valid integer >= 5
    if (frequencyMinutes !== null && frequencyMinutes !== undefined) {
      const parsed = Number(frequencyMinutes);
      if (!Number.isSafeInteger(parsed) || parsed < 5) {
        throw errors.validationError('frequencyMinutes must be null or an integer >= 5');
      }
    }

    const updated = await setTrackedProductFrequency(id, frequencyMinutes ?? null);
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/tracked-products/:id/scrape - queue an immediate scrape for one
 * active tracked product. The shared job dispatcher returns immediately and
 * prevents this from overlapping an existing scrape run.
 */
export async function handleScrapeTrackedProductNow(req, res, next) {
  try {
    const trackedProductId = getTrackedProductId(req.params.id);
    const trackedProduct = await getTrackedProduct(trackedProductId);

    if (!trackedProduct.active) {
      throw errors.validationError('Only active tracked products can be scraped');
    }

    const job = startActiveTrackedProductScrapeJob({ trackedProductId });
    res.status(202).json({
      ok: true,
      runId: job.runId,
      status: job.started ? 'started' : 'already_running',
    });
  } catch (error) {
    next(error);
  }
}
