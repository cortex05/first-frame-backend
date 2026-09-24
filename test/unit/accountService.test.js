import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import User from '../../src/models/User.js';
import {
	createAccountUser,
	getAccount,
	listAccountUsers,
	renameAccount,
	updateAccountUser,
} from '../../src/services/accountService.js';
import { initModels, makeAccount, resetDb } from '../helpers/fixtures.js';

const newUser = (overrides = {}) => ({
	username: 'new-user',
	email: 'New-User@Example.com',
	password: 'temporary1',
	...overrides,
});

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('accountService.getAccount / renameAccount', () => {
	it('returns the caller account', async () => {
		const fixture = await makeAccount({ name: 'Firm' });

		const account = await getAccount(fixture.authFor(fixture.admin));

		expect(account.name).toBe('Firm');
	});

	it('lets an admin rename the account', async () => {
		const fixture = await makeAccount();

		const account = await renameAccount(fixture.authFor(fixture.admin), '  Renamed  ');

		expect(account.name).toBe('Renamed');
	});

	it('refuses a rename by a member or to an empty name', async () => {
		const fixture = await makeAccount({ members: 1 });

		await expect(renameAccount(fixture.authFor(fixture.member), 'Nope')).rejects.toMatchObject({
			statusCode: 403,
		});
		await expect(renameAccount(fixture.authFor(fixture.admin), '   ')).rejects.toMatchObject({
			statusCode: 400,
		});
	});
});

describe('accountService.createAccountUser', () => {
	it('creates a member who must change their password', async () => {
		const fixture = await makeAccount();

		const user = await createAccountUser(fixture.authFor(fixture.admin), newUser());

		expect(user.role).toBe('member');
		expect(user.email).toBe('new-user@example.com');
		expect(user.mustChangePassword).toBe(true);
		expect(user.password).toBeUndefined();

		const inDb = await User.findById(user._id).lean();
		expect(inDb.account.toString()).toBe(fixture.account._id.toString());
		expect(inDb.isAdmin).toBe(false);
	});

	it('creates an admin when asked', async () => {
		const fixture = await makeAccount();

		const user = await createAccountUser(fixture.authFor(fixture.admin), newUser({ role: 'admin' }));

		expect(user.role).toBe('admin');
	});

	it('refuses a member', async () => {
		const fixture = await makeAccount({ members: 1 });

		await expect(createAccountUser(fixture.authFor(fixture.member), newUser())).rejects.toMatchObject({
			statusCode: 403,
		});
	});

	it('rejects an email or username already used in any account', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();

		await expect(
			createAccountUser(fixture.authFor(fixture.admin), newUser({ email: other.admin.email }))
		).rejects.toMatchObject({ statusCode: 409 });
		await expect(
			createAccountUser(fixture.authFor(fixture.admin), newUser({ username: other.admin.username }))
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('rejects an unknown role and a short password', async () => {
		const fixture = await makeAccount();
		const auth = fixture.authFor(fixture.admin);

		await expect(createAccountUser(auth, newUser({ role: 'owner' }))).rejects.toMatchObject({
			statusCode: 400,
		});
		await expect(createAccountUser(auth, newUser({ password: 'short' }))).rejects.toMatchObject({
			statusCode: 400,
		});
	});
});

describe('accountService.updateAccountUser', () => {
	it('promotes a member and disables another', async () => {
		const fixture = await makeAccount({ members: 2 });
		const auth = fixture.authFor(fixture.admin);

		const promoted = await updateAccountUser(auth, fixture.members[0]._id.toString(), { role: 'admin' });
		const disabled = await updateAccountUser(auth, fixture.members[1]._id.toString(), { status: 'disabled' });

		expect(promoted.role).toBe('admin');
		expect(disabled.status).toBe('disabled');
	});

	it('returns 404 for a user in another account', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount({ members: 1 });

		await expect(
			updateAccountUser(fixture.authFor(fixture.admin), other.member._id.toString(), { status: 'disabled' })
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('refuses a member', async () => {
		const fixture = await makeAccount({ members: 2 });

		await expect(
			updateAccountUser(fixture.authFor(fixture.members[0]), fixture.members[1]._id.toString(), {
				role: 'admin',
			})
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it('requires a change and validates the values', async () => {
		const fixture = await makeAccount({ members: 1 });
		const auth = fixture.authFor(fixture.admin);
		const id = fixture.member._id.toString();

		await expect(updateAccountUser(auth, id, {})).rejects.toMatchObject({ statusCode: 400 });
		await expect(updateAccountUser(auth, id, { role: 'owner' })).rejects.toMatchObject({ statusCode: 400 });
		await expect(updateAccountUser(auth, id, { status: 'gone' })).rejects.toMatchObject({ statusCode: 400 });
	});

	describe('last-admin guard', () => {
		it('refuses to demote the only admin, even themselves', async () => {
			const fixture = await makeAccount({ members: 1 });

			await expect(
				updateAccountUser(fixture.authFor(fixture.admin), fixture.admin._id.toString(), { role: 'member' })
			).rejects.toMatchObject({
				message: 'An account must keep at least one active administrator',
				statusCode: 409,
			});
			expect((await User.findById(fixture.admin._id)).role).toBe('admin');
		});

		it('refuses to disable the only admin', async () => {
			const fixture = await makeAccount();

			await expect(
				updateAccountUser(fixture.authFor(fixture.admin), fixture.admin._id.toString(), {
					status: 'disabled',
				})
			).rejects.toMatchObject({ statusCode: 409 });
		});

		it('does not count a disabled admin as a remaining admin', async () => {
			const fixture = await makeAccount({ admins: 2 });
			await User.updateOne({ _id: fixture.admins[1]._id }, { status: 'disabled' });

			await expect(
				updateAccountUser(fixture.authFor(fixture.admin), fixture.admin._id.toString(), { role: 'member' })
			).rejects.toMatchObject({ statusCode: 409 });
		});

		it('allows demoting an admin while another active admin remains', async () => {
			const fixture = await makeAccount({ admins: 2 });

			const demoted = await updateAccountUser(
				fixture.authFor(fixture.admin),
				fixture.admin._id.toString(),
				{ role: 'member' }
			);

			expect(demoted.role).toBe('member');
		});

		it('keeps one admin when two admins demote each other at the same time', async () => {
			const fixture = await makeAccount({ admins: 2 });
			const [first, second] = fixture.admins;

			const results = await Promise.allSettled([
				updateAccountUser(fixture.authFor(first), second._id.toString(), { role: 'member' }),
				updateAccountUser(fixture.authFor(second), first._id.toString(), { role: 'member' }),
			]);

			const remainingAdmins = await User.countDocuments({
				account: fixture.account._id,
				role: 'admin',
				status: 'active',
			});
			expect(remainingAdmins).toBe(1);
			expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		});
	});
});

describe('accountService.listAccountUsers', () => {
	it('lists only the caller account users, without passwords', async () => {
		const fixture = await makeAccount({ members: 2 });
		await makeAccount({ members: 3 });

		const users = await listAccountUsers(fixture.authFor(fixture.members[0]));

		expect(users).toHaveLength(3);
		expect(users.every((u) => u.password === undefined)).toBe(true);
	});
});
