import mongoose from "mongoose";

export const ACCOUNT_ROLES = ['admin', 'member'];
export const USER_STATUSES = ['active', 'disabled'];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    immutable: true,
    index: true,
  },
  // Role inside the account. Account admins manage the account's users and
  // cases; this is unrelated to isAdmin below.
  role: {
    type: String,
    enum: ACCOUNT_ROLES,
    default: 'member',
  },
  // Users are disabled rather than deleted so the references held by cases,
  // archives and playlists stay valid.
  status: {
    type: String,
    enum: USER_STATUSES,
    default: 'active',
  },
  // Set on users an account admin creates with a temporary password. While
  // true, the only thing the user can do is change their password.
  mustChangePassword: {
    type: Boolean,
    default: false,
  },
  // PLATFORM admin: curates the global Recommended sets. Granted only by
  // scripts/grantAdmin.js, and independent of the account role.
  isAdmin: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true});

// Serves the "is there another active admin?" count behind the last-admin guard.
userSchema.index({ account: 1, role: 1, status: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
