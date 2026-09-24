import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Account from '../../src/models/Account.js';
import User from '../../src/models/User.js';
import { changePassword, login, register } from '../../src/services/userService.js';
import { PASSWORD, initModels, makeAccount, resetDb } from '../helpers/fixtures.js';

const validRegistration = (overrides = {}) => ({
	accountName: 'Cortes Law',
	username: 'daniel',
	email: 'Daniel@Example.com',
	password: 'secret123',
	...overrides,
});

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('userService.register', () => {
	it('creates an account and its first user as the account admin, linked both ways', async () => {
		const session = await register(validRegistration());

		const user = await User.findById(session.userId).lean();
		const account = await Account.findById(session.accountId).lean();

		expect(user.email).toBe('daniel@example.com');
		expect(user.role).toBe('admin');
		expect(user.status).toBe('active');
		expect(user.mustChangePassword).toBe(false);
		expect(user.isAdmin).toBe(false);
		expect(user.account.toString()).toBe(account._id.toString());
		expect(account.name).toBe('Cortes Law');
		expect(account.createdBy.toString()).toBe(user._id.toString());
	});

	it('returns a signed session', async () => {
		const session = await register(validRegistration());

		expect(session).toMatchObject({
			username: 'daniel',
			isAdmin: false,
			accountName: 'Cortes Law',
			role: 'admin',
			mustChangePassword: false,
		});
		expect(jwt.verify(session.token, process.env.JWT_SECRET).id).toBe(session.userId.toString());
		expect(session.password).toBeUndefined();
	});

	it('ignores privileged fields, so nobody can self-promote or join another account', async () => {
		const other = await makeAccount();

		const session = await register({
			...validRegistration(),
			isAdmin: true,
			role: 'member',
			account: other.account._id,
		});

		const user = await User.findById(session.userId).lean();
		expect(user.isAdmin).toBe(false);
		expect(user.role).toBe('admin');
		expect(user.account.toString()).not.toBe(other.account._id.toString());
	});

	it('rejects a missing field', async () => {
		await expect(register(validRegistration({ accountName: '  ' }))).rejects.toMatchObject({
			message: 'Account name, username, email, and password are required',
			statusCode: 400,
		});
	});

	it('rejects a password shorter than 8 characters', async () => {
		await expect(register(validRegistration({ password: 'short' }))).rejects.toMatchObject({
			statusCode: 400,
		});
	});

	it('rejects a duplicate email regardless of casing, leaving no orphan account', async () => {
		await register(validRegistration());
		const accountsBefore = await Account.countDocuments();

		await expect(
			register(validRegistration({ username: 'other', email: 'DANIEL@example.com' }))
		).rejects.toMatchObject({ message: 'Email or username already in use', statusCode: 409 });

		expect(await Account.countDocuments()).toBe(accountsBefore);
	});

	it('rejects a duplicate username, leaving no orphan account', async () => {
		await register(validRegistration());

		await expect(
			register(validRegistration({ email: 'someone-else@example.com' }))
		).rejects.toMatchObject({ statusCode: 409 });

		expect(await Account.countDocuments()).toBe(1);
	});
});

describe('userService.login', () => {
	it('returns the account fields with the session', async () => {
		const fixture = await makeAccount({ name: 'Firm', members: 1 });

		const session = await login(fixture.member.email, PASSWORD);

		expect(session).toMatchObject({
			username: fixture.member.username,
			accountName: 'Firm',
			role: 'member',
			mustChangePassword: false,
		});
		expect(session.accountId.toString()).toBe(fixture.account._id.toString());
	});

	it('rejects a disabled user with the same message as a wrong password', async () => {
		const fixture = await makeAccount({ disabled: 1 });

		const disabled = login(fixture.disabledUsers[0].email, PASSWORD);
		const wrong = login(fixture.admin.email, 'wrong-password');

		await expect(disabled).rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 });
		await expect(wrong).rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 });
	});

	it('rejects an unknown email', async () => {
		await expect(login('nobody@example.com', PASSWORD)).rejects.toMatchObject({ statusCode: 401 });
	});
});

describe('userService.changePassword', () => {
	it('changes the password, clears mustChangePassword and returns a new session', async () => {
		const fixture = await makeAccount({ members: 1 });
		await User.updateOne({ _id: fixture.member._id }, { mustChangePassword: true });

		const session = await changePassword(fixture.authFor(fixture.member), {
			currentPassword: PASSWORD,
			newPassword: 'brand-new-password',
		});

		expect(session.mustChangePassword).toBe(false);
		expect((await User.findById(fixture.member._id)).mustChangePassword).toBe(false);
		await expect(login(fixture.member.email, 'brand-new-password')).resolves.toBeTruthy();
		await expect(login(fixture.member.email, PASSWORD)).rejects.toMatchObject({ statusCode: 401 });
	});

	it('rejects a wrong current password', async () => {
		const fixture = await makeAccount();

		await expect(
			changePassword(fixture.authFor(fixture.admin), {
				currentPassword: 'not-it',
				newPassword: 'brand-new-password',
			})
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it('rejects reusing the current password', async () => {
		const fixture = await makeAccount();

		await expect(
			changePassword(fixture.authFor(fixture.admin), {
				currentPassword: PASSWORD,
				newPassword: PASSWORD,
			})
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('rejects a new password that is too short', async () => {
		const fixture = await makeAccount();

		await expect(
			changePassword(fixture.authFor(fixture.admin), {
				currentPassword: PASSWORD,
				newPassword: 'short',
			})
		).rejects.toMatchObject({ statusCode: 400 });
	});
});
