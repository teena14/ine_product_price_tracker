import { Router } from 'express';
import {
  handleCreateTrackedProduct,
  handleBulkCreateTrackedProducts,
  handleExportAllTrackedProductsHistory,
  handleExportTrackedProductHistory,
  handleGetTrackedProduct,
  handleGetTrackedProductHistory,
  handleGetTrackedProductAlerts,
  handleListTrackedProducts,
  handleScrapeTrackedProductNow,
  handleSetTrackedProductFrequency,
} from '../controllers/trackedProductsController.js';

const router = Router();

// Collection routes
router.post('/', handleCreateTrackedProduct);
router.post('/bulk', handleBulkCreateTrackedProducts);
router.get('/', handleListTrackedProducts);
router.get('/export', handleExportAllTrackedProductsHistory);

// Resource routes
router.get('/:id/history', handleGetTrackedProductHistory);
router.get('/:id/export', handleExportTrackedProductHistory);
router.get('/:id/alerts', handleGetTrackedProductAlerts);
router.post('/:id/scrape', handleScrapeTrackedProductNow);
router.patch('/:id/frequency', handleSetTrackedProductFrequency);
router.get('/:id', handleGetTrackedProduct);

export default router;
