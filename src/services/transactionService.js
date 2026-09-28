import Case from '../models/Case.js';
import Transaction, { TRANSACTION_STATUSES } from '../models/Transaction.js';
import {
  assertAccountAdmin,
  assertValidObjectId,
  caseScopeFilter,
  transactionScopeFilter,
} from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
import { normalizeTimeZone } from '../utils/timezone.js';

/**
 * The only module that writes Transaction documents. Each lifecycle step
 * filters on the current status, so racing requests resolve in the database
 * rather than in read-then-write code, and a closed transaction never changes.
 *
 * Cases created before transactions existed have none; every step treats that
 * as "nothing to record" instead of an error.
 */

export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;

/**
 * Opens the purchase record for a newly created case. Must run inside the
 * transaction that creates the case, so neither exists without the other.
 */
export const openTransaction = async ({ caseDoc, auth, timezone }, session) => {
  const [transaction] = await Transaction.create(
    [
      {
        account: auth.accountId,
        createdBy: auth.userId,
        username: auth.username,
        case: caseDoc._id,
        timezone: normalizeTimeZone(timezone),
      },
    ],
    { session }
  );

  return transaction;
};

/**
 * Start Session: moves the transaction from active to in_progress and records
 * who started it. Only the first call writes; later calls change nothing and
 * report the current status. The caller must be able to see the case.
 */
export const markSessionStarted = async (caseId, auth) => {
  assertValidObjectId(caseId, 'case id');

  const visible = await Case.exists({ _id: caseId, ...caseScopeFilter(auth) });
  if (!visible) {
    throw createAppError('Case not found', 404);
  }

  const started = await Transaction.findOneAndUpdate(
    { case: caseId, status: 'active' },
    {
      $set: {
        status: 'in_progress',
        'coreFeature.username': auth.username,
        'coreFeature.userId': auth.userId,
        'coreFeature.startedAt': new Date(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  );

  const current = started ?? (await Transaction.findOne({ case: caseId }).select('status'));

  return { caseId: String(caseId), transactionStatus: current?.status ?? null };
};

// 'manual' is a user pressing Archive; 'purchase' is the automatic close a
// week after purchase, which has no actor.
const conclusionFor = (reason, auth) =>
  reason === 'manual'
    ? { manuallyClosed: true, actor: auth.username, actorId: auth.userId }
    : { manuallyClosed: false, actor: null, actorId: null };

/**
 * Closes the transaction of a case being archived. Must run inside the archive
 * transaction; `finishedAt` is the archive's own timestamp so the two records
 * agree exactly.
 */
export const closeTransaction = async ({ caseId, archived, auth, reason }, session) =>
  Transaction.updateOne(
    { case: caseId, status: { $ne: 'closed' } },
    {
      $set: {
        status: 'closed',
        archivedCase: archived._id,
        'termination.archived': true,
        'termination.finishedAt': archived.archivedAt,
        'termination.conclusion': conclusionFor(reason, auth),
      },
    },
    { session, runValidators: true }
  );

const parseLimit = (limit) => {
  if (limit === undefined) {
    return LIST_LIMIT_DEFAULT;
  }

  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIST_LIMIT_MAX) {
    throw createAppError(`limit must be an integer between 1 and ${LIST_LIMIT_MAX}`, 400);
  }
  return parsed;
};

/** The account's transactions, newest first. Account admins only. */
export const listTransactions = async (auth, { status, limit } = {}) => {
  assertAccountAdmin(auth);

  if (status !== undefined && !TRANSACTION_STATUSES.includes(status)) {
    throw createAppError(`status must be one of: ${TRANSACTION_STATUSES.join(', ')}`, 400);
  }

  return Transaction.find({
    ...transactionScopeFilter(auth),
    ...(status !== undefined && { status }),
  })
    .sort({ createdAt: -1 })
    .limit(parseLimit(limit));
};
