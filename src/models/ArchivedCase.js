import mongoose from 'mongoose';
import { caseFields } from './Case.js';

const { Schema } = mongoose;

export const ARCHIVE_REASONS = ['manual', 'purchase'];

// Marks every field immutable. Done on the definitions because Mongoose does
// not enforce immutable() applied to a path after the schema is built.
const immutable = (fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([path, definition]) => [path, { ...definition, immutable: true }])
  );

/**
 * A read-only snapshot of a case, written in the same transaction that deletes
 * the live case. Kept in its own collection so anything that later expires live
 * cases can never touch the account's history. Nothing in it may change after
 * it is written.
 */
const ArchivedCaseSchema = new Schema(
  immutable({
    // caseFields deliberately excludes Case.studentDetails: student details
    // expire with the live case (spec 005).
    ...caseFields,
    // Unique so a case can be archived at most once, even by racing requests.
    originalCaseId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    archivedAt: { type: Date, default: Date.now },
    // Null only for an automatic archive, which has no user behind it.
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      required: function () {
        return this.archiveReason !== 'purchase';
      },
    },
    // 'purchase' is the automatic archive a week after a purchase
    // (src/jobs/autoArchiveExpiredCases.js).
    archiveReason: {
      type: String,
      enum: ARCHIVE_REASONS,
      default: 'manual',
    },
  }),
  {
    collection: 'archivedcases',
    versionKey: false,
  }
);

ArchivedCaseSchema.index({ account: 1, archivedAt: -1 });
ArchivedCaseSchema.index({ account: 1, owners: 1 });

const ArchivedCase =
  mongoose.models.ArchivedCase || mongoose.model('ArchivedCase', ArchivedCaseSchema);

export default ArchivedCase;
