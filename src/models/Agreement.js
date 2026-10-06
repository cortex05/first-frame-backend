import mongoose from 'mongoose';

// "MM-DD-YYYY". Never compared as a string: versions are ordered by
// dateImplemented.
export const TERMS_VERSION_PATTERN = /^\d{2}-\d{2}-\d{4}$/;

/**
 * One version of the Terms of Service. Inserted only by
 * `scripts/publishTerms.js` and never edited, so the exact text every
 * AgreementRecord points at is kept. The current version is the one with the
 * latest dateImplemented that has already passed (see agreementService).
 */
const AgreementSchema = new mongoose.Schema(
  {
    termsVersion: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      immutable: true,
      match: TERMS_VERSION_PATTERN,
    },
    agreementText: {
      type: String,
      required: true,
      immutable: true,
    },
    // 00:00 UTC of termsVersion. Unique so "current" is always one document.
    dateImplemented: {
      type: Date,
      required: true,
      unique: true,
      immutable: true,
    },
  },
  {
    collection: 'agreements',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

const Agreement = mongoose.models.Agreement || mongoose.model('Agreement', AgreementSchema);

export default Agreement;
