import mongoose from 'mongoose';
import { QUESTION_TYPES } from '../types.js';
import { CASE_CATEGORY_IDS } from '../caseCategories.js';

const { Schema } = mongoose;

const OptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: Number, required: true, trim: true },
  },
  { _id: false }
);

const QuestionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    caseId: { type: String, default: null },
    options: { type: [OptionSchema], default: [] },
    answers: { type: Map, of: String, default: {} },
    firstPoll: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudentSchema = new Schema(
  {
    number: { type: Number, required: true, min: 1 },
    questionsAnswered: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

/**
 * Field definitions shared by Case and ArchivedCase, so an archive is always a
 * faithful snapshot and a new case field cannot be forgotten on the archive.
 */
const caseFields = {
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    immutable: true,
    index: true,
  },
  // The account admin who created the case. Only admins create cases.
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  // Users (besides account admins) who can see and run the case. Bounded by the
  // size of the account, so it is safe to keep inline.
  owners: {
    type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    default: [],
  },
  clientName: { type: String, required: true, trim: true },
  attorney: { type: String, required: true, trim: true },

  // Replaces the caseType/charge pair. One id encodes both, so an invalid
  // combination cannot be stored and no cross-field validation is needed.
  category: {
    type: String,
    enum: CASE_CATEGORY_IDS,
    required: true,
    trim: true,
  },

  studentNumber: { type: Number, required: true, min: 1 },
  createdOn: { type: Date, default: Date.now, immutable: true },

  students: { type: [StudentSchema], default: [] },
  questions: { type: [QuestionSchema], default: [] },
  chartData: { type: Schema.Types.Mixed, default: {} },
  // { [questionId]: { [studentId]: answer } } -- what completeness is judged on.
  answers: { type: Schema.Types.Mixed, default: {} },
  seated: { type: Boolean, default: false },
};

const CaseSchema = new Schema(caseFields, {
  collection: 'cases',
  versionKey: false,
});

// An admin's case list, and a member's "cases I own" list.
CaseSchema.index({ account: 1, createdOn: -1 });
CaseSchema.index({ account: 1, owners: 1 });

const CaseModel = mongoose.models.Case || mongoose.model('Case', CaseSchema);

export { CaseSchema, QuestionSchema, StudentSchema, caseFields };
export default CaseModel;