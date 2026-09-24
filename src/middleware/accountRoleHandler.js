import { isAccountAdmin } from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';

/**
 * Gate for account-admin routes. Runs after `authenticate`, which sets
 * `req.auth`. Services assert the same thing; this rejects early, before the
 * body is validated. Not to be confused with `requireAdmin` (platform admin).
 */
const requireAccountAdmin = (req, res, next) => {
  if (!isAccountAdmin(req.auth)) {
    return next(createAppError('Account administrator access is required', 403));
  }

  return next();
};

export default requireAccountAdmin;
