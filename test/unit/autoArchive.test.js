import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAutoArchive } from '../../src/jobs/autoArchiveExpiredCases.js';
import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import Transaction from '../../src/models/Transaction.js';
import { archiveCase, autoArchiveCase } from '../../src/services/archiveService.js';
import {
	STUDENT_DETAILS,
	answerAll,
	initModels,
	makeAccount,
	makeCase,
	makeTransaction,
	resetDb,
} from '../helpers/fixtures.js';

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const silentLogger = { error: vi.fn() };
const run = () => runAutoArchive({ now: NOW, logger: silentLogger });

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
	silentLogger.error.mockClear();
});

describe('runAutoArchive', () => {
	it('archives an incomplete case a week after purchase and closes its transaction', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { studentDetails: STUDENT_DETAILS });
		await makeTransaction(fixture, live, { createdAt: daysAgo(7) });

		expect(await run()).toEqual({ archived: 1, skipped: 0, failed: 0 });

		expect(await Case.findById(live._id)).toBeNull();

		const archived = await ArchivedCase.findOne({ originalCaseId: live._id }).lean();
		expect(archived.archiveReason).toBe('purchase');
		expect(archived.archivedBy).toBeNull();
		expect(archived).not.toHaveProperty('studentDetails');

		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('closed');
		expect(transaction.archivedCase.toString()).toBe(archived._id.toString());
		expect(transaction.termination).toEqual({
			archived: true,
			finishedAt: archived.archivedAt,
			conclusion: { manuallyClosed: false, actor: 'auto', actorId: null },
		});
	});

	it('sweeps both active and in-progress transactions', async () => {
		const fixture = await makeAccount();
		const active = await makeCase(fixture);
		const started = await makeCase(fixture);
		await makeTransaction(fixture, active, { createdAt: daysAgo(10) });
		await makeTransaction(fixture, started, { createdAt: daysAgo(8), status: 'in_progress' });

		expect(await run()).toEqual({ archived: 2, skipped: 0, failed: 0 });
		expect(await Case.countDocuments()).toBe(0);
		expect(await Transaction.countDocuments({ status: 'closed' })).toBe(2);
	});

	it('leaves recent, closed and transaction-less cases alone', async () => {
		const fixture = await makeAccount();
		const recent = await makeCase(fixture);
		await makeTransaction(fixture, recent, { createdAt: daysAgo(6) });

		const legacy = await makeCase(fixture);

		const closedCase = await makeCase(fixture);
		await makeTransaction(fixture, closedCase, {
			createdAt: daysAgo(30),
			status: 'closed',
			termination: {
				archived: true,
				finishedAt: daysAgo(20),
				conclusion: { manuallyClosed: true, actor: 'someone', actorId: fixture.admin._id },
			},
		});
		const closedBefore = await Transaction.findOne({ case: closedCase._id }).lean();

		expect(await run()).toEqual({ archived: 0, skipped: 0, failed: 0 });

		expect(await Case.exists({ _id: recent._id })).toBeTruthy();
		expect(await Case.exists({ _id: legacy._id })).toBeTruthy();
		expect(await Transaction.findOne({ case: closedCase._id }).lean()).toEqual(closedBefore);
		expect(await ArchivedCase.countDocuments()).toBe(0);
	});

	it('is a no-op on a second run', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		await makeTransaction(fixture, live, { createdAt: daysAgo(9) });

		await run();

		expect(await run()).toEqual({ archived: 0, skipped: 0, failed: 0 });
		expect(await ArchivedCase.countDocuments()).toBe(1);
	});

	it('keeps going when one case fails and reports it', async () => {
		const fixture = await makeAccount();
		const good = await makeCase(fixture);
		await makeTransaction(fixture, good, { createdAt: daysAgo(8) });

		// Bypasses validation so the archive snapshot is rejected.
		const { insertedId: badId } = await Case.collection.insertOne({
			account: fixture.account._id,
			createdBy: fixture.admin._id,
			owners: [],
			clientName: 'Client',
			attorney: 'Attorney',
			category: 'not.a-category',
			studentNumber: 1,
			createdOn: daysAgo(9),
		});
		await makeTransaction(fixture, { _id: badId }, { createdAt: daysAgo(9) });

		expect(await run()).toEqual({ archived: 1, skipped: 0, failed: 1 });
		expect(silentLogger.error).toHaveBeenCalledTimes(1);

		expect(await Case.exists({ _id: good._id })).toBeNull();
		expect(await Case.exists({ _id: badId })).toBeTruthy();
		expect((await Transaction.findOne({ case: badId })).status).toBe('active');
	});

	it('skips a case whose transaction is open but whose case is gone', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		await makeTransaction(fixture, live, { createdAt: daysAgo(8) });
		await Case.deleteOne({ _id: live._id });

		expect(await run()).toEqual({ archived: 0, skipped: 1, failed: 0 });
	});
});

describe('archiveService.autoArchiveCase', () => {
	it('returns null when a manual archive got there first', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture, { answers: answerAll() });
		await makeTransaction(fixture, live, { createdAt: daysAgo(8) });

		await archiveCase(live._id.toString(), fixture.authFor(fixture.admin));

		expect(await autoArchiveCase(live._id)).toBeNull();
		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.termination.conclusion.manuallyClosed).toBe(true);
	});
});
