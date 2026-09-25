import { Router } from 'express';
import {
  handleCreateTrackedProduct,
  handleDeactivateTrackedProduct,
  handleGetTrackedProduct,
  handleListTrackedProducts,
} from '../controllers/trackedProductsController.js';

const router = Router();

router.post('/', handleCreateTrackedProduct);
router.get('/', handleListTrackedProducts);
router.get('/:id', handleGetTrackedProduct);
router.delete('/:id', handleDeactivateTrackedProduct);

export default router;
