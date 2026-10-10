import { CASE_STUDENTS_MAX, ID_MAX, LABEL_MAX, QUESTIONS_MAX } from '../types.js';
import { createAppError } from '../utils/error.js';

/**
 * Validation for the case fields Mongoose stores as Mixed (`answers`,
 * `chartData`, `students[].questionsAnswered`) and so cannot check itself.
 * Each bound comes from src/types.js, so whatever a client sends, a case (and
 * the archive copied from it) stays a known, modest size.
 *
 * Shared by the whole-case save (caseService.updateCase) and the targeted
 * saves (caseSessionService).
 */

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const badRequest = (message) => createAppError(message, 400);

// The id becomes part of the update path `answers.<questionId>`, so it cannot
// hold a '.' or start with '$'. Question ids are UUIDs in practice.
export const assertQuestionId = (questionId) => {
  if (
    typeof questionId !== 'string' ||
    !questionId ||
    questionId.length > ID_MAX ||
    questionId.includes('.') ||
    questionId.startsWith('$')
  ) {
    throw badRequest('Valid question id is required');
  }
};

// Student numbers arrive as object keys: plain digits only ('1.5', '1e1',
// '$x' do not count), which also keeps them safe inside an update path.
const parseStudentKey = (key) => {
  const number = /^\d+$/.test(key) ? Number(key) : NaN;
  if (!Number.isInteger(number) || number < 1 || number > CASE_STUDENTS_MAX) {
    throw badRequest('answers must be keyed by student number');
  }
  return number;
};

// One answer is the option the student picked: { label, value }. Anything
// else on the object is dropped.
const normalizeAnswer = (answer) => {
  const { label, value } = isPlainObject(answer) ? answer : {};
  const validLabel =
    typeof label === 'boolean' ||
    (typeof label === 'number' && Number.isFinite(label)) ||
    (typeof label === 'string' && label.length <= LABEL_MAX);

  if (!validLabel || typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest('each answer must be an option: { label, value }');
  }
  return { label, value };
};

/**
 * Validates one question's answers, `{ [studentNumber]: { label, value } }`.
 * Returns the answers, the same answers as the string labels kept on the
 * question, and the highest student number (0 when empty).
 */
export const normalizeQuestionAnswers = (answers) => {
  if (!isPlainObject(answers)) {
    throw badRequest('answers must be an object keyed by student number');
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

/** The whole-case `answers`: `{ [questionId]: <one question's answers> }`. */
export const normalizeCaseAnswers = (answers) => {
  if (!isPlainObject(answers)) {
    throw badRequest('answers must be an object keyed by question id');
  }

  const entries = Object.entries(answers);
  if (entries.length > QUESTIONS_MAX) {
    throw badRequest(`answers cannot cover more than ${QUESTIONS_MAX} questions`);
  }

  return Object.fromEntries(
    entries.map(([questionId, questionAnswers]) => {
      assertQuestionId(questionId);
      return [questionId, normalizeQuestionAnswers(questionAnswers).answers];
    })
  );
};

// A seated student: { number, questionsAnswered? }. Other fields are dropped.
const normalizeSeatedStudent = (student) => {
  if (!isPlainObject(student) || !Number.isInteger(student.number) || student.number < 1) {
    throw badRequest('each student must have a whole-number number of at least 1');
  }
  if (student.questionsAnswered !== undefined && !Array.isArray(student.questionsAnswered)) {
    throw badRequest('questionsAnswered must be an array');
  }
  return { number: student.number, questionsAnswered: student.questionsAnswered ?? [] };
};

/** Returns the students and the highest student number (0 when empty). */
export const normalizeSeatedStudents = (students) => {
  if (!Array.isArray(students)) {
    throw badRequest('students must be an array');
  }
  if (students.length > CASE_STUDENTS_MAX) {
    throw badRequest(`students cannot have more than ${CASE_STUDENTS_MAX} entries`);
  }

  const normalized = students.map(normalizeSeatedStudent);
  const maxStudent = Math.max(0, ...normalized.map((student) => student.number));
  return { students: normalized, maxStudent };
};

const isSmallPrimitive = (value) =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= ID_MAX);

// Every value is a number, short string, boolean or null, except the keys
// listed in `nested`, which are checked by their own function.
const assertFlatObject = (value, what, nested = {}) => {
  if (!isPlainObject(value)) {
    throw badRequest(`${what} must be an object`);
  }
  for (const [key, field] of Object.entries(value)) {
    if (nested[key]) {
      nested[key](field);
    } else if (!isSmallPrimitive(field)) {
      throw badRequest(`${what}.${key} must be a number, short string, boolean or null`);
    }
  }
};

const assertBoundedArray = (value, what) => {
  if (!Array.isArray(value)) {
    throw badRequest(`${what} must be an array`);
  }
  if (value.length > CASE_STUDENTS_MAX) {
    throw badRequest(`${what} cannot have more than ${CASE_STUDENTS_MAX} entries`);
  }
};

/**
 * The seating chart as StartScreen stores it:
 * `{ rects: [{ id, x, y, width, height, rows, cols, rotation, assignedStudents:
 * [{ id, x, y }] }] }`. Field names inside a rect or seat are not fixed, so a
 * new drawing property needs no backend change, but every value must be
 * small and flat and the counts are bounded. `{}` is an unseated case.
 */
export const assertChartData = (chartData) => {
  let seats = 0;

  const assertSeats = (assignedStudents) => {
    assertBoundedArray(assignedStudents, 'chartData.rects[].assignedStudents');
    seats += assignedStudents.length;
    for (const seat of assignedStudents) {
      assertFlatObject(seat, 'chartData seat');
    }
  };

  const assertRects = (rects) => {
    assertBoundedArray(rects, 'chartData.rects');
    for (const rect of rects) {
      assertFlatObject(rect, 'chartData rect', { assignedStudents: assertSeats });
    }
  };

  if (!isPlainObject(chartData)) {
    throw badRequest('chartData must be an object');
  }
  const unknown = Object.keys(chartData).filter((key) => key !== 'rects');
  if (unknown.length) {
    throw badRequest(`chartData has unknown fields: ${unknown.join(', ')}`);
  }
  if (chartData.rects !== undefined) {
    assertRects(chartData.rects);
  }
  if (seats > CASE_STUDENTS_MAX) {
    throw badRequest(`chartData cannot seat more than ${CASE_STUDENTS_MAX} students`);
  }
};
