import mongoose from 'mongoose';

const { Schema } = mongoose;

// active -> in_progress (first Start Session) -> closed (archive). Every write
// filters on the current status, so a closed transaction never changes again.
export const TRANSACTION_STATUSES = ['active', 'in_progress', 'closed'];

/**
 * The purchase record for one case. Written when the case is created, started
 * and archived. It outlives the case: archiving deletes the live case, and
 * `archivedCase` then points at its snapshot.
 *
 * Usernames are snapshots taken at the time of each event; the matching ids are
 * the durable references.
 */
const TransactionSchema = new Schema(
  {
    account: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      immutable: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    username: { type: String, required: true, trim: true, immutable: true },

    // One transaction per case, even under racing requests.
    case: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      immutable: true,
      unique: true,
    },
    archivedCase: { type: Schema.Types.ObjectId, ref: 'ArchivedCase', default: null },

    status: { type: String, enum: TRANSACTION_STATUSES, default: 'active' },
    createdAt: { type: Date, default: Date.now, immutable: true },
    // IANA zone reported by the browser; 'UTC' when missing or invalid.
    timezone: { type: String, required: true, default: 'UTC', trim: true },

    // Filled in once Stripe is wired up.
    stripe: {
      paymentIntentId: { type: String, default: null },
      checkoutSessionId: { type: String, default: null },
    },

    // Set by the first Start Session only.
    coreFeature: {
      username: { type: String, default: null },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      startedAt: { type: Date, default: null },
    },

    termination: {
      archived: { type: Boolean, default: false },
      finishedAt: { type: Date, default: null },
      conclusion: {
        manuallyClosed: { type: Boolean, default: false },
        // Username of whoever archived the case; null for an automatic close.
        actor: { type: String, default: null },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      },
    },
  },
  {
    collection: 'transactions',
    versionKey: false,
  }
);

// The admin list, unfiltered and filtered by status.
TransactionSchema.index({ account: 1, createdAt: -1 });
TransactionSchema.index({ account: 1, status: 1, createdAt: -1 });
// The future sweep that closes transactions a week after purchase.
TransactionSchema.index({ status: 1, createdAt: 1 });

const Transaction =
  mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

export default Transaction;
