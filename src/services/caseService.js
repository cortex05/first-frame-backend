import Case from '../models/Case.js';
import { isCaseCategoryId } from '../caseCategories.js';
import {
  assertAccountAdmin,
  assertValidObjectId,
  caseScopeFilter,
} from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
import { assertActiveAccountUsers } from './accountUsers.js';

export const listCases = async (auth) => {
  const cases = await Case.find(caseScopeFilter(auth)).sort({ createdOn: -1 });
  return cases;
};

/**
 * Only account admins create cases. `account` and `createdBy` come from the
 * caller; `owners` are the users the admin hands the case to.
 */
export const createCase = async (casePayload, auth) => {
  assertAccountAdmin(auth);

  const {
    clientName,
    attorney,
    category,
    studentNumber,
    questions = [],
    owners = [],
  } = casePayload || {};

  if (!clientName || !attorney || !category) {
    throw createAppError('clientName, attorney, and category are required', 400);
  }

  const normalizedCategory = String(category).trim();
  if (!isCaseCategoryId(normalizedCategory)) {
    throw createAppError('Invalid case category', 400);
  }

  const parsedStudentNumber = Number(studentNumber);
  if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
    throw createAppError('studentNumber must be an integer greater than 0', 400);
  }

  if (!Array.isArray(questions)) {
    throw createAppError('questions must be an array', 400);
  }

  const validatedOwners = await assertActiveAccountUsers(auth.accountId, owners);

  const createdCase = await Case.create({
    account: auth.accountId,
    createdBy: auth.userId,
    owners: validatedOwners,
    clientName: String(clientName).trim(),
    attorney: String(attorney).trim(),
    category: normalizedCategory,
    studentNumber: parsedStudentNumber,
    questions,
  });

  return createdCase;
};

export const updateCase = async (caseId, casePayload, auth) => {
  assertValidObjectId(caseId, 'case id');

  // This whitelist is what keeps account, createdBy and owners out of reach of
  // a regular update. Owners change only through setCaseOwners (admin only).
  const allowedFields = [
    'clientName',
    'attorney',
    'category',
    'studentNumber',
    'students',
    'questions',
    'chartData',
    'answers',
    'seated',
  ];

  const update = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(casePayload || {}, field)) {
      update[field] = casePayload[field];
    }
  }

  if (!Object.keys(update).length) {
    throw createAppError('No updatable fields provided', 400);
  }

  if (update.clientName !== undefined) {
    if (typeof update.clientName !== 'string' || !update.clientName.trim()) {
      throw createAppError('clientName must be a non-empty string', 400);
    }
    update.clientName = update.clientName.trim();
  }

  if (update.attorney !== undefined) {
    if (typeof update.attorney !== 'string' || !update.attorney.trim()) {
      throw createAppError('attorney must be a non-empty string', 400);
    }
    update.attorney = update.attorney.trim();
  }

  if (update.category !== undefined) {
    if (typeof update.category !== 'string' || !update.category.trim()) {
      throw createAppError('category must be a non-empty string', 400);
    }

    update.category = update.category.trim();
    if (!isCaseCategoryId(update.category)) {
      throw createAppError('Invalid case category', 400);
    }
  }

  if (update.studentNumber !== undefined) {
    const parsedStudentNumber = Number(update.studentNumber);
    if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
      throw createAppError('studentNumber must be an integer greater than 0', 400);
    }
    update.studentNumber = parsedStudentNumber;
  }

  if (update.students !== undefined && !Array.isArray(update.students)) {
    throw createAppError('students must be an array', 400);
  }

  if (update.questions !== undefined && !Array.isArray(update.questions)) {
    throw createAppError('questions must be an array', 400);
  }

  const updatedCase = await Case.findOneAndUpdate(
    { _id: caseId, ...caseScopeFilter(auth) },
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    throw createAppError('Case not found', 404);
  }

  return updatedCase;
};

/** Replaces the owner list. Account admins only. */
export const setCaseOwners = async (caseId, owners, auth) => {
  assertAccountAdmin(auth);
  assertValidObjectId(caseId, 'case id');

  const validatedOwners = await assertActiveAccountUsers(auth.accountId, owners);

  const updatedCase = await Case.findOneAndUpdate(
    { _id: caseId, account: auth.accountId },
    { $set: { owners: validatedOwners } },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    throw createAppError('Case not found', 404);
  }

  return updatedCase;
};
