import mongoose from 'mongoose';
import { CRIME_TYPES, QUESTION_TYPES } from '../types.js';

const { Schema } = mongoose;

const OptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
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
    name: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    crimeType: { type: String, enum: CRIME_TYPES, required: true },
    location: { type: String, required: true, trim: true },
    studentNumber: { type: Number, required: true, min: 1 },
    caseDate: { type: Date, required: true },
    dateCreated: { type: Date, default: Date.now },

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