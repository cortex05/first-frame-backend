export const QUESTION_TYPES = ['TRUE_FALSE', 'MULTIPLE_CHOICE'];

// Case classification lives in ./caseCategories.js (mirrored into the frontend
// repo -- see the header comment there).

// Optional, viewer-only student details (Case.studentDetails, spec 005). The
// frontend's src/types/ENUMS.js carries the same limits for its inputs.
export const STUDENT_GENDERS = ['male', 'female'];
export const STUDENT_AGE_MIN = 18;
export const STUDENT_AGE_MAX = 120;
export const STUDENT_OCCUPATION_MAX = 100;
export const STUDENT_RACE_MAX = 50;

// Size limits for case content. They bound how large a case (and so its
// permanent archive) can grow, whatever a client sends. Set well above real
// use: a full case at these maxima with typical option labels serializes to
// about 1.2 MB, and the JSON body limit in src/app.js (4 MB) leaves room for
// longer labels. The frontend has no matching inputs; the server's 400
// message is shown if one is ever reached.
export const CASE_STUDENTS_MAX = 300;
export const QUESTIONS_MAX = 100;
export const QUESTION_OPTIONS_MAX = 20;
export const QUESTION_TEXT_MAX = 1000;
// Option labels, and the answer labels copied from them.
export const LABEL_MAX = 200;
// Question ids, and the ids and other strings inside the seating chart.
export const ID_MAX = 100;
