import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import Transaction from '../../src/models/Transaction.js';
import {
	archiveCase,
	getArchivedCase,
	listArchivedCases,
} from '../../src/services/archiveService.js';
import {
	answerAll,
	initModels,
	makeAccount,
	makeCase,
	makeTransaction,
	resetDb,
} from '../helpers/fixtures.js';

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

describe('archiveService.archiveCase transaction record', () => {
	const startedBy = (user) => ({
		status: 'in_progress',
		coreFeature: { username: user.username, userId: user._id, startedAt: new Date('2026-09-01T10:00:00Z') },
	});

	it('closes an in-progress transaction in the same step as the archive', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id], answers: answerAll() });
		await makeTransaction(fixture, live, startedBy(fixture.member));

		const archived = await archiveCase(live._id.toString(), fixture.authFor(fixture.member));

		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('closed');
		expect(transaction.archivedCase.toString()).toBe(archived._id.toString());
		expect(transaction.termination.archived).toBe(true);
		expect(transaction.termination.finishedAt.toISOString()).toBe(archived.archivedAt.toISOString());
		expect(transaction.termination.conclusion.manuallyClosed).toBe(true);
		expect(transaction.termination.conclusion.actor).toBe(fixture.member.username);
		expect(transaction.termination.conclusion.actorId.toString()).toBe(fixture.member._id.toString());
		// The start is kept.
		expect(transaction.coreFeature.username).toBe(fixture.member.username);
	});

	it('closes a transaction that was never started', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		await makeTransaction(fixture, live);

		await archiveCase(live._id.toString(), fixture.authFor(fixture.admin));

		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('closed');
		expect(transaction.coreFeature).toEqual({ username: null, userId: null, startedAt: null });
	});

	it('leaves the transaction alone when the archive is refused', async () => {
		const fixture = await makeAccount({ members: 1 });
		const incomplete = await makeCase(fixture, { answers: {} });
		const complete = await makeCase(fixture, { answers: answerAll() });
		await makeTransaction(fixture, incomplete);
		await makeTransaction(fixture, complete);
		const before = await Transaction.find().sort({ _id: 1 }).lean();

		await expect(
			archiveCase(incomplete._id.toString(), fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 409 });
		await expect(
			archiveCase(complete._id.toString(), fixture.authFor(fixture.member))
		).rejects.toMatchObject({ statusCode: 404 });

		expect(await Transaction.find().sort({ _id: 1 }).lean()).toEqual(before);
	});

	it('closes the transaction once when two archives race', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id], answers: answerAll() });
		await makeTransaction(fixture, live);

		const results = await Promise.allSettled([
			archiveCase(live._id.toString(), fixture.authFor(fixture.admin)),
			archiveCase(live._id.toString(), fixture.authFor(fixture.member)),
		]);

		const winner = results.find((r) => r.status === 'fulfilled').value;
		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('closed');
		expect(transaction.archivedCase.toString()).toBe(winner._id.toString());
		expect(transaction.termination.conclusion.actorId.toString()).toBe(winner.archivedBy.toString());
	});

	it('archives a case created before transactions existed', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });

		await expect(archiveCase(live._id.toString(), fixture.authFor(fixture.admin))).resolves.toBeTruthy();
		expect(await Transaction.countDocuments()).toBe(0);
	});

	it('records an automatic close without an actor', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		await makeTransaction(fixture, live);

		await archiveCase(live._id.toString(), fixture.authFor(fixture.admin), { reason: 'purchase' });

		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('closed');
		expect(transaction.termination.conclusion).toEqual({
			manuallyClosed: false,
			actor: null,
			actorId: null,
		});
	});

	it('never changes a closed transaction', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		await makeTransaction(fixture, live, {
			status: 'closed',
			termination: {
				archived: true,
				finishedAt: new Date('2026-09-01T00:00:00Z'),
				conclusion: { manuallyClosed: false, actor: null, actorId: null },
			},
		});
		const before = await Transaction.findOne({ case: live._id }).lean();

		await archiveCase(live._id.toString(), fixture.authFor(fixture.admin));

		expect(await Transaction.findOne({ case: live._id }).lean()).toEqual(before);
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
