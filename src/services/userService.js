import User from "../models/User.js";
import Account from "../models/Account.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createAppError, isDuplicateKeyError } from "../utils/error.js";
import { withTransaction } from "../utils/transaction.js";
import { isAccountAdmin } from "../policies/accountScope.js";
import {
  assertCurrentVersion,
  getCurrentAgreement,
  isAccountCurrent,
  recordAcceptance,
} from "./agreementService.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_ACCOUNT_NAME_LENGTH = 80;
const INVALID_CREDENTIALS = "Invalid email or password";

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : email;

export const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw createAppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
};

export const hashPassword = (password) => bcrypt.hash(password, 10);


/**
 * What the client keeps as its session. isAdmin (platform) and role (account)
 * are returned so the client can show or hide UI; neither authorizes anything --
 * the server re-reads both from the database on every request.
 *
 * `currentAgreement` decides mustAcceptTerms; without it the flag is false.
 */
export const buildSessionPayload = (user, account, currentAgreement = null) => {
  const token = jwt.sign(
    { id: user._id, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION }
  );

  return {
    token,
    userId: user._id,
    username: user.username,
    isAdmin: user.isAdmin,
    accountId: account._id,
    accountName: account.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    mustAcceptTerms: !isAccountCurrent(account, currentAgreement),
  };
};

/**
 * Creates an account and its first user, who is the account's admin. Takes a
 * named object so privileged fields (isAdmin, role, account) in the request body
 * cannot reach the documents. Platform admin is still granted only by
 * `scripts/grantAdmin.js`.
 *
 * The registrant must have accepted the current Terms of Service
 * (`termsVersion`); the acceptance is recorded with the account.
 *
 * Runs in a transaction so a failed insert (e.g. duplicate email) leaves no
 * orphan account or acceptance behind.
 */
export const register = async ({ accountName, username, email, password, termsVersion } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedAccountName = typeof accountName === "string" ? accountName.trim() : "";
  const normalizedUsername = typeof username === "string" ? username.trim() : "";

  if (!normalizedAccountName || !normalizedUsername || !normalizedEmail || !password) {
    throw createAppError("Account name, username, email, and password are required", 400);
  }

  if (normalizedAccountName.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw createAppError(`Account name must be at most ${MAX_ACCOUNT_NAME_LENGTH} characters`, 400);
  }

  validatePassword(password);

  const currentAgreement = await assertCurrentVersion(termsVersion);

  const hashedPassword = await hashPassword(password);

  try {
    const { user, account } = await withTransaction(async (session) => {
      const [createdAccount] = await Account.create([{ name: normalizedAccountName }], { session });
      const [createdUser] = await User.create(
        [
          {
            username: normalizedUsername,
            email: normalizedEmail,
            password: hashedPassword,
            account: createdAccount._id,
            role: "admin",
          },
        ],
        { session }
      );

      createdAccount.createdBy = createdUser._id;
      await createdAccount.save({ session });

      await recordAcceptance(
        { userId: createdUser._id, accountId: createdAccount._id, agreement: currentAgreement },
        session
      );
      createdAccount.acceptedTermsVersion = currentAgreement.termsVersion;

      return { user: createdUser, account: createdAccount };
    });

    return buildSessionPayload(user, account, currentAgreement);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw createAppError("Email or username already in use", 409);
    }
    throw error;
  }
};

export const login = async (email, password) => {
  const user = await User.findOne({ email: normalizeEmail(email) });

  if (!user || typeof password !== "string") {
    throw createAppError(INVALID_CREDENTIALS, 401);
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  // A disabled user gets the same answer as a wrong password, so the response
  // does not reveal which emails belong to a (disabled) user.
  if (!isPasswordValid || user.status !== "active") {
    throw createAppError(INVALID_CREDENTIALS, 401);
  }

  const account = await Account.findById(user.account);
  if (!account) {
    throw createAppError(INVALID_CREDENTIALS, 401);
  }

  return buildSessionPayload(user, account, await getCurrentAgreement());
};

/**
 * The one action allowed while `mustChangePassword` is set. Returns a fresh
 * session so the client does not have to log in again.
 */
export const changePassword = async (auth, { currentPassword, newPassword } = {}) => {
  const user = await User.findById(auth.userId);
  if (!user) {
    throw createAppError("User not found", 401);
  }

  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
    throw createAppError("Current password is incorrect", 401);
  }

  validatePassword(newPassword);

  if (await bcrypt.compare(newPassword, user.password)) {
    throw createAppError("New password must be different from the current password", 400);
  }

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  const account = await Account.findById(user.account);
  return buildSessionPayload(user, account, await getCurrentAgreement());
};

/**
 * The one action allowed while the account has not accepted the current
 * terms. Only an account admin can accept, on behalf of the whole account.
 * Returns a fresh session with mustAcceptTerms cleared.
 */
export const acceptCurrentTerms = async (auth, { termsVersion } = {}) => {
  if (!isAccountAdmin(auth)) {
    throw createAppError("Only an account administrator can accept the terms", 403);
  }

  const currentAgreement = await assertCurrentVersion(termsVersion);

  try {
    await withTransaction((session) =>
      recordAcceptance(
        { userId: auth.userId, accountId: auth.accountId, agreement: currentAgreement },
        session
      )
    );
  } catch (error) {
    // The same user accepting twice at once: the other request recorded it.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const [user, account] = await Promise.all([
    User.findById(auth.userId),
    Account.findById(auth.accountId),
  ]);
  return buildSessionPayload(user, account, currentAgreement);
};
