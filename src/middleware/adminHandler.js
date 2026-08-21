import { createAppError } from '../utils/error.js';

/**
 * Gate for writes to resources shared across all users. Runs after
 * `authenticate`, which is what puts `req.user` in place.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return next(createAppError('Administrator access is required', 403));
  }

  return next();
};

export default requireAdmin;
