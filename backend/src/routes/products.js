import { Router } from 'express';
import {
  handleSearchProducts,
  handleGetProduct,
} from '../controllers/productsController.js';

const router = Router();

// GET /api/products/search?q=<query>
router.get('/search', handleSearchProducts);

// GET /api/products/:productId
router.get('/:productId', handleGetProduct);

export default router;
