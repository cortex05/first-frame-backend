import mongoose from 'mongoose';
import {
  QUESTION_TYPES,
  STUDENT_AGE_MAX,
  STUDENT_AGE_MIN,
  STUDENT_GENDERS,
  STUDENT_OCCUPATION_MAX,
  STUDENT_RACE_MAX,
} from '../types.js';
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

// Optional, viewer-only notes about one student. Never part of scoring.
const StudentDetailsSchema = new Schema(
  {
    age: {
      type: Number,
      min: STUDENT_AGE_MIN,
      max: STUDENT_AGE_MAX,
      validate: { validator: Number.isInteger, message: 'age must be a whole number' },
    },
    occupation: { type: String, trim: true, maxlength: STUDENT_OCCUPATION_MAX },
    gender: { type: String, enum: STUDENT_GENDERS },
    race: { type: String, trim: true, maxlength: STUDENT_RACE_MAX },
  },
  { _id: false }
);

/**
 * Field definitions shared by Case and ArchivedCase, so an archive is always a
 * faithful snapshot and a new case field cannot be forgotten on the archive.
 * The one deliberate exception is `studentDetails`, defined on CaseSchema
 * only: details expire with the live case and must never be archived (spec 005).
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

const CaseSchema = new Schema(
  {
    ...caseFields,
    // Keyed by String(student number), like answers[questionId]. Written only
    // through studentDetailsService; kept out of caseFields so it is not archived.
    studentDetails: { type: Map, of: StudentDetailsSchema, default: {} },
  },
  {
    collection: 'cases',
    versionKey: false,
  }
);

// An admin's case list, and a member's "cases I own" list.
CaseSchema.index({ account: 1, createdOn: -1 });
CaseSchema.index({ account: 1, owners: 1 });

const CaseModel = mongoose.models.Case || mongoose.model('Case', CaseSchema);

export { CaseSchema, QuestionSchema, StudentDetailsSchema, StudentSchema, caseFields };
export default CaseModel;