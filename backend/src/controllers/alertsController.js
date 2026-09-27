import {
  listAlerts,
  markAllAlertsRead,
  markAlertRead,
  countUnreadAlerts,
} from '../repositories/alertsRepository.js';
import { errors } from '../utils/errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET /api/alerts — all alerts, newest first. Optional ?unread=1 */
export async function handleListAlerts(req, res, next) {
  try {
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const alerts = await listAlerts({ unreadOnly, limit: 100 });
    const unreadCount = await countUnreadAlerts();
    res.json({ alerts, unreadCount });
  } catch (error) {
    next(error);
  }
}

/** POST /api/alerts/read-all — marks all alerts as read */
export async function handleMarkAllAlertsRead(_req, res, next) {
  try {
    await markAllAlertsRead();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/** POST /api/alerts/:id/read — marks a single alert as read */
export async function handleMarkAlertRead(req, res, next) {
  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      throw errors.validationError('Alert id must be a UUID');
    }
    await markAlertRead(id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}
