import Case from '../models/Case.js';
import { assertValidObjectId, caseScopeFilter } from '../policies/accountScope.js';
import { createAppError } from '../utils/error.js';
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

const MAX_QUESTION_ID_LENGTH = 100;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Student numbers arrive as object keys: plain digits only ('1.5', '1e1',
// '$x' do not count), which also keeps them safe inside an update path.
const parseStudentKey = (key) => {
  const number = /^\d+$/.test(key) ? Number(key) : NaN;
  if (!Number.isInteger(number) || number < 1) {
    throw createAppError('answers must be keyed by student number', 400);
  }
  return number;
};

// The id becomes part of the path `answers.<questionId>`, so it cannot hold a
// '.' or start with '$'. Question ids are UUIDs in practice.
const assertQuestionId = (questionId) => {
  if (
    typeof questionId !== 'string' ||
    !questionId ||
    questionId.length > MAX_QUESTION_ID_LENGTH ||
    questionId.includes('.') ||
    questionId.startsWith('$')
  ) {
    throw createAppError('Valid question id is required', 400);
  }
};

// One answer is the option the student picked: { label, value }. Anything
// else on the object is dropped.
const normalizeAnswer = (answer) => {
  const labelType = typeof answer?.label;
  if (
    !isPlainObject(answer) ||
    !['string', 'boolean', 'number'].includes(labelType) ||
    typeof answer.value !== 'number' ||
    !Number.isFinite(answer.value)
  ) {
    throw createAppError('each answer must be an option: { label, value }', 400);
  }
  return { label: answer.label, value: answer.value };
};

/**
 * Validates `{ [studentNumber]: { label, value } }`. Returns the answers, the
 * same answers as the string labels kept on the question, and the highest
 * student number (0 when empty).
 */
export const normalizeQuestionAnswers = (answers) => {
  if (!isPlainObject(answers)) {
    throw createAppError('answers must be an object keyed by student number', 400);
  }

  const normalized = {};
  const labels = {};
  let maxStudent = 0;

  for (const [key, answer] of Object.entries(answers)) {
    maxStudent = Math.max(maxStudent, parseStudentKey(key));
    normalized[key] = normalizeAnswer(answer);
    labels[key] = String(normalized[key].label);
  }

  return { answers: normalized, labels, maxStudent };
};

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

// A seated student: { number, questionsAnswered? }.
const normalizeSeatedStudent = (student) => {
  if (!isPlainObject(student) || !Number.isInteger(student.number) || student.number < 1) {
    throw createAppError('each student must have a whole-number number of at least 1', 400);
  }
  if (student.questionsAnswered !== undefined && !Array.isArray(student.questionsAnswered)) {
    throw createAppError('questionsAnswered must be an array', 400);
  }
  return { number: student.number, questionsAnswered: student.questionsAnswered ?? [] };
};

/**
 * Saves the seating chart and the seated students, and marks the case seated.
 * Seating has one author at a time, so the last save wins; what matters is
 * that it never touches answers or questions.
 */
export const saveSeating = async (caseId, body, auth) => {
  assertValidObjectId(caseId, 'case id');

  const { chartData, students } = body || {};
  if (!isPlainObject(chartData)) {
    throw createAppError('chartData must be an object', 400);
  }
  if (!Array.isArray(students)) {
    throw createAppError('students must be an array', 400);
  }

  const seated = students.map(normalizeSeatedStudent);
  const maxStudent = Math.max(0, ...seated.map((student) => student.number));

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
