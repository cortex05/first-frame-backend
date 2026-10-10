import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import { archiveCase } from '../../src/services/archiveService.js';
import { normalizeQuestionAnswers } from '../../src/services/caseContentValidation.js';
import { saveQuestionAnswers, saveSeating } from '../../src/services/caseSessionService.js';
import { updateCase } from '../../src/services/caseService.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

const YES = { label: true, value: 2 };
const NO = { label: false, value: 0 };

describe('caseSessionService.normalizeQuestionAnswers', () => {
	it('keeps label and value and finds the highest student', () => {
		expect(normalizeQuestionAnswers({ 1: { ...YES, extra: 'x' }, 3: { label: 'Maybe', value: 1 } })).toEqual({
			answers: { 1: YES, 3: { label: 'Maybe', value: 1 } },
			maxStudent: 3,
		});
	});

	it('accepts an empty object (clears the question)', () => {
		expect(normalizeQuestionAnswers({})).toEqual({ answers: {}, maxStudent: 0 });
	});

	it.each([
		['a missing body', undefined],
		['an array', [YES]],
		['a non-numeric student key', { 'student-1': YES }],
		['a zero student key', { 0: YES }],
		['a decimal student key', { '1.5': YES }],
		['an answer without a value', { 1: { label: 'x' } }],
		['an answer with a string value', { 1: { label: 'x', value: '2' } }],
		['an answer without a label', { 1: { value: 2 } }],
		['a non-object answer', { 1: 'true' }],
	])('rejects %s with a 400', (_label, answers) => {
		expect(() => normalizeQuestionAnswers(answers)).toThrow(expect.objectContaining({ statusCode: 400 }));
	});
});

describe('caseSessionService.saveQuestionAnswers', () => {
	it('saves one question and leaves the other questions alone', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, {
			answers: { 'q-2': { 1: NO } },
		});

		const saved = await saveQuestionAnswers(
			live._id.toString(),
			'q-1',
			{ answers: { 1: YES, 2: NO } },
			fixture.authFor(fixture.admin)
		);

		expect(saved.answers).toEqual({ 'q-1': { 1: YES, 2: NO }, 'q-2': { 1: NO } });
		expect(saved.revision).toBe(1);

		// case.answers is the only answer store (spec 010): the questions
		// themselves are left exactly as they were.
		const raw = await Case.collection.findOne({ _id: live._id });
		expect(raw.questions).toEqual(live.toObject().questions);
		for (const question of raw.questions) {
			expect(question).not.toHaveProperty('answers');
			expect(question).not.toHaveProperty('firstPoll');
		}
	});

	it('keeps both of two concurrent saves to different questions', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });
		const id = live._id.toString();

		await Promise.all([
			saveQuestionAnswers(id, 'q-1', { answers: { 1: YES } }, fixture.authFor(fixture.admin)),
			saveQuestionAnswers(id, 'q-2', { answers: { 2: NO } }, fixture.authFor(fixture.member)),
		]);

		const inDb = await Case.findById(live._id).lean();
		expect(inDb.answers).toEqual({ 'q-1': { 1: YES }, 'q-2': { 2: NO } });
		expect(inDb.revision).toBe(2);
	});

	it('404s a member who does not own the case, and another account', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		const live = await makeCase(fixture);

		for (const auth of [fixture.authFor(fixture.member), other.authFor(other.admin)]) {
			await expect(
				saveQuestionAnswers(live._id.toString(), 'q-1', { answers: { 1: YES } }, auth)
			).rejects.toMatchObject({ statusCode: 404 });
		}
		// Mongoose does not store an empty Mixed object.
		expect((await Case.findById(live._id).lean()).answers ?? {}).toEqual({});
	});

	it('reports a removed question as a conflict', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await expect(
			saveQuestionAnswers(live._id.toString(), 'gone', { answers: { 1: YES } }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 409, code: 'CASE_CONFLICT' });
	});

	it('refuses a student beyond the class size', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: 2 });

		await expect(
			saveQuestionAnswers(live._id.toString(), 'q-1', { answers: { 3: YES } }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it.each([['a dotted id', 'q.1'], ['a $ id', '$where'], ['an empty id', '']])(
		'rejects %s',
		async (_label, questionId) => {
			const fixture = await makeAccount();
			const live = await makeCase(fixture);

			await expect(
				saveQuestionAnswers(live._id.toString(), questionId, { answers: {} }, fixture.authFor(fixture.admin))
			).rejects.toMatchObject({ statusCode: 400 });
		}
	);
});

describe('caseSessionService.saveSeating', () => {
	const chartData = { rects: [{ id: 'r1', assignedStudents: [{ id: 1, x: 0, y: 0 }] }] };

	it('saves the chart and students, marks the case seated, and keeps answers', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: { 'q-1': { 1: YES } } });

		const saved = await saveSeating(
			live._id.toString(),
			{ chartData, students: [{ number: 1, extra: true }] },
			fixture.authFor(fixture.admin)
		);

		expect(saved.chartData).toEqual(chartData);
		expect(saved.toJSON().students).toEqual([{ number: 1, questionsAnswered: [] }]);
		expect(saved.seated).toBe(true);
		expect(saved.answers).toEqual({ 'q-1': { 1: YES } });
		expect(saved.revision).toBe(1);
	});

	it.each([
		['a missing chart', { students: [] }],
		['an array chart', { chartData: [], students: [] }],
		['missing students', { chartData }],
		['a student without a number', { chartData, students: [{}] }],
		['a student beyond the class size', { chartData, students: [{ number: 3 }] }],
	])('rejects %s with a 400', async (_label, body) => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: 2 });

		await expect(saveSeating(live._id.toString(), body, fixture.authFor(fixture.admin))).rejects.toMatchObject({
			statusCode: 400,
		});
	});

	it('404s a member who does not own the case', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture);

		await expect(
			saveSeating(live._id.toString(), { chartData, students: [] }, fixture.authFor(fixture.member))
		).rejects.toMatchObject({ statusCode: 404 });
	});
});

describe('caseService.updateCase revision', () => {
	it('bumps the revision on every save', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		const auth = fixture.authFor(fixture.admin);

		const first = await updateCase(live._id.toString(), { clientName: 'A', revision: 0 }, auth);
		const second = await updateCase(live._id.toString(), { clientName: 'B', revision: first.revision }, auth);

		expect([first.revision, second.revision]).toEqual([1, 2]);
	});

	it('refuses a stale whole-case save instead of erasing newer answers', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });
		const id = live._id.toString();
		const staleRevision = live.revision;

		// The owner answers while the admin's copy of the case is still open.
		await saveQuestionAnswers(id, 'q-1', { answers: { 1: YES } }, fixture.authFor(fixture.member));

		await expect(
			updateCase(id, { answers: {}, revision: staleRevision }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 409, code: 'CASE_CONFLICT' });
		expect((await Case.findById(live._id).lean()).answers).toEqual({ 'q-1': { 1: YES } });
	});

	it('checks the revision on a studentNumber change too', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: 3 });
		const auth = fixture.authFor(fixture.admin);
		await updateCase(live._id.toString(), { clientName: 'A' }, auth);

		await expect(
			updateCase(live._id.toString(), { studentNumber: 2, revision: 0 }, auth)
		).rejects.toMatchObject({ statusCode: 409 });
		expect((await Case.findById(live._id).lean()).studentNumber).toBe(3);
	});

	it('still 404s a stale save on a case the caller cannot see', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture);

		await expect(
			updateCase(live._id.toString(), { clientName: 'A', revision: 5 }, fixture.authFor(fixture.member))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('matches revision 0 on a case saved before revisions existed', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		await Case.collection.updateOne({ _id: live._id }, { $unset: { revision: '' } });

		const saved = await updateCase(
			live._id.toString(),
			{ clientName: 'A', revision: 0 },
			fixture.authFor(fixture.admin)
		);
		expect(saved.revision).toBe(1);
	});

	it('does not check a save that sends no revision', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { revision: 7 });

		const saved = await updateCase(live._id.toString(), { clientName: 'A' }, fixture.authFor(fixture.admin));
		expect(saved.revision).toBe(8);
	});

	it.each([['a negative', -1], ['a decimal', 1.5], ['a string', '1']])('rejects %s revision', async (_label, revision) => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await expect(
			updateCase(live._id.toString(), { clientName: 'A', revision }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('cannot set the revision directly', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await expect(
			updateCase(live._id.toString(), { revision: 0 }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
	});
});

describe('archiving and the revision', () => {
	it('does not copy the revision into the archive', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		const auth = fixture.authFor(fixture.admin);
		for (const questionId of ['q-1', 'q-2']) {
			await saveQuestionAnswers(live._id.toString(), questionId, { answers: { 1: YES } }, auth);
		}

		await archiveCase(live._id.toString(), auth);

		const archived = await ArchivedCase.findOne({ originalCaseId: live._id }).lean();
		expect(archived).not.toHaveProperty('revision');
	});
});
