import mongoose from 'mongoose';
import {
  CASE_STUDENTS_MAX,
  ID_MAX,
  LABEL_MAX,
  QUESTION_OPTIONS_MAX,
  QUESTION_TEXT_MAX,
  QUESTION_TYPES,
  QUESTIONS_MAX,
  STUDENT_AGE_MAX,
  STUDENT_AGE_MIN,
  STUDENT_GENDERS,
  STUDENT_OCCUPATION_MAX,
  STUDENT_RACE_MAX,
} from '../types.js';
import { CASE_CATEGORY_IDS } from '../caseCategories.js';

const { Schema } = mongoose;

// An array-length validator. Mongoose runs it on save and on update $set.
export const maxItems = (max, label) => ({
  validator: (value) => (value?.length ?? value?.size ?? 0) <= max,
  message: `${label} cannot have more than ${max} entries`,
});

const OptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: LABEL_MAX },
    value: { type: Number, required: true, trim: true },
  },
  { _id: false }
);

const QuestionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: ID_MAX },
    text: { type: String, required: true, trim: true, maxlength: QUESTION_TEXT_MAX },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    caseId: { type: String, default: null, maxlength: ID_MAX },
    options: {
      type: [OptionSchema],
      default: [],
      validate: maxItems(QUESTION_OPTIONS_MAX, 'a question'),
    },
    // Answer labels by student number; one per student at most.
    answers: {
      type: Map,
      of: { type: String, maxlength: LABEL_MAX },
      default: {},
      validate: maxItems(CASE_STUDENTS_MAX, 'question answers'),
    },
    firstPoll: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudentSchema = new Schema(
  {
    number: { type: Number, required: true, min: 1 },
    // Never filled by the current frontend; bounded so it can't grow freely.
    questionsAnswered: {
      type: [Schema.Types.Mixed],
      default: [],
      validate: maxItems(QUESTIONS_MAX, 'questionsAnswered'),
    },
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

  studentNumber: { type: Number, required: true, min: 1, max: CASE_STUDENTS_MAX },
  createdOn: { type: Date, default: Date.now, immutable: true },

  students: {
    type: [StudentSchema],
    default: [],
    validate: maxItems(CASE_STUDENTS_MAX, 'students'),
  },
  questions: {
    type: [QuestionSchema],
    default: [],
    validate: maxItems(QUESTIONS_MAX, 'questions'),
  },
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
    // Bumped by every write to a field the whole-case PUT also writes (the
    // case itself, one question's answers, the seating). A whole-case save
    // that sends an older revision is refused with 409 CASE_CONFLICT instead
    // of overwriting someone else's work. Not archived.
    revision: { type: Number, default: 0, min: 0 },
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