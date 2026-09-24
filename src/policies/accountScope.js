import mongoose from 'mongoose';
import { createAppError } from '../utils/error.js';

/**
 * The single place that decides what a caller can see inside their account.
 * Every case, archived-case and playlist query builds its filter here, so the
 * access rules cannot drift between services.
 *
 * Out-of-scope records are reported as 404 by the callers, never 403, so the
 * existence of another account's (or another owner's) data is not revealed.
 */

/**
 * Built once per request by `authenticate` from the freshly loaded user.
 * Account and role always come from the database, never from the JWT.
 */
export const buildAuthContext = (user) => ({
  userId: String(user._id),
  accountId: String(user.account?._id ?? user.account),
  role: user.role,
  isPlatformAdmin: Boolean(user.isAdmin),
});

export const isAccountAdmin = (auth) => auth?.role === 'admin';

export const assertAccountAdmin = (auth) => {
  if (!isAccountAdmin(auth)) {
    throw createAppError('Account administrator access is required', 403);
  }
};

export const assertValidObjectId = (value, label) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw createAppError(`Valid ${label} is required`, 400);
  }
};

// Admins see every case in the account; everyone else only the cases they own.
export const caseScopeFilter = (auth) =>
  isAccountAdmin(auth)
    ? { account: auth.accountId }
    : { account: auth.accountId, owners: auth.userId };

// Same rule, applied to the owners captured in the snapshot at archive time.
export const archivedCaseScopeFilter = (auth) => caseScopeFilter(auth);

// Every playlist in the account is visible to everyone in it.
export const playlistScopeFilter = (auth) => ({ account: auth.accountId });

export const canWritePlaylist = (auth, playlist) =>
  isAccountAdmin(auth) || String(playlist.createdBy) === auth.userId;
