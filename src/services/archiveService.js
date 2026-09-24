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

// List view only needs the headings, not students/questions/answers.
const SUMMARY_FIELDS =
  '_id originalCaseId clientName attorney category studentNumber owners createdOn archivedAt archivedBy archiveReason';

/**
 * Moves a complete case into the archive: the snapshot insert and the live
 * delete commit together or not at all. The caller must be able to see the
 * case (an account admin or one of its owners).
 *
 * `reason` is 'manual' for now; the automatic archive after a purchase will
 * pass 'purchase'.
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

      const { _id, ...snapshot } = liveCase.toObject();

      const [archived] = await ArchivedCase.create(
        [
          {
            ...snapshot,
            originalCaseId: _id,
            archivedBy: auth.userId,
            archiveReason: reason,
          },
        ],
        { session }
      );

      await Case.deleteOne({ _id }, { session });

      return archived;
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
