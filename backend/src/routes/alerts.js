import { Router } from 'express';
import {
  handleListAlerts,
  handleMarkAllAlertsRead,
  handleMarkAlertRead,
} from '../controllers/alertsController.js';

const router = Router();

router.get('/', handleListAlerts);
router.post('/read-all', handleMarkAllAlertsRead);
router.post('/:id/read', handleMarkAlertRead);

export default router;
