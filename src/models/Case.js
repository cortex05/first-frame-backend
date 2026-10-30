import mongoose from 'mongoose';
import {
  CASE_STUDENTS_MAX,
  ID_MAX,
  INDIVIDUAL_ROUND_MAX,
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

/**
 * One question, the same shape on a case, a playlist and a recommended set.
 * Answers are not stored here: a case keeps them only in `case.answers`
 * (spec 010). Documents written before that may still carry `answers`,
 * `firstPoll` and `caseId` on their questions until
 * `npm run migrate:question-fields` runs (archives keep them for good);
 * nothing reads them.
 */
const QuestionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: ID_MAX },
    text: { type: String, required: true, trim: true, maxlength: QUESTION_TEXT_MAX },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: {
      type: [OptionSchema],
      default: [],
      validate: maxItems(QUESTION_OPTIONS_MAX, 'a question'),
    },
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
    // No single-field index: every query also filters or sorts on a second
    // field, and the compound indexes below (and on ArchivedCase) lead with
    // `account`, so they serve account-only lookups too.
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
  // The account user chosen as attorney (spec 021). Also always in `owners`.
  // Missing on cases created before 021, whose `attorney` is free text.
  attorneyId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: undefined,
    immutable: true,
  },
  // Since spec 021 the server sets this to the attorney's username at
  // creation. It is a display snapshot and isn't updated if the user is renamed.
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
  // The case's only answer store: { [questionId]: { [studentNumber]: { label,
  // value } } }. Completeness, scores and the archive report read it, and a
  // question counts as polled when it has a key here (spec 010).
  answers: { type: Schema.Types.Mixed, default: {} },
  // Points given to or taken from a student outside any question, keyed by
  // String(student number); 0 is not stored. Added to the question total
  // before risk is banded, so it is archived along with the answers. Written
  // only through PUT /cases/:id/individual-round, one student at a time.
  individualRound: {
    type: Map,
    of: {
      type: Number,
      min: -INDIVIDUAL_ROUND_MAX,
      max: INDIVIDUAL_ROUND_MAX,
      validate: { validator: Number.isInteger, message: 'individual points must be a whole number' },
    },
    default: {},
  },
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