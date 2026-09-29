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
