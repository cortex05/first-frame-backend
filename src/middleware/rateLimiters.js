import jwt from 'jsonwebtoken';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;
const isProduction = () => process.env.NODE_ENV === 'production';

// JSON so the client reads the reason off `data.message`, like every other
// error this API returns.
const TOO_MANY = { message: 'Too many requests, please try again later.' };

/**
 * The user id from a valid Bearer token, or null. Verified rather than decoded,
 * so a forged id cannot buy anyone a fresh budget. Expired or invalid tokens
 * fall back to the IP budget; `authenticate` rejects them anyway.
 */
const userIdFromToken = (req) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET)?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * The general budget for every /api request. Signed-in users are counted per
 * user, so an office behind one IP doesn't share a single budget, and get a
 * larger one: running a case saves after every question. Anonymous requests
 * are counted per IP.
 */
export const createApiLimiter = ({
  windowMs = WINDOW_MS,
  authenticatedLimit = isProduction() ? 600 : 6000,
  anonymousLimit = isProduction() ? 100 : 1000,
} = {}) =>
  rateLimit({
    windowMs,
    limit: (req) => (userIdFromToken(req) ? authenticatedLimit : anonymousLimit),
    keyGenerator: (req) => {
      const userId = userIdFromToken(req);
      return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    message: TOO_MANY,
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Login and change-password: per IP, and only failed attempts count, so
 * someone who types their password correctly is never locked out while
 * password guessing is.
 */
export const createCredentialLimiter = ({
  windowMs = WINDOW_MS,
  limit = isProduction() ? 20 : 200,
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    message: { message: 'Too many failed attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

/** Registration: per IP, every attempt counts, so accounts can't be mass-created. */
export const createRegisterLimiter = ({
  windowMs = 60 * 60 * 1000,
  limit = isProduction() ? 10 : 100,
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    message: TOO_MANY,
    standardHeaders: true,
    legacyHeaders: false,
  });

export const apiLimiter = createApiLimiter();
export const credentialLimiter = createCredentialLimiter();
export const registerLimiter = createRegisterLimiter();
