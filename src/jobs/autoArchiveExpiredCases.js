import Transaction from '../models/Transaction.js';
import { autoArchiveCase } from '../services/archiveService.js';

export const MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Archives every case whose purchase is at least `maxAgeDays` old and whose
 * Transaction is still open. Run on a schedule by `scripts/autoArchive.js`.
 *
 * Cases are archived one at a time, each in its own MongoDB transaction, so a
 * failure only affects that case and the rest of the run carries on. Overlapping
 * runs are safe: the status filter, the archive transaction and the unique
 * `ArchivedCase.originalCaseId` keep a case from being archived twice.
 *
 * Cases created before transactions existed have none and are never swept.
 */
export const runAutoArchive = async ({
  now = new Date(),
  maxAgeDays = MAX_AGE_DAYS,
  logger = console,
} = {}) => {
  const cutoff = new Date(now.getTime() - maxAgeDays * DAY_MS);

  // $in rather than $ne so the { status, createdAt } index is used.
  const expired = await Transaction.find({
    status: { $in: ['active', 'in_progress'] },
    createdAt: { $lte: cutoff },
  })
    .select('case')
    .sort({ createdAt: 1 })
    .lean();

  const summary = { archived: 0, skipped: 0, failed: 0 };

  for (const { _id, case: caseId } of expired) {
    try {
      const archived = await autoArchiveCase(caseId);
      if (archived) {
        summary.archived += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      logger.error(`Auto-archive failed for case ${caseId} (transaction ${_id}):`, error);
    }
  }

  return summary;
};
