import ArchivedCase from '../models/ArchivedCase.js';
import Case from '../models/Case.js';
import {
  archivedCaseScopeFilter,
  assertValidObjectId,
  caseScopeFilter,
} from '../policies/accountScope.js';
import { isCaseComplete } from '../policies/caseCompletion.js';
import { createAppError, isDuplicateKeyError } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import { closeTransaction } from './transactionService.js';

// List view only needs the headings, not students/questions/answers.
const SUMMARY_FIELDS =
  '_id originalCaseId clientName attorney category studentNumber owners createdOn archivedAt archivedBy archiveReason';

/**
 * The snapshot insert, the close of the case's Transaction and the live delete.
 * Must run inside a transaction so the three commit together or not at all.
 */
const archiveLiveCase = async (liveCase, { archivedBy, reason, auth }, session) => {
  // Student details expire with the case (spec 005); never archive them. The
  // revision only guards live edits.
  const { _id, studentDetails, revision, ...snapshot } = liveCase.toObject();

  const [archived] = await ArchivedCase.create(
    [
      {
        ...snapshot,
        originalCaseId: _id,
        archivedBy,
        archiveReason: reason,
      },
    ],
    { session }
  );

  await closeTransaction({ caseId: _id, archived, auth, reason }, session);

  await Case.deleteOne({ _id }, { session });

  return archived;
};

/**
 * Moves a complete case into the archive. The caller must be able to see the
 * case (an account admin or one of its owners).
 *
 * `reason` is 'manual' through the API; the automatic archive uses
 * `autoArchiveCase` instead.
 */
export const archiveCase = async (caseId, auth, { reason = 'manual' } = {}) => {
  assertValidObjectId(caseId, 'case id');

  try {
    return await withTransaction(async (session) => {
      const liveCase = await Case.findOne({ _id: caseId, ...caseScopeFilter(auth) }).session(session);
      if (!liveCase) {
        throw createAppError('Case not found', 404);
      }

      if (!isCaseComplete(liveCase)) {
        throw createAppError('Case is not complete: every question must have answers', 409);
      }

      return archiveLiveCase(liveCase, { archivedBy: auth.userId, reason, auth }, session);
    });
  } catch (error) {
    // A concurrent archive of the same case won: from this caller's point of
    // view the live case is gone.
    if (isDuplicateKeyError(error)) {
      throw createAppError('Case not found', 404);
    }
    throw error;
  }
};

/**
 * The automatic archive a week after purchase, run by the auto-archive job. No
 * user is behind it, so there is no access scope, and the case is archived
 * whether or not it is complete.
 *
 * Returns null when the case is already gone (archived by someone else first).
 */
export const autoArchiveCase = async (caseId) => {
  try {
    return await withTransaction(async (session) => {
      const liveCase = await Case.findById(caseId).session(session);
      if (!liveCase) {
        return null;
      }

      return archiveLiveCase(liveCase, { archivedBy: null, reason: 'purchase', auth: null }, session);
    });
  } catch (error) {
    // A concurrent manual archive of the same case won.
    if (isDuplicateKeyError(error)) {
      return null;
    }
    throw error;
  }
};

export const listArchivedCases = async (auth) =>
  ArchivedCase.find(archivedCaseScopeFilter(auth)).select(SUMMARY_FIELDS).sort({ archivedAt: -1 });

export const getArchivedCase = async (archivedCaseId, auth) => {
  assertValidObjectId(archivedCaseId, 'archived case id');

  const archived = await ArchivedCase.findOne({
    _id: archivedCaseId,
    ...archivedCaseScopeFilter(auth),
  });

  if (!archived) {
    throw createAppError('Archived case not found', 404);
  }

  return archived;
};
