import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Case from '../../src/models/Case.js';
import { createCase, listCases, setCaseOwners, updateCase } from '../../src/services/caseService.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

const validPayload = (overrides = {}) => ({
	clientName: '  Jane Client  ',
	attorney: '  Alex Attorney  ',
	category: 'criminal.theft',
	studentNumber: 2,
	questions: [{ id: 'q-1', text: 'Was there intent?', type: 'TRUE_FALSE' }],
	...overrides,
});

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('caseService.createCase', () => {
	it('lets an admin create a case in their account with owners', async () => {
		const fixture = await makeAccount({ members: 2 });
		const ownerIds = fixture.members.map((m) => m._id.toString());

		const created = await createCase(validPayload({ owners: ownerIds }), fixture.authFor(fixture.admin));

		expect(created.account.toString()).toBe(fixture.account._id.toString());
		expect(created.createdBy.toString()).toBe(fixture.admin._id.toString());
		expect(created.owners.map(String)).toEqual(ownerIds);
		expect(created.clientName).toBe('Jane Client');
		expect(created.attorney).toBe('Alex Attorney');
		expect(created.category).toBe('criminal.theft');
		expect(created.questions).toHaveLength(1);

		const inDb = await Case.findById(created._id).lean();
		expect(inDb.account.toString()).toBe(fixture.account._id.toString());
	});

	it('defaults owners to an empty list', async () => {
		const fixture = await makeAccount();

		const created = await createCase(validPayload(), fixture.authFor(fixture.admin));

		expect(created.owners).toEqual([]);
	});

	it('refuses a member', async () => {
		const fixture = await makeAccount({ members: 1 });

		await expect(createCase(validPayload(), fixture.authFor(fixture.member))).rejects.toMatchObject({
			statusCode: 403,
		});
	});

	it('rejects owners from another account, disabled owners and invalid ids', async () => {
		const fixture = await makeAccount({ disabled: 1 });
		const other = await makeAccount({ members: 1 });
		const auth = fixture.authFor(fixture.admin);

		for (const owners of [
			[other.member._id.toString()],
			[fixture.disabledUsers[0]._id.toString()],
			['not-an-id'],
			'not-an-array',
		]) {
			await expect(createCase(validPayload({ owners }), auth)).rejects.toMatchObject({ statusCode: 400 });
		}
		expect(await Case.countDocuments()).toBe(0);
	});

	it('collapses duplicate owner ids', async () => {
		const fixture = await makeAccount({ members: 1 });
		const id = fixture.member._id.toString();

		const created = await createCase(validPayload({ owners: [id, id] }), fixture.authFor(fixture.admin));

		expect(created.owners.map(String)).toEqual([id]);
	});

	it('rejects a category id that is not in the catalog', async () => {
		const fixture = await makeAccount();

		await expect(
			// 'Divorce' is a Family matter, not a Criminal one.
			createCase(validPayload({ category: 'criminal.divorce' }), fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ message: 'Invalid case category', statusCode: 400 });
	});

	it('rejects a missing category', async () => {
		const fixture = await makeAccount();

		await expect(
			createCase(validPayload({ category: undefined }), fixture.authFor(fixture.admin))
		).rejects.toMatchObject({
			message: 'clientName, attorney, and category are required',
			statusCode: 400,
		});
	});
});

describe('caseService.listCases', () => {
	it('gives an admin every case in the account, newest first, and nothing from other accounts', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		await makeCase(fixture, { clientName: 'Older', createdOn: new Date('2026-01-01') });
		await makeCase(fixture, { clientName: 'Newer', createdOn: new Date('2026-02-01') });
		await makeCase(other, { clientName: 'Other account' });

		const result = await listCases(fixture.authFor(fixture.admin));

		expect(result.map((c) => c.clientName)).toEqual(['Newer', 'Older']);
	});

	it('gives a member only the cases they own', async () => {
		const fixture = await makeAccount({ members: 2 });
		const [me, someoneElse] = fixture.members;
		await makeCase(fixture, { clientName: 'Mine', owners: [me._id] });
		await makeCase(fixture, { clientName: 'Shared', owners: [someoneElse._id, me._id] });
		await makeCase(fixture, { clientName: 'Not mine', owners: [someoneElse._id] });
		await makeCase(fixture, { clientName: 'Unassigned' });

		const result = await listCases(fixture.authFor(me));

		expect(result.map((c) => c.clientName).sort()).toEqual(['Mine', 'Shared']);
	});
});

describe('caseService.updateCase', () => {
	it('lets an owner update and persists the changes', async () => {
		const fixture = await makeAccount({ members: 1 });
		const created = await makeCase(fixture, { owners: [fixture.member._id] });

		const updated = await updateCase(
			created._id.toString(),
			{
				clientName: '  Updated Client  ',
				attorney: '  Updated Attorney  ',
				category: 'civil.personal-injury',
				studentNumber: 5,
				questions: [{ id: 'q-1', text: 'Updated question', type: 'TRUE_FALSE' }],
			},
			fixture.authFor(fixture.member)
		);

		expect(updated.clientName).toBe('Updated Client');
		expect(updated.attorney).toBe('Updated Attorney');
		expect(updated.category).toBe('civil.personal-injury');
		expect(updated.studentNumber).toBe(5);
		expect(updated.questions).toHaveLength(1);

		const persisted = await Case.findById(created._id).lean();
		expect(persisted.clientName).toBe('Updated Client');
	});

	it('lets an admin update a case they do not own', async () => {
		const fixture = await makeAccount();
		const created = await makeCase(fixture);

		const updated = await updateCase(
			created._id.toString(),
			{ category: 'family.divorce' },
			fixture.authFor(fixture.admin)
		);

		expect(updated.category).toBe('family.divorce');
	});

	it('returns 404 to a member who does not own the case', async () => {
		const fixture = await makeAccount({ members: 1 });
		const created = await makeCase(fixture);

		await expect(
			updateCase(created._id.toString(), { clientName: 'No Access' }, fixture.authFor(fixture.member))
		).rejects.toMatchObject({ message: 'Case not found', statusCode: 404 });
	});

	it('returns 404 to an admin of another account', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();
		const created = await makeCase(fixture);

		await expect(
			updateCase(created._id.toString(), { clientName: 'No Access' }, other.authFor(other.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('ignores account, createdBy and owners in the body', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		const created = await makeCase(fixture, { owners: [fixture.member._id] });

		await updateCase(
			created._id.toString(),
			{
				clientName: 'Renamed',
				account: other.account._id.toString(),
				createdBy: fixture.member._id.toString(),
				owners: [],
			},
			fixture.authFor(fixture.member)
		);

		const persisted = await Case.findById(created._id).lean();
		expect(persisted.clientName).toBe('Renamed');
		expect(persisted.account.toString()).toBe(fixture.account._id.toString());
		expect(persisted.createdBy.toString()).toBe(fixture.admin._id.toString());
		expect(persisted.owners.map(String)).toEqual([fixture.member._id.toString()]);
	});

	it('moves a case to a different area without a cross-field conflict', async () => {
		// Under the old caseType/charge pair this update failed: the charge
		// validator ran against the query rather than the document.
		const fixture = await makeAccount();
		const created = await makeCase(fixture, { category: 'criminal.theft' });

		const updated = await updateCase(
			created._id.toString(),
			{ category: 'family.divorce' },
			fixture.authFor(fixture.admin)
		);

		expect(updated.category).toBe('family.divorce');
	});

	it('rejects an invalid category on update', async () => {
		const fixture = await makeAccount();
		const created = await makeCase(fixture);

		await expect(
			updateCase(created._id.toString(), { category: 'not-a-real.category' }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ message: 'Invalid case category', statusCode: 400 });
	});

	it('rejects an invalid case id', async () => {
		const fixture = await makeAccount();

		await expect(
			updateCase('nope', { clientName: 'x' }, fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
	});
});

describe('caseService.setCaseOwners', () => {
	it('replaces the owner list', async () => {
		const fixture = await makeAccount({ members: 2 });
		const created = await makeCase(fixture, { owners: [fixture.members[0]._id] });

		const updated = await setCaseOwners(
			created._id.toString(),
			[fixture.members[1]._id.toString()],
			fixture.authFor(fixture.admin)
		);

		expect(updated.owners.map(String)).toEqual([fixture.members[1]._id.toString()]);
	});

	it('refuses an owner who is not an admin', async () => {
		const fixture = await makeAccount({ members: 1 });
		const created = await makeCase(fixture, { owners: [fixture.member._id] });

		await expect(
			setCaseOwners(created._id.toString(), [], fixture.authFor(fixture.member))
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it('validates owners and scopes to the account', async () => {
		const fixture = await makeAccount({ disabled: 1 });
		const other = await makeAccount();
		const created = await makeCase(fixture);

		await expect(
			setCaseOwners(created._id.toString(), [fixture.disabledUsers[0]._id.toString()], fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			setCaseOwners(created._id.toString(), [], other.authFor(other.admin))
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			setCaseOwners(new mongoose.Types.ObjectId().toString(), [], fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});
});
