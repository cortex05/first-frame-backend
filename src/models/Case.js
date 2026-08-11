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

const CaseSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
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
    answers: { type: Schema.Types.Mixed, default: {} },
    seated: { type: Boolean, default: false },
  },
  {
    collection: 'cases',
    versionKey: false,
  }
);

const CaseModel = mongoose.models.Case || mongoose.model('Case', CaseSchema);

export { CaseSchema, QuestionSchema };
export default CaseModel;