import Account from '../models/Account.js';
import User, { ACCOUNT_ROLES, USER_STATUSES } from '../models/User.js';
import { assertAccountAdmin, assertValidObjectId } from '../policies/accountScope.js';
import { createAppError, isDuplicateKeyError } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import { hashPassword, validatePassword } from './userService.js';

const MAX_ACCOUNT_NAME_LENGTH = 80;
const ACCOUNT_FIELDS = '_id name status createdAt';
const USER_FIELDS = '_id username email role status mustChangePassword createdAt';

export const getAccount = async (auth) => {
  const account = await Account.findById(auth.accountId).select(ACCOUNT_FIELDS);
  if (!account) {
    throw createAppError('Account not found', 404);
  }
  return account;
};

export const renameAccount = async (auth, name) => {
  assertAccountAdmin(auth);

  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw createAppError(`Account name must be 1-${MAX_ACCOUNT_NAME_LENGTH} characters`, 400);
  }

  const account = await Account.findByIdAndUpdate(
    auth.accountId,
    { $set: { name: trimmed } },
    { returnDocument: 'after', runValidators: true }
  ).select(ACCOUNT_FIELDS);

  if (!account) {
    throw createAppError('Account not found', 404);
  }
  return account;
};

// Open to everyone in the account: members need names for owners and authors.
export const listAccountUsers = async (auth) =>
  User.find({ account: auth.accountId }).select(USER_FIELDS).sort({ createdAt: 1 });

/**
 * An admin adds a user to their own account with a temporary password. The
 * user has to change it before they can do anything else.
 */
export const createAccountUser = async (auth, { username, email, password, role = 'member' } = {}) => {
  assertAccountAdmin(auth);

  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedUsername || !normalizedEmail || !password) {
    throw createAppError('Username, email, and password are required', 400);
  }
  if (!ACCOUNT_ROLES.includes(role)) {
    throw createAppError(`role must be one of: ${ACCOUNT_ROLES.join(', ')}`, 400);
  }
  validatePassword(password);

  try {
    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: await hashPassword(password),
      account: auth.accountId,
      role,
      mustChangePassword: true,
    });

    return User.findById(user._id).select(USER_FIELDS);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw createAppError('Email or username already in use', 409);
    }
    throw error;
  }
};

/**
 * Changes a user's role and/or status. An account must always keep at least
 * one active admin, so a change that would remove the last one is refused --
 * including an admin demoting or disabling themselves. The check and the write
 * share a transaction so two admins cannot demote each other at the same time.
 */
export const updateAccountUser = async (auth, targetUserId, { role, status } = {}) => {
  assertAccountAdmin(auth);
  assertValidObjectId(targetUserId, 'user id');

  if (role === undefined && status === undefined) {
    throw createAppError('role or status is required', 400);
  }
  if (role !== undefined && !ACCOUNT_ROLES.includes(role)) {
    throw createAppError(`role must be one of: ${ACCOUNT_ROLES.join(', ')}`, 400);
  }
  if (status !== undefined && !USER_STATUSES.includes(status)) {
    throw createAppError(`status must be one of: ${USER_STATUSES.join(', ')}`, 400);
  }

  return withTransaction(async (session) => {
    const target = await User.findOne({ _id: targetUserId, account: auth.accountId }).session(session);
    if (!target) {
      throw createAppError('User not found', 404);
    }

    const isActiveAdmin = target.role === 'admin' && target.status === 'active';
    const nextRole = role ?? target.role;
    const nextStatus = status ?? target.status;
    const staysActiveAdmin = nextRole === 'admin' && nextStatus === 'active';

    if (isActiveAdmin && !staysActiveAdmin) {
      const otherActiveAdmins = await User.countDocuments({
        account: auth.accountId,
        role: 'admin',
        status: 'active',
        _id: { $ne: target._id },
      }).session(session);

      if (otherActiveAdmins === 0) {
        throw createAppError('An account must keep at least one active administrator', 409);
      }

      // Two admins demoting each other write different user documents, so
      // snapshot isolation alone would let both commit and leave no admin.
      // Writing the shared account document makes the second transaction hit a
      // write conflict; the retry then re-runs the count against fresh data.
      await Account.updateOne(
        { _id: auth.accountId },
        { $currentDate: { updatedAt: true } },
        { session }
      );
    }

    target.role = nextRole;
    target.status = nextStatus;
    await target.save({ session });

    return User.findById(target._id).select(USER_FIELDS).session(session);
  });
};
