import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Case from '../../src/models/Case.js';
import Transaction from '../../src/models/Transaction.js';
import {
	LIST_LIMIT_DEFAULT,
	LIST_LIMIT_MAX,
	listTransactions,
	markSessionStarted,
} from '../../src/services/transactionService.js';
import { initModels, makeAccount, makeCase, makeTransaction, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('transactionService.markSessionStarted', () => {
	it('moves an active transaction to in_progress and records who started it', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });
		await makeTransaction(fixture, live);
		const before = Date.now();

		const result = await markSessionStarted(live._id.toString(), fixture.authFor(fixture.member));

		expect(result).toEqual({ caseId: live._id.toString(), transactionStatus: 'in_progress' });
		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect(transaction.status).toBe('in_progress');
		expect(transaction.coreFeature.username).toBe(fixture.member.username);
		expect(transaction.coreFeature.userId.toString()).toBe(fixture.member._id.toString());
		expect(transaction.coreFeature.startedAt.getTime()).toBeGreaterThanOrEqual(before);
		expect(transaction.coreFeature.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
	});

	it('keeps the first start when the session is started again', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });
		await makeTransaction(fixture, live);

		await markSessionStarted(live._id.toString(), fixture.authFor(fixture.admin));
		const first = await Transaction.findOne({ case: live._id }).lean();

		const again = await markSessionStarted(live._id.toString(), fixture.authFor(fixture.member));

		expect(again.transactionStatus).toBe('in_progress');
		const after = await Transaction.findOne({ case: live._id }).lean();
		expect(after.coreFeature).toEqual(first.coreFeature);
		expect(after.coreFeature.username).toBe(fixture.admin.username);
	});

	it('lets exactly one of two racing starts write', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture, { owners: [fixture.member._id] });
		await makeTransaction(fixture, live);

		const results = await Promise.all([
			markSessionStarted(live._id.toString(), fixture.authFor(fixture.admin)),
			markSessionStarted(live._id.toString(), fixture.authFor(fixture.member)),
		]);

		expect(results.map((r) => r.transactionStatus)).toEqual(['in_progress', 'in_progress']);
		const transaction = await Transaction.findOne({ case: live._id }).lean();
		expect([fixture.admin.username, fixture.member.username]).toContain(
			transaction.coreFeature.username
		);
		const winner = [fixture.admin, fixture.member].find(
			(user) => user.username === transaction.coreFeature.username
		);
		expect(transaction.coreFeature.userId.toString()).toBe(winner._id.toString());
	});

	it('records nothing for a case created before transactions existed', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		const result = await markSessionStarted(live._id.toString(), fixture.authFor(fixture.admin));

		expect(result).toEqual({ caseId: live._id.toString(), transactionStatus: null });
		expect(await Transaction.countDocuments()).toBe(0);
	});

	it('returns 404 for a case the caller cannot see, and 400 for a bad id', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		const live = await makeCase(fixture);
		await makeTransaction(fixture, live);

		for (const auth of [fixture.authFor(fixture.member), other.authFor(other.admin)]) {
			await expect(markSessionStarted(live._id.toString(), auth)).rejects.toMatchObject({
				statusCode: 404,
			});
		}
		await expect(
			markSessionStarted(new mongoose.Types.ObjectId().toString(), fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(markSessionStarted('not-an-id', fixture.authFor(fixture.admin))).rejects.toMatchObject({
			statusCode: 400,
		});

		expect((await Transaction.findOne({ case: live._id }).lean()).status).toBe('active');
	});

	it('does not change the case', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);
		await makeTransaction(fixture, live);
		const before = await Case.findById(live._id).lean();

		await markSessionStarted(live._id.toString(), fixture.authFor(fixture.admin));

		expect(await Case.findById(live._id).lean()).toEqual(before);
	});
});

describe('transactionService.listTransactions', () => {
	// Distinct createdAt values so the sort is deterministic.
	const seed = async (fixture, statuses) => {
		const base = Date.parse('2026-09-01T00:00:00Z');
		for (const [i, status] of statuses.entries()) {
			const live = await makeCase(fixture, { clientName: `Client ${i}` });
			await makeTransaction(fixture, live, { status, createdAt: new Date(base + i * 60_000) });
		}
	};

	it('lists the account transactions newest first, and none from other accounts', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();
		await seed(fixture, ['active', 'in_progress', 'closed']);
		await seed(other, ['active']);

		const result = await listTransactions(fixture.authFor(fixture.admin));

		expect(result.map((t) => t.status)).toEqual(['closed', 'in_progress', 'active']);
		expect(result.every((t) => t.account.toString() === fixture.account._id.toString())).toBe(true);
	});

	it('filters by status', async () => {
		const fixture = await makeAccount();
		await seed(fixture, ['active', 'in_progress', 'active']);

		const result = await listTransactions(fixture.authFor(fixture.admin), { status: 'active' });

		expect(result).toHaveLength(2);
		expect(result.every((t) => t.status === 'active')).toBe(true);
	});

	it('applies the default limit and accepts a limit up to the maximum', async () => {
		const fixture = await makeAccount();
		await seed(fixture, Array(LIST_LIMIT_DEFAULT + 1).fill('active'));
		const auth = fixture.authFor(fixture.admin);

		expect(await listTransactions(auth)).toHaveLength(LIST_LIMIT_DEFAULT);
		expect(await listTransactions(auth, { limit: '2' })).toHaveLength(2);
		expect(await listTransactions(auth, { limit: String(LIST_LIMIT_MAX) })).toHaveLength(
			LIST_LIMIT_DEFAULT + 1
		);
	});

	it.each([
		[{ status: 'bogus' }],
		[{ status: ['active', 'closed'] }],
		[{ limit: '0' }],
		[{ limit: String(LIST_LIMIT_MAX + 1) }],
		[{ limit: '2.5' }],
		[{ limit: 'ten' }],
	])('rejects %j with 400', async (query) => {
		const fixture = await makeAccount();

		await expect(listTransactions(fixture.authFor(fixture.admin), query)).rejects.toMatchObject({
			statusCode: 400,
		});
	});

	it('refuses a member', async () => {
		const fixture = await makeAccount({ members: 1 });

		await expect(listTransactions(fixture.authFor(fixture.member))).rejects.toMatchObject({
			statusCode: 403,
		});
	});
});
