import { createAppError } from '../utils/error.js';

/**
 * PLATFORM admin gate (`User.isAdmin`), for writes to resources shared across
 * every account, i.e. Recommended sets. Unrelated to the account admin role --
 * see `requireAccountAdmin`. Runs after `authenticate`, which is what puts
 * `req.user` in place.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return next(createAppError('Administrator access is required', 403));
  }

  return next();
};

export default requireAdmin;
