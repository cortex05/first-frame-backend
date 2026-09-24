import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import {
	archiveCase,
	getArchivedCase,
	listArchivedCases,
} from '../../src/services/archiveService.js';
import { answerAll, initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('archiveService.archiveCase', () => {
	it('moves a complete case into the archive as a full snapshot', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, {
			owners: [fixture.member._id],
			answers: answerAll(),
			chartData: { rows: 3 },
			seated: true,
		});

		const archived = await archiveCase(live._id.toString(), fixture.authFor(fixture.member));

		expect(await Case.findById(live._id)).toBeNull();
		expect(archived.originalCaseId.toString()).toBe(live._id.toString());
		expect(archived._id.toString()).not.toBe(live._id.toString());
		expect(archived.archivedBy.toString()).toBe(fixture.member._id.toString());
		expect(archived.archiveReason).toBe('manual');

		const inDb = await ArchivedCase.findById(archived._id).lean();
		expect(inDb.account.toString()).toBe(fixture.account._id.toString());
		expect(inDb.createdBy.toString()).toBe(fixture.admin._id.toString());
		expect(inDb.owners.map(String)).toEqual([fixture.member._id.toString()]);
		expect(inDb.clientName).toBe(live.clientName);
		expect(inDb.createdOn.toISOString()).toBe(live.createdOn.toISOString());
		expect(inDb.questions).toHaveLength(2);
		expect(inDb.answers).toEqual(answerAll());
		expect(inDb.chartData).toEqual({ rows: 3 });
		expect(inDb.seated).toBe(true);
	});

	it('lets an admin archive a case they do not own', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });

		await expect(archiveCase(live._id.toString(), fixture.authFor(fixture.admin))).resolves.toBeTruthy();
	});

	it('refuses an incomplete case and changes nothing', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: { 'q-1': { s1: 'a' } } });

		await expect(archiveCase(live._id.toString(), fixture.authFor(fixture.admin))).rejects.toMatchObject({
			message: 'Case is not complete: every question must have answers',
			statusCode: 409,
		});
		expect(await Case.findById(live._id)).not.toBeNull();
		expect(await ArchivedCase.countDocuments()).toBe(0);
	});

	it('returns 404 to a member who does not own the case, and to another account', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });

		await expect(archiveCase(live._id.toString(), fixture.authFor(fixture.member))).rejects.toMatchObject({
			statusCode: 404,
		});
		await expect(archiveCase(live._id.toString(), other.authFor(other.admin))).rejects.toMatchObject({
			statusCode: 404,
		});
		expect(await Case.findById(live._id)).not.toBeNull();
	});

	it('archives a case exactly once when two requests race', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		const auth = fixture.authFor(fixture.admin);

		const results = await Promise.allSettled([
			archiveCase(live._id.toString(), auth),
			archiveCase(live._id.toString(), auth),
		]);

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((r) => r.status === 'rejected');
		expect(rejected.reason.statusCode).toBe(404);
		expect(await ArchivedCase.countDocuments()).toBe(1);
		expect(await Case.countDocuments()).toBe(0);
	});

	it('refuses to change an archived case', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		const archived = await archiveCase(live._id.toString(), fixture.authFor(fixture.admin));

		archived.clientName = 'Rewritten';
		await archived.save();

		expect((await ArchivedCase.findById(archived._id)).clientName).toBe(live.clientName);
	});
});

describe('archiveService.listArchivedCases / getArchivedCase', () => {
	const archiveFor = async (fixture, owners, clientName) => {
		const live = await makeCase(fixture, { owners, clientName, answers: answerAll() });
		return archiveCase(live._id.toString(), fixture.authFor(fixture.admin));
	};

	it('shows an admin every archive in the account, newest first', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		await archiveFor(fixture, [], 'First');
		await archiveFor(fixture, [fixture.member._id], 'Second');
		await archiveFor(other, [], 'Other account');

		const result = await listArchivedCases(fixture.authFor(fixture.admin));

		expect(result.map((a) => a.clientName)).toEqual(['Second', 'First']);
		// Summary projection: the heavy fields stay out of the list.
		expect(result[0].answers).toBeUndefined();
		expect(result[0].students).toBeUndefined();
	});

	it('shows an owner only the archives they owned', async () => {
		const fixture = await makeAccount({ members: 2 });
		const [me, someoneElse] = fixture.members;
		const mine = await archiveFor(fixture, [me._id], 'Mine');
		const theirs = await archiveFor(fixture, [someoneElse._id], 'Theirs');

		const auth = fixture.authFor(me);
		const result = await listArchivedCases(auth);

		expect(result.map((a) => a.clientName)).toEqual(['Mine']);
		expect((await getArchivedCase(mine._id.toString(), auth)).clientName).toBe('Mine');
		await expect(getArchivedCase(theirs._id.toString(), auth)).rejects.toMatchObject({ statusCode: 404 });
	});

	it('hides another account archive', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();
		const archived = await archiveFor(fixture, [], 'Mine');

		await expect(
			getArchivedCase(archived._id.toString(), other.authFor(other.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});
});
