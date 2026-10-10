import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import { buildSessionPayload } from '../../src/services/userService.js';
import { CASE_STUDENTS_MAX, QUESTION_TEXT_MAX, QUESTIONS_MAX } from '../../src/types.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

const bearer = (user, account) => ({ Authorization: `Bearer ${buildSessionPayload(user, account).token}` });

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

const OPTIONS = ['Strongly agree', 'Agree', 'Neutral', 'Disagree', 'Strongly disagree'].map((label, value) => ({
	label,
	value,
}));

/**
 * The biggest case real use can produce: every student seated and every
 * question answered, saved the way CaseScreen saves it (the whole case).
 */
const fullCasePayload = () => {
	const questions = [];
	const answers = {};

	for (let q = 0; q < QUESTIONS_MAX; q += 1) {
		const id = randomUUID();
		const questionAnswers = {};
		for (let student = 1; student <= CASE_STUDENTS_MAX; student += 1) {
			questionAnswers[student] = OPTIONS[(student + q) % OPTIONS.length];
		}
		questions.push({ id, text: 'x'.repeat(150), type: 'MULTIPLE_CHOICE', options: OPTIONS });
		answers[id] = questionAnswers;
	}

	const rects = Array.from({ length: CASE_STUDENTS_MAX / 10 }, (_, r) => ({
		id: `rect-1728571234567-${r}`,
		x: 123.456,
		y: 78.9,
		width: 240,
		height: 96,
		rows: 2,
		cols: 5,
		rotation: 12.5,
		assignedStudents: Array.from({ length: 10 }, (_, i) => ({ id: r * 10 + i + 1, x: 140.123, y: 90.987 })),
	}));

	return {
		questions,
		answers,
		chartData: { rects },
		students: Array.from({ length: CASE_STUDENTS_MAX }, (_, i) => ({ number: i + 1, questionsAnswered: [] })),
		seated: true,
	};
};

describe('case size limits over HTTP', () => {
	it('saves a full case at the maximums', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: CASE_STUDENTS_MAX });
		const payload = fullCasePayload();

		const res = await request(app)
			.put(`/api/cases/${live._id}`)
			.set(bearer(fixture.admin, fixture.account))
			.send(payload);

		expect(res.status).toBe(200);
		expect(res.body.data.questions).toHaveLength(QUESTIONS_MAX);
		expect(Object.keys(res.body.data.answers)).toHaveLength(QUESTIONS_MAX);
	}, 30000);

	it('refuses a body over 4 MB with 413', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		const res = await request(app)
			.put(`/api/cases/${live._id}`)
			.set(bearer(fixture.admin, fixture.account))
			.send({ clientName: 'x'.repeat(4 * 1024 * 1024 + 1) });

		expect(res.status).toBe(413);
	});

	it('reports a schema limit as a 400 with a readable message, not a 500', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		const res = await request(app)
			.put(`/api/cases/${live._id}`)
			.set(bearer(fixture.admin, fixture.account))
			.send({ questions: [{ id: 'q-1', text: 'x'.repeat(QUESTION_TEXT_MAX + 1), type: 'TRUE_FALSE' }] });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/text.*longer than the maximum allowed length \(1000\)/);
		expect(res.body.message).not.toMatch(/Validation failed/);
	});

	it('reports a case above the student maximum as a 400 on create', async () => {
		const fixture = await makeAccount();

		const res = await request(app)
			.post('/api/cases')
			.set(bearer(fixture.admin, fixture.account))
			.send({ clientName: 'C', attorney: 'A', category: 'criminal.theft', studentNumber: CASE_STUDENTS_MAX + 1 });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/studentNumber/);
	});
});
