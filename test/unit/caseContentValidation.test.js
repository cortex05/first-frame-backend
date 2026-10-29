import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Playlist from '../../src/models/Playlist.js';
import {
	assertChartData,
	normalizeCaseAnswers,
	normalizeIndividualRound,
	normalizeSeatedStudents,
} from '../../src/services/caseContentValidation.js';
import { createCase, updateCase } from '../../src/services/caseService.js';
import {
	CASE_STUDENTS_MAX,
	ID_MAX,
	INDIVIDUAL_ROUND_MAX,
	LABEL_MAX,
	QUESTION_OPTIONS_MAX,
	QUESTION_TEXT_MAX,
	QUESTIONS_MAX,
} from '../../src/types.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

const badRequest = expect.objectContaining({ statusCode: 400 });

// The chart exactly as StartScreen saves it.
const CHART = {
	rects: [
		{
			id: 'rect-1',
			x: 20,
			y: 20,
			width: 200,
			height: 80,
			rows: 2,
			cols: 3,
			rotation: 15,
			assignedStudents: [
				{ id: 1, x: 40.5, y: 30.25 },
				{ id: 2, x: 90, y: 30 },
			],
		},
	],
};

const seats = (count) => Array.from({ length: count }, (_, i) => ({ id: i + 1, x: 0, y: 0 }));

describe('assertChartData', () => {
	it('accepts the StartScreen chart and an unseated {}', () => {
		expect(() => assertChartData(CHART)).not.toThrow();
		expect(() => assertChartData({})).not.toThrow();
		expect(() => assertChartData({ rects: [] })).not.toThrow();
	});

	it.each([
		['null', null],
		['an array', []],
		['an unknown top-level field', { rects: [], extra: 1 }],
		['rects that are not an array', { rects: {} }],
		['a nested object in a rect', { rects: [{ id: 'r', style: { fill: 'red' } }] }],
		['a long string in a rect', { rects: [{ id: 'x'.repeat(ID_MAX + 1) }] }],
		['a non-finite number', { rects: [{ id: 'r', x: Infinity }] }],
		['a nested object in a seat', { rects: [{ id: 'r', assignedStudents: [{ id: 1, meta: {} }] }] }],
		['too many rects', { rects: Array.from({ length: CASE_STUDENTS_MAX + 1 }, () => ({ id: 'r' })) }],
		[
			'more seats than students across rects',
			{
				rects: [
					{ id: 'a', assignedStudents: seats(CASE_STUDENTS_MAX) },
					{ id: 'b', assignedStudents: seats(1) },
				],
			},
		],
	])('rejects %s', (_label, chartData) => {
		expect(() => assertChartData(chartData)).toThrow(badRequest);
	});
});

describe('normalizeCaseAnswers', () => {
	it('keeps label and value for every question', () => {
		expect(
			normalizeCaseAnswers({ 'q-1': { 1: { label: true, value: 2, extra: 1 } }, 'q-2': {} })
		).toEqual({ 'q-1': { 1: { label: true, value: 2 } }, 'q-2': {} });
	});

	it.each([
		['an array', []],
		['a dotted question id', { 'q.1': {} }],
		['a student beyond the maximum', { 'q-1': { [CASE_STUDENTS_MAX + 1]: { label: 'a', value: 1 } } }],
		['a label over the limit', { 'q-1': { 1: { label: 'x'.repeat(LABEL_MAX + 1), value: 1 } } }],
		[
			'more questions than the maximum',
			Object.fromEntries(Array.from({ length: QUESTIONS_MAX + 1 }, (_, i) => [`q-${i}`, {}])),
		],
	])('rejects %s', (_label, answers) => {
		expect(() => normalizeCaseAnswers(answers)).toThrow(badRequest);
	});
});

describe('normalizeIndividualRound', () => {
	it('splits into entries to set and zeros to unset, and finds the highest student set', () => {
		expect(normalizeIndividualRound({ 1: 2, 3: -1, 7: 0 })).toEqual({
			set: { 1: 2, 3: -1 },
			unset: ['7'],
			maxStudent: 3,
		});
	});

	it('accepts an empty object and the bounds themselves', () => {
		expect(normalizeIndividualRound({})).toEqual({ set: {}, unset: [], maxStudent: 0 });
		expect(normalizeIndividualRound({ 1: INDIVIDUAL_ROUND_MAX, 2: -INDIVIDUAL_ROUND_MAX }).set).toEqual({
			1: INDIVIDUAL_ROUND_MAX,
			2: -INDIVIDUAL_ROUND_MAX,
		});
	});

	it.each([
		['a missing body', undefined],
		['null', null],
		['an array', [1, 2]],
		['a zero student key', { 0: 1 }],
		['a decimal student key', { '1.5': 1 }],
		['a leading-zero student key', { '01': 1 }],
		['two keys for one student', { 1: 5, '01': -3 }],
		['a $ key', { $x: 1 }],
		['a student beyond the maximum', { [CASE_STUDENTS_MAX + 1]: 1 }],
		['a decimal value', { 1: 1.5 }],
		['a string value', { 1: '2' }],
		['a value above the bound', { 1: INDIVIDUAL_ROUND_MAX + 1 }],
		['a value below the bound', { 1: -INDIVIDUAL_ROUND_MAX - 1 }],
	])('rejects %s with a 400', (_label, individualRound) => {
		expect(() => normalizeIndividualRound(individualRound)).toThrow(badRequest);
	});
});

describe('normalizeSeatedStudents', () => {
	it('drops unknown fields and finds the highest number', () => {
		expect(normalizeSeatedStudents([{ number: 2, extra: true }, { number: 5 }])).toEqual({
			students: [
				{ number: 2, questionsAnswered: [] },
				{ number: 5, questionsAnswered: [] },
			],
			maxStudent: 5,
		});
	});

	it('rejects more students than the maximum', () => {
		const students = Array.from({ length: CASE_STUDENTS_MAX + 1 }, (_, i) => ({ number: i + 1 }));
		expect(() => normalizeSeatedStudents(students)).toThrow(badRequest);
	});
});

describe('case size limits through the services', () => {
	const question = (overrides = {}) => ({ id: 'q-1', text: 'Intent?', type: 'TRUE_FALSE', ...overrides });

	it('refuses to create a case above the student maximum', async () => {
		const fixture = await makeAccount();

		await expect(
			createCase(
				{ clientName: 'C', attorney: 'A', category: 'criminal.theft', studentNumber: CASE_STUDENTS_MAX + 1 },
				fixture.authFor(fixture.admin)
			)
		).rejects.toMatchObject({ name: 'ValidationError' });
	});

	it.each([
		['too many questions', Array.from({ length: QUESTIONS_MAX + 1 }, (_, i) => question({ id: `q-${i}` }))],
		['question text over the limit', [question({ text: 'x'.repeat(QUESTION_TEXT_MAX + 1) })]],
		[
			'too many options',
			[
				question({
					type: 'MULTIPLE_CHOICE',
					options: Array.from({ length: QUESTION_OPTIONS_MAX + 1 }, (_, i) => ({ label: `o${i}`, value: i })),
				}),
			],
		],
		['an option label over the limit', [question({ options: [{ label: 'x'.repeat(LABEL_MAX + 1), value: 1 }] })]],
		['a question id over the limit', [question({ id: 'x'.repeat(ID_MAX + 1) })]],
	])('refuses a whole-case save with %s and leaves the case unchanged', async (_label, questions) => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await expect(
			updateCase(live._id.toString(), { questions }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ name: 'ValidationError' });

		const after = await live.constructor.findById(live._id).lean();
		expect(after.questions).toHaveLength(2);
		expect(after.revision ?? 0).toBe(0);
	});

	it('accepts a case exactly at the limits', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: CASE_STUDENTS_MAX });
		const questions = Array.from({ length: QUESTIONS_MAX }, (_, i) =>
			question({
				id: `q-${i}`,
				text: 'x'.repeat(QUESTION_TEXT_MAX),
				type: 'MULTIPLE_CHOICE',
				options: Array.from({ length: QUESTION_OPTIONS_MAX }, (_, j) => ({
					label: 'x'.repeat(LABEL_MAX),
					value: j,
				})),
			})
		);

		const saved = await updateCase(live._id.toString(), { questions }, fixture.authFor(fixture.admin));
		expect(saved.questions).toHaveLength(QUESTIONS_MAX);
	});

	it('refuses a playlist with too many questions', async () => {
		const fixture = await makeAccount();

		await expect(
			Playlist.create({
				account: fixture.account._id,
				createdBy: fixture.admin._id,
				title: 'Big',
				questions: Array.from({ length: QUESTIONS_MAX + 1 }, (_, i) => question({ id: `q-${i}` })),
			})
		).rejects.toMatchObject({ name: 'ValidationError' });
	});

	it('refuses whole-case answers, students and chartData that break the rules', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		const auth = fixture.authFor(fixture.admin);

		for (const payload of [
			{ answers: { 'q-1': { 1: { label: 'a' } } } },
			{ students: [{ number: 0 }] },
			{ chartData: { rects: [{ id: 'r', nested: { a: 1 } }] } },
		]) {
			await expect(updateCase(live._id.toString(), payload, auth)).rejects.toMatchObject({ statusCode: 400 });
		}
	});
});
