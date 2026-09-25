import { randomBytes } from 'crypto';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ine_tracker_session';
// 30 days in milliseconds
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Anonymous session middleware.
 *
 * On every request:
 *   - Read the session ID from the HttpOnly cookie.
 *   - If no valid cookie exists, generate a cryptographically random session ID
 *     and set it in the response cookie.
 *   - Attach the session ID to req.sessionId for downstream use.
 *
 * Security properties:
 *   - HttpOnly: not accessible to frontend JavaScript.
 *   - Secure: HTTPS-only in production.
 *   - SameSite=Lax: protects against CSRF while allowing normal navigation.
 *   - Session ID is 32 random bytes (hex) = 256 bits of entropy.
 *   - Never sourced from request body, query string, or URL params.
 *   - Never logged.
 */
export function sessionMiddleware(req, res, next) {
  let sessionId = req.cookies?.[COOKIE_NAME];

  // Validate: must be a non-empty string of hex characters (64 hex chars = 32 bytes)
  const isValid = typeof sessionId === 'string' && /^[0-9a-f]{64}$/.test(sessionId);

  if (!isValid) {
    // Generate a new cryptographically random session ID
    sessionId = randomBytes(32).toString('hex');

    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: MAX_AGE_MS,
    });
  }

  // Attach to request — never log this value
  req.sessionId = sessionId;

  next();
}

/**
 * Returns the current session ID from the request.
 * Throws if the middleware was not applied (should never happen in normal flow).
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getSessionId(req) {
  if (!req.sessionId) {
    throw new Error('sessionMiddleware must be applied before getSessionId is called');
  }
  return req.sessionId;
}
