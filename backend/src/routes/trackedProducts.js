import { Router } from 'express';
import {
  handleCreateTrackedProduct,
  handleGetTrackedProduct,
  handleListTrackedProducts,
} from '../controllers/trackedProductsController.js';

const router = Router();

router.post('/', handleCreateTrackedProduct);
router.get('/', handleListTrackedProducts);
router.get('/:id', handleGetTrackedProduct);

export default router;
