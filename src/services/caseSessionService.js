import Case from '../models/Case.js';
import { assertValidObjectId, caseScopeFilter } from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
import {
  assertChartData,
  assertQuestionId,
  normalizeIndividualRound,
  normalizeQuestionAnswers,
  normalizeSeatedStudents,
} from './caseContentValidation.js';
import { BUMP_REVISION, assertCaseVisible, caseConflictError } from './caseService.js';

/**
 * The writes made while a case is being run: one question's answers, the
 * seating chart, and the individual round. Each touches only its own fields, so two people working on
 * the same case at once (an account admin and an owner, say) never erase each
 * other's work the way two whole-case saves would.
 *
 * Both bump `revision`, because the whole-case PUT also writes these fields
 * and must notice it is stale.
 */

/**
 * Replaces the answers to one question, and only that question, in
 * `case.answers` (the only answer store, spec 010; having a key there is what
 * makes the question "polled"). Returns the whole updated case, so the client
 * picks up anything others have saved meanwhile.
 *
 * Refused with 409 CASE_CONFLICT when the question no longer exists (someone
 * removed it), and 400 when a student number is beyond the class size.
 */
export const saveQuestionAnswers = async (caseId, questionId, body, auth) => {
  assertValidObjectId(caseId, 'case id');
  assertQuestionId(questionId);
  const { answers, maxStudent } = normalizeQuestionAnswers(body?.answers);

  const updatedCase = await Case.findOneAndUpdate(
    {
      _id: caseId,
      ...caseScopeFilter(auth),
      'questions.id': questionId,
      ...(maxStudent > 0 && { studentNumber: { $gte: maxStudent } }),
    },
    { $set: { [`answers.${questionId}`]: answers }, ...BUMP_REVISION },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    await assertCaseVisible(caseId, auth);
    if (!(await Case.exists({ _id: caseId, 'questions.id': questionId }))) {
      throw caseConflictError();
    }
    throw createAppError('student number is out of range for this case', 400);
  }

  return updatedCase;
};

/**
 * Saves the seating chart and the seated students, and marks the case seated.
 * Seating has one author at a time, so the last save wins; what matters is
 * that it never touches answers or questions.
 */
export const saveSeating = async (caseId, body, auth) => {
  assertValidObjectId(caseId, 'case id');

  const { chartData } = body || {};
  assertChartData(chartData);
  const { students: seated, maxStudent } = normalizeSeatedStudents(body?.students);

  const updatedCase = await Case.findOneAndUpdate(
    {
      _id: caseId,
      ...caseScopeFilter(auth),
      ...(maxStudent > 0 && { studentNumber: { $gte: maxStudent } }),
    },
    { $set: { chartData, students: seated, seated: true }, ...BUMP_REVISION },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    await assertCaseVisible(caseId, auth);
    throw createAppError('student number is out of range for this case', 400);
  }

  return updatedCase;
};

/**
 * Updates the individual round for the students listed, `{ [studentNumber]:
 * points }`: the points each one gained or lost outside any question, with 0
 * removing the entry. Students left out keep what they have, so two people
 * running the same case only collide on a student they both changed (the last
 * save wins for that student). The whole-case PUT never writes this field, so
 * the revision is left alone. Returns the whole updated case.
 */
export const saveIndividualRound = async (caseId, body, auth) => {
  assertValidObjectId(caseId, 'case id');
  const { set, unset, maxStudent } = normalizeIndividualRound(body?.individualRound);

  const filter = {
    _id: caseId,
    ...caseScopeFilter(auth),
    ...(maxStudent > 0 && { studentNumber: { $gte: maxStudent } }),
  };
  const setPaths = Object.fromEntries(
    Object.entries(set).map(([key, points]) => [`individualRound.${key}`, points])
  );
  const unsetPaths = Object.fromEntries(unset.map((key) => [`individualRound.${key}`, '']));

  // Nothing to change: answer with the current case, like any other save.
  if (!unset.length && !Object.keys(set).length) {
    const current = await Case.findOne(filter);
    if (!current) {
      throw createAppError('Case not found', 404);
    }
    return current;
  }

  const updatedCase = await Case.findOneAndUpdate(
    filter,
    {
      ...(Object.keys(setPaths).length && { $set: setPaths }),
      ...(unset.length && { $unset: unsetPaths }),
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedCase) {
    await assertCaseVisible(caseId, auth);
    throw createAppError('student number is out of range for this case', 400);
  }

  return updatedCase;
};
