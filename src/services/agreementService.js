import Account from "../models/Account.js";
import Agreement, { TERMS_VERSION_PATTERN } from "../models/Agreement.js";
import AgreementRecord from "../models/AgreementRecord.js";
import { createAppError } from "../utils/error.js";

// The auth gate reads the current agreement on every request, so it is cached.
// A newly live version is enforced within this window, without a restart.
const CACHE_TTL_MS = 60 * 1000;

let cache = null;

export const clearAgreementCache = () => {
  cache = null;
};

/**
 * The agreement with the latest dateImplemented that has already passed, or
 * null when none has. A version published ahead of time is ignored until its
 * date. `fresh` skips the cache for the writes that must check the version
 * the user actually saw.
 */
export const getCurrentAgreement = async ({ fresh = false } = {}) => {
  if (!fresh && cache && cache.expiresAt > Date.now()) {
    return cache.agreement;
  }

  const agreement = await Agreement.findOne({ dateImplemented: { $lte: new Date() } })
    .sort({ dateImplemented: -1 })
    .lean();

  cache = { agreement, expiresAt: Date.now() + CACHE_TTL_MS };
  return agreement;
};

/**
 * With no agreement published nobody is blocked, so deploying before the first
 * terms are published does not lock every account out. Registration fails
 * closed instead (assertCurrentVersion).
 */
export const isAccountCurrent = (account, currentAgreement) =>
  !currentAgreement || account?.acceptedTermsVersion === currentAgreement.termsVersion;

/**
 * Returns the current agreement if `termsVersion` is it. A stale version means
 * the terms changed after the client fetched them, and nothing may be recorded
 * against text the user did not see.
 */
export const assertCurrentVersion = async (termsVersion) => {
  const current = await getCurrentAgreement({ fresh: true });

  if (!current) {
    throw createAppError("No Terms of Service are available", 503, "TERMS_UNAVAILABLE");
  }
  if (typeof termsVersion !== "string" || termsVersion !== current.termsVersion) {
    throw createAppError("These terms are no longer current", 409, "TERMS_OUTDATED");
  }

  return current;
};

/**
 * Records an acceptance and marks the account current. Must run inside a
 * transaction (`session`). A user who already accepted this version keeps their
 * original record.
 *
 * Checks first rather than catching the duplicate key: a write error aborts the
 * surrounding MongoDB transaction.
 */
export const recordAcceptance = async ({ userId, accountId, agreement }, session) => {
  const alreadyAccepted = await AgreementRecord.exists({
    userId,
    termsVersion: agreement.termsVersion,
  }).session(session);

  if (!alreadyAccepted) {
    await AgreementRecord.create(
      [{ termsVersion: agreement.termsVersion, agreement: agreement._id, userId, accountId }],
      { session }
    );
  }

  await Account.updateOne(
    { _id: accountId },
    { $set: { acceptedTermsVersion: agreement.termsVersion } },
    { session }
  );
};

/**
 * Parses an "MM-DD-YYYY" version into 00:00 UTC of that day. Null when it is
 * not a real calendar date (e.g. 02-30-2026).
 */
export const parseTermsVersion = (termsVersion) => {
  if (typeof termsVersion !== "string" || !TERMS_VERSION_PATTERN.test(termsVersion)) {
    return null;
  }

  const [month, day, year] = termsVersion.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return date;
};
