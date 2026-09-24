import { describe, expect, it } from 'vitest';

import { isCaseComplete } from '../../src/policies/caseCompletion.js';

// Keep this table identical to first-frame src/utils/caseCompletion.test.js.
const q1 = { id: 'q-1' };
const q2 = { id: 'q-2' };

const cases = [
	['no questions', { questions: [], answers: {} }, false],
	['missing questions and answers', {}, false],
	['a question with no answers entry', { questions: [q1, q2], answers: { 'q-1': { s1: 'a' } } }, false],
	['a question with an empty answers object', { questions: [q1], answers: { 'q-1': {} } }, false],
	['a question with a null answers entry', { questions: [q1], answers: { 'q-1': null } }, false],
	['answers is not an object', { questions: [q1], answers: null }, false],
	['every question answered by one student', { questions: [q1, q2], answers: { 'q-1': { s1: 'a' }, 'q-2': { s2: 'b' } } }, true],
	['stray answers for a removed question are ignored', { questions: [q1], answers: { 'q-1': { s1: 'a' }, 'q-gone': {} } }, true],
];

describe('isCaseComplete', () => {
	it.each(cases)('%s', (_label, caseDoc, expected) => {
		expect(isCaseComplete(caseDoc)).toBe(expected);
	});
});
