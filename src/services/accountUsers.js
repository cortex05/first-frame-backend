import mongoose from 'mongoose';
import User from '../models/User.js';
import { createAppError } from '../utils/error.js';

/**
 * Validates a list of user ids that are about to be written onto a case
 * (its owners). Each must be an active user of the given account. Returns
 * the ids deduplicated, in first-seen order.
 */
export const assertActiveAccountUsers = async (accountId, userIds) => {
  if (!Array.isArray(userIds)) {
    throw createAppError('owners must be an array', 400);
  }

  const unique = [...new Set(userIds.map((id) => String(id)))];

  if (unique.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw createAppError('owners must contain valid user ids', 400);
  }

  if (unique.length === 0) {
    return [];
  }

  const activeCount = await User.countDocuments({
    _id: { $in: unique },
    account: accountId,
    status: 'active',
  });

  if (activeCount !== unique.length) {
    throw createAppError('owners must be active users of this account', 400);
  }

  return unique;
};
