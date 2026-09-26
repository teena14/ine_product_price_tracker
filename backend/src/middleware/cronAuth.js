import { timingSafeEqual } from 'crypto';
import { errors } from '../utils/errors.js';

function bearerToken(authorization) {
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : null;
}

/**
 * Checks the cron bearer secret without logging or returning either secret.
 * A missing server configuration deliberately behaves like an unauthorized
 * request so a deployment mistake cannot expose the internal trigger.
 */
export function isAuthorizedCronRequest(authorization, expectedSecret = process.env.CRON_SECRET) {
  const suppliedSecret = bearerToken(authorization);
  if (
    typeof expectedSecret !== 'string' ||
    expectedSecret.length === 0 ||
    typeof suppliedSecret !== 'string'
  ) {
    return false;
  }

  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);

  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function requireCronAuth(req, _res, next) {
  if (!isAuthorizedCronRequest(req.get('Authorization'))) {
    return next(errors.cronUnauthorized());
  }

  next();
}
