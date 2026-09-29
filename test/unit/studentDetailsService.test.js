import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Case from '../../src/models/Case.js';
import {
	normalizeStudentDetails,
	setStudentDetails,
} from '../../src/services/studentDetailsService.js';
import { STUDENT_DETAILS, answerAll, initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('studentDetailsService.normalizeStudentDetails', () => {
	it('trims text and keeps only the fields that are set', () => {
		expect(
			normalizeStudentDetails({ age: 34, occupation: '  Teacher ', gender: null, race: '' })
		).toEqual({ age: 34, occupation: 'Teacher' });
	});

	it('treats missing, null, blank and whitespace-only values as empty', () => {
		expect(normalizeStudentDetails({})).toEqual({});
		expect(normalizeStudentDetails(undefined)).toEqual({});
		expect(normalizeStudentDetails({ age: null, occupation: '   ', gender: '', race: undefined })).toEqual({});
	});

	it('ignores unknown keys', () => {
		expect(normalizeStudentDetails({ race: 'Asian', score: 99, answers: {} })).toEqual({ race: 'Asian' });
	});

	it('accepts the age boundaries and both genders', () => {
		expect(normalizeStudentDetails({ age: 18, gender: 'male' })).toEqual({ age: 18, gender: 'male' });
		expect(normalizeStudentDetails({ age: 120, gender: 'female' })).toEqual({ age: 120, gender: 'female' });
	});

	it.each([
		['age below 18', { age: 17 }],
		['age above 120', { age: 121 }],
		['a decimal age', { age: 30.5 }],
		['a numeric-string age', { age: '30' }],
		['an unknown gender', { gender: 'other' }],
		['an occupation over 100 characters', { occupation: 'x'.repeat(101) }],
		['a race over 50 characters', { race: 'x'.repeat(51) }],
		['a non-string occupation', { occupation: 42 }],
		['a non-string race', { race: ['a'] }],
	])('rejects %s with a 400', (_label, body) => {
		expect(() => normalizeStudentDetails(body)).toThrow(expect.objectContaining({ statusCode: 400 }));
	});

	it('measures length after trimming', () => {
		expect(normalizeStudentDetails({ race: `  ${'x'.repeat(50)}  ` }).race).toHaveLength(50);
	});
});

describe('studentDetailsService.setStudentDetails', () => {
	it('stores the details and returns the whole map', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: 3, studentDetails: { 1: { age: 50 } } });

		const result = await setStudentDetails(
			live._id.toString(),
			'3',
			{ age: 34, occupation: '  Teacher ', gender: null, race: '' },
			fixture.authFor(fixture.admin)
		);

		expect(result).toEqual({
			caseId: live._id.toString(),
			studentNumber: 3,
			studentDetails: { 1: { age: 50 }, 3: { age: 34, occupation: 'Teacher' } },
		});

		const inDb = await Case.findById(live._id).lean();
		expect(inDb.studentDetails).toEqual({ 1: { age: 50 }, 3: { age: 34, occupation: 'Teacher' } });
	});

	it('replaces the whole entry rather than merging into it', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentDetails: STUDENT_DETAILS });

		const result = await setStudentDetails(live._id.toString(), '1', { gender: 'male' }, fixture.authFor(fixture.admin));

		expect(result.studentDetails['1']).toEqual({ gender: 'male' });
	});

	it('removes the entry when every field is empty', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentDetails: STUDENT_DETAILS });

		const result = await setStudentDetails(
			live._id.toString(),
			'1',
			{ age: null, occupation: '', gender: '', race: '  ' },
			fixture.authFor(fixture.admin)
		);

		expect(result.studentDetails).toEqual({ 2: { age: 50 } });
		const inDb = await Case.findById(live._id).lean();
		expect(Object.keys(inDb.studentDetails)).toEqual(['2']);
	});

	it('touches nothing but that one student', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, {
			studentDetails: STUDENT_DETAILS,
			answers: answerAll(),
			chartData: { rects: [{ id: 'r1', assignedStudents: [{ id: 1 }, { id: 2 }] }] },
			students: [{ number: 1 }, { number: 2 }],
			seated: true,
		});
		const before = await Case.findById(live._id).lean();

		await setStudentDetails(live._id.toString(), '2', { race: 'Asian' }, fixture.authFor(fixture.admin));

		const after = await Case.findById(live._id).lean();
		expect(after.studentDetails['1']).toEqual(before.studentDetails['1']);
		expect(after.studentDetails['2']).toEqual({ race: 'Asian' });
		for (const field of ['answers', 'chartData', 'students', 'questions', 'seated', 'studentNumber', 'clientName']) {
			expect(after[field]).toEqual(before[field]);
		}
	});

	it.each([['0'], ['3'], ['1.5'], ['abc'], ['1e0'], ['-1']])(
		'rejects student number %s with a 400 and writes nothing',
		async (number) => {
			const fixture = await makeAccount();
			const live = await makeCase(fixture, { studentNumber: 2 });

			await expect(
				setStudentDetails(live._id.toString(), number, { age: 30 }, fixture.authFor(fixture.admin))
			).rejects.toMatchObject({ statusCode: 400 });

			const inDb = await Case.findById(live._id).lean();
			expect(inDb.studentDetails).toEqual({});
		}
	);

	it('rejects invalid details with a 400 and writes nothing', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentDetails: STUDENT_DETAILS });

		await expect(
			setStudentDetails(live._id.toString(), '1', { age: 17 }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });

		const inDb = await Case.findById(live._id).lean();
		expect(inDb.studentDetails['1']).toEqual(STUDENT_DETAILS[1]);
	});

	it('rejects an invalid case id', async () => {
		const fixture = await makeAccount();

		await expect(
			setStudentDetails('nope', '1', { age: 30 }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('404s for a case that does not exist', async () => {
		const fixture = await makeAccount();

		await expect(
			setStudentDetails(new mongoose.Types.ObjectId().toString(), '1', { age: 30 }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('404s for another account, even when the student number is out of range', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();
		const live = await makeCase(fixture, { studentNumber: 2 });

		for (const number of ['1', '5']) {
			await expect(
				setStudentDetails(live._id.toString(), number, { age: 30 }, other.authFor(other.admin))
			).rejects.toMatchObject({ statusCode: 404 });
		}
	});

	it('404s for a member who does not own the case', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture);

		await expect(
			setStudentDetails(live._id.toString(), '1', { age: 30 }, fixture.authFor(fixture.member))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('lets an owner and an account admin save', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });

		await setStudentDetails(live._id.toString(), '1', { age: 30 }, fixture.authFor(fixture.member));
		const result = await setStudentDetails(live._id.toString(), '2', { age: 40 }, fixture.authFor(fixture.admin));

		expect(result.studentDetails).toEqual({ 1: { age: 30 }, 2: { age: 40 } });
	});
});
