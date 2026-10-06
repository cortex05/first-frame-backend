import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Proof that an account admin accepted one version of the terms, on behalf of
 * their account. Insert-only: nothing updates or deletes these.
 */
const AgreementRecordSchema = new Schema(
  {
    termsVersion: { type: String, required: true, immutable: true },
    // The exact text that was accepted.
    agreement: { type: Schema.Types.ObjectId, ref: 'Agreement', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    acceptedAt: { type: Date, default: Date.now, required: true, immutable: true },
  },
  {
    collection: 'agreementRecords',
    versionKey: false,
  }
);

// A double submit or retry cannot record the same acceptance twice.
AgreementRecordSchema.index({ userId: 1, termsVersion: 1 }, { unique: true });
// "Who in this account accepted version X".
AgreementRecordSchema.index({ accountId: 1, termsVersion: 1 });

const AgreementRecord =
  mongoose.models.AgreementRecord || mongoose.model('AgreementRecord', AgreementRecordSchema);

export default AgreementRecord;
