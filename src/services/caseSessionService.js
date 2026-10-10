import Case from '../models/Case.js';
import { assertValidObjectId, caseScopeFilter } from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
import {
  assertChartData,
  assertQuestionId,
  normalizeQuestionAnswers,
  normalizeSeatedStudents,
} from './caseContentValidation.js';
import { BUMP_REVISION, assertCaseVisible, caseConflictError } from './caseService.js';

/**
 * The writes made while a case is being run: one question's answers, and the
 * seating chart. Each touches only its own fields, so two people working on
 * the same case at once (an account admin and an owner, say) never erase each
 * other's work the way two whole-case saves would.
 *
 * Both bump `revision`, because the whole-case PUT also writes these fields
 * and must notice it is stale.
 */

/**
 * Replaces the answers to one question, and only that question. Also marks
 * the question as polled. Returns the whole updated case, so the client picks
 * up anything others have saved meanwhile.
 *
 * Refused with 409 CASE_CONFLICT when the question no longer exists (someone
 * removed it), and 400 when a student number is beyond the class size.
 */
export const saveQuestionAnswers = async (caseId, questionId, body, auth) => {
  assertValidObjectId(caseId, 'case id');
  assertQuestionId(questionId);
  const { answers, labels, maxStudent } = normalizeQuestionAnswers(body?.answers);

  const updatedCase = await Case.findOneAndUpdate(
    {
      _id: caseId,
      ...caseScopeFilter(auth),
      'questions.id': questionId,
      ...(maxStudent > 0 && { studentNumber: { $gte: maxStudent } }),
    },
    {
      $set: {
        [`answers.${questionId}`]: answers,
        'questions.$[question].answers': labels,
        'questions.$[question].firstPoll': true,
      },
      ...BUMP_REVISION,
    },
    {
      arrayFilters: [{ 'question.id': questionId }],
      returnDocument: 'after',
      runValidators: true,
    }
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
