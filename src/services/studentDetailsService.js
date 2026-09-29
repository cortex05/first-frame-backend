import Case from '../models/Case.js';
import { assertValidObjectId, caseScopeFilter } from '../policies/accountScope.js';
import {
  STUDENT_AGE_MAX,
  STUDENT_AGE_MIN,
  STUDENT_GENDERS,
  STUDENT_OCCUPATION_MAX,
  STUDENT_RACE_MAX,
} from '../types.js';
import { createAppError } from '../utils/error.js';

/**
 * Optional, viewer-only details about a student (spec 005). They never affect
 * scoring, and they are never archived: archiveService drops them and
 * ArchivedCase has no field for them.
 */

const isEmpty = (value) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim());

const normalizeText = (value, field, maxLength) => {
  if (typeof value !== 'string') {
    throw createAppError(`${field} must be a string`, 400);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw createAppError(`${field} must be at most ${maxLength} characters`, 400);
  }
  return trimmed;
};

/**
 * Validates a details body and returns only the fields that are set. Missing,
 * null and blank values mean "empty"; unknown keys are ignored.
 */
export const normalizeStudentDetails = (body) => {
  const { age, occupation, gender, race } = body || {};
  const details = {};

  if (!isEmpty(age)) {
    if (typeof age !== 'number' || !Number.isInteger(age) || age < STUDENT_AGE_MIN || age > STUDENT_AGE_MAX) {
      throw createAppError(
        `age must be a whole number from ${STUDENT_AGE_MIN} to ${STUDENT_AGE_MAX}`,
        400
      );
    }
    details.age = age;
  }

  if (!isEmpty(occupation)) {
    details.occupation = normalizeText(occupation, 'occupation', STUDENT_OCCUPATION_MAX);
  }

  if (!isEmpty(gender)) {
    if (!STUDENT_GENDERS.includes(gender)) {
      throw createAppError(`gender must be one of: ${STUDENT_GENDERS.join(', ')}`, 400);
    }
    details.gender = gender;
  }

  if (!isEmpty(race)) {
    details.race = normalizeText(race, 'race', STUDENT_RACE_MAX);
  }

  return details;
};

// Route params are strings; only plain digits count ('1.5', '1e1', ' ' do not).
const parseStudentNumber = (value) => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1) {
    throw createAppError('student number must be an integer greater than 0', 400);
  }
  return number;
};

/**
 * Replaces one student's details. The range check lives in the update filter
 * (`studentNumber >= n`), so a concurrent lowering of studentNumber can't leave
 * an entry for a student who no longer exists.
 *
 * Returns { caseId, studentNumber, studentDetails } with the case's whole map.
 */
export const setStudentDetails = async (caseId, studentNumberParam, body, auth) => {
  assertValidObjectId(caseId, 'case id');
  const studentNumber = parseStudentNumber(studentNumberParam);
  const details = normalizeStudentDetails(body);

  const path = `studentDetails.${studentNumber}`;
  const update = Object.keys(details).length
    ? { $set: { [path]: details } }
    : { $unset: { [path]: '' } };

  const updatedCase = await Case.findOneAndUpdate(
    { _id: caseId, ...caseScopeFilter(auth), studentNumber: { $gte: studentNumber } },
    update,
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    const visible = await Case.exists({ _id: caseId, ...caseScopeFilter(auth) });
    if (!visible) {
      throw createAppError('Case not found', 404);
    }
    throw createAppError('student number is out of range for this case', 400);
  }

  return {
    caseId: String(updatedCase._id),
    studentNumber,
    studentDetails: updatedCase.toJSON().studentDetails ?? {},
  };
};

/**
 * `$unset` paths for the details of students above `studentNumber`, read from
 * the current case. Used by updateCase when the class shrinks.
 */
export const buildDetailsPrune = async (caseId, auth, studentNumber, session) => {
  const current = await Case.findOne({ _id: caseId, ...caseScopeFilter(auth) })
    .select('studentDetails')
    .session(session);

  const prune = {};
  for (const key of current?.studentDetails?.keys() ?? []) {
    if (Number(key) > studentNumber) {
      prune[`studentDetails.${key}`] = '';
    }
  }
  return prune;
};
