import mongoose from 'mongoose';

export const ACCOUNT_STATUSES = ['active', 'suspended'];

/**
 * The top-level tenant. Users, cases, archived cases and playlists all belong
 * to exactly one account, and every read is scoped to the caller's account.
 * There is no HTTP path to suspend an account; `status` is set by operations.
 */
const AccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: 'active',
    },
    // Null only for the moment between creating the account and its first user
    // inside the registration transaction.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    collection: 'accounts',
    timestamps: true,
    versionKey: false,
  }
);

const Account = mongoose.models.Account || mongoose.model('Account', AccountSchema);

export default Account;
