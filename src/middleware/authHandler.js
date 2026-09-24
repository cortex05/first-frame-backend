import jwt from "jsonwebtoken";
import User from "../models/User.js";
import "../models/Account.js";
import { buildAuthContext } from "../policies/accountScope.js";
import { createAppError } from "../utils/error.js";

/**
 * Verifies the Bearer JWT and reloads the user and their account on every
 * request, so disabling a user, suspending an account or changing a role takes
 * effect immediately -- nothing about access is trusted from the token.
 *
 * Sets `req.auth` (what services take), plus `req.user` / `req.userId` for the
 * platform-admin gate.
 */
const buildAuthenticate = ({ allowPendingPasswordChange }) => async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if(!token) {
    throw createAppError('No token provided', 401);
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw createAppError('Invalid token', 401);
  }

  const user = await User.findById(decoded.id).select('-password').populate('account');
  // 401 rather than 404: a token for a deleted user is simply not valid.
  if(!user || !user.account) {
    throw createAppError('Invalid token', 401);
  }
  if (user.status !== 'active') {
    throw createAppError('User is disabled', 401);
  }
  if (user.account.status !== 'active') {
    throw createAppError('Account is suspended', 403);
  }
  if (user.mustChangePassword && !allowPendingPasswordChange) {
    throw createAppError('Password change required', 403, 'PASSWORD_CHANGE_REQUIRED');
  }

  req.userId = decoded.id;
  req.user = user;
  req.auth = buildAuthContext(user);
  next();
};

const authenticate = buildAuthenticate({ allowPendingPasswordChange: false });

// For the change-password route only: the one thing a user with a temporary
// password is allowed to do.
authenticate.allowPendingPasswordChange = buildAuthenticate({ allowPendingPasswordChange: true });

export default authenticate;
