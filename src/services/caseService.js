import Case from '../models/Case.js';
import { isCaseCategoryId } from '../caseCategories.js';
import {
  assertAccountAdmin,
  assertValidObjectId,
  caseScopeFilter,
} from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import { assertActiveAccountUsers } from './accountUsers.js';
import {
  assertChartData,
  normalizeCaseAnswers,
  normalizeSeatedStudents,
} from './caseContentValidation.js';
import { buildStudentPrune } from './studentDetailsService.js';
import { openTransaction } from './transactionService.js';

// Every write to a field the whole-case PUT also writes bumps the revision.
export const BUMP_REVISION = { $inc: { revision: 1 } };

export const caseConflictError = () =>
  createAppError(
    'Someone else changed this case, so your change was not saved. Review the latest version and try again.',
    409,
    'CASE_CONFLICT'
  );

/** 404 unless the caller can see the case. */
export const assertCaseVisible = async (caseId, auth) => {
  if (!(await Case.exists({ _id: caseId, ...caseScopeFilter(auth) }))) {
    throw createAppError('Case not found', 404);
  }
};

// The revision the client last read. Optional: a client that sends none
// (older frontends) is not checked.
const parseRevision = (revision) => {
  if (revision === undefined || revision === null) {
    return undefined;
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw createAppError('revision must be a non-negative integer', 400);
  }
  return revision;
};

// Cases created before revisions existed have no field, which reads as 0.
const revisionMatch = (revision) => (revision === 0 ? { $in: [0, null] } : revision);

export const listCases = async (auth) => {
  const cases = await Case.find(caseScopeFilter(auth)).sort({ createdOn: -1 });
  return cases;
};

/**
 * Only account admins create cases. `account` and `createdBy` come from the
 * caller; `owners` are the users the admin hands the case to.
 *
 * Creating a case is a purchase: the case and its Transaction are written in
 * one transaction. Everything is validated first, so a rejected request
 * writes nothing.
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
    timezone,
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

  return withTransaction(async (session) => {
    const [createdCase] = await Case.create(
      [
        {
          account: auth.accountId,
          createdBy: auth.userId,
          owners: validatedOwners,
          clientName: String(clientName).trim(),
          attorney: String(attorney).trim(),
          category: normalizedCategory,
          studentNumber: parsedStudentNumber,
          questions,
        },
      ],
      { session }
    );

    await openTransaction({ caseDoc: createdCase, auth, timezone }, session);

    return createdCase;
  });
};

/**
 * The whole-case save. Each field sent replaces the stored one, so when the
 * payload carries `revision` the write only happens if nobody has changed the
 * case since the client read it (409 CASE_CONFLICT otherwise). Answers and
 * seating have their own targeted endpoints (caseSessionService) that merge
 * instead of replacing.
 */
export const updateCase = async (caseId, casePayload, auth) => {
  assertValidObjectId(caseId, 'case id');

  // This whitelist is what keeps account, createdBy and owners out of reach of
  // a regular update. Owners change only through setCaseOwners (admin only).
  // studentDetails is left out on purpose: it is written only through
  // PUT /cases/:id/students/:number/details, so a stale whole-case save
  // can't overwrite it. individualRound is left out for the same reason: it is
  // written only through PUT /cases/:id/individual-round.
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

  const expectedRevision = parseRevision(casePayload?.revision);

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

  // The Mixed fields have no schema; their shape and size are checked here.
  // `questions` is bounded by QuestionSchema's own validators.
  if (update.students !== undefined) {
    update.students = normalizeSeatedStudents(update.students).students;
  }

  if (update.questions !== undefined && !Array.isArray(update.questions)) {
    throw createAppError('questions must be an array', 400);
  }

  if (update.answers !== undefined) {
    update.answers = normalizeCaseAnswers(update.answers);
  }

  if (update.chartData !== undefined) {
    assertChartData(update.chartData);
  }

  const filter = {
    _id: caseId,
    ...caseScopeFilter(auth),
    ...(expectedRevision !== undefined && { revision: revisionMatch(expectedRevision) }),
  };
  const options = { returnDocument: 'after', runValidators: true };

  // Changing the class size drops the details and individual points of
  // students who no longer exist, read and written in one transaction so nothing slips in between.
  const updatedCase =
    update.studentNumber === undefined
      ? await Case.findOneAndUpdate(filter, { $set: update, ...BUMP_REVISION }, options)
      : await withTransaction(async (session) => {
          const prune = await buildStudentPrune(caseId, auth, update.studentNumber, session);
          const changes = Object.keys(prune).length
            ? { $set: update, $unset: prune, ...BUMP_REVISION }
            : { $set: update, ...BUMP_REVISION };
          return Case.findOneAndUpdate(filter, changes, { ...options, session });
        });

  if (!updatedCase) {
    if (expectedRevision !== undefined) {
      await assertCaseVisible(caseId, auth);
      throw caseConflictError();
    }
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
