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
    ...caseFields,
    // Unique so a case can be archived at most once, even by racing requests.
    originalCaseId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    archivedAt: { type: Date, default: Date.now },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // 'purchase' is reserved for the automatic archive a week after a purchase.
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
