/**
 * A case can be archived once it is complete: it has at least one question,
 * and every question has at least one saved student answer in
 * `case.answers[questionId]`. Answer entries for questions no longer on the
 * case are ignored.
 *
 * Mirrored in first-frame `src/utils/caseCompletion.js`, which only uses it to
 * enable the archive button. Keep the two in step; this one is the authority.
 */
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isCaseComplete = (caseDoc) => {
  const questions = Array.isArray(caseDoc?.questions) ? caseDoc.questions : [];
  if (questions.length === 0) {
    return false;
  }

  const answers = isPlainObject(caseDoc.answers) ? caseDoc.answers : {};

  return questions.every((question) => {
    const questionAnswers = answers[question.id];
    return isPlainObject(questionAnswers) && Object.keys(questionAnswers).length > 0;
  });
};
