import User from "../models/User.js";
import Account from "../models/Account.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createAppError, isDuplicateKeyError } from "../utils/error.js";
import { withTransaction } from "../utils/transaction.js";

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
 */
export const buildSessionPayload = (user, account) => {
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
  };
};

/**
 * Creates an account and its first user, who is the account's admin. Takes a
 * named object so privileged fields (isAdmin, role, account) in the request body
 * cannot reach the documents. Platform admin is still granted only by
 * `scripts/grantAdmin.js`.
 *
 * Runs in a transaction so a failed user insert (e.g. duplicate email) leaves
 * no orphan account behind.
 */
export const register = async ({ accountName, username, email, password } = {}) => {
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

      return { user: createdUser, account: createdAccount };
    });

    return buildSessionPayload(user, account);
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

  return buildSessionPayload(user, account);
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
  return buildSessionPayload(user, account);
};
