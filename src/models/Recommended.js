import mongoose from 'mongoose';
import { QuestionSchema } from './Case.js';
import { CASE_CHARGES } from '../charges.js';

/**
 * A curated question set for one charge, authored by an administrator and
 * readable by every user. Shape mirrors Playlist -- the differences are that the
 * owner field records who authored it rather than who it belongs to, and the
 * title is constrained to a catalog charge so a case can be matched to it.
 */
const RecommendedSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Globally unique: exactly one curated set per charge, so "the recommended
    // set for this case" is always a single, unambiguous document.
    charge: {
      type: String,
      enum: CASE_CHARGES,
      required: true,
      trim: true,
      unique: true,
    },
    questions: {
      type: [QuestionSchema],
      default: [],
    },
  },
  {
    collection: 'recommended',
    timestamps: true,
    versionKey: false,
  }
);

const Recommended = mongoose.models.Recommended || mongoose.model('Recommended', RecommendedSchema);

export default Recommended;
