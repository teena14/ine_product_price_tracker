import { Router } from 'express';
import {
  handleCreateTrackedProduct,
  handleExportTrackedProductHistory,
  handleGetTrackedProduct,
  handleGetTrackedProductHistory,
  handleListTrackedProducts,
} from '../controllers/trackedProductsController.js';

const router = Router();

router.post('/', handleCreateTrackedProduct);
router.get('/', handleListTrackedProducts);
router.get('/:id/history', handleGetTrackedProductHistory);
router.get('/:id/export', handleExportTrackedProductHistory);
router.get('/:id', handleGetTrackedProduct);

export default router;
