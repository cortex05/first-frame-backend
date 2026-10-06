import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Account from '../../src/models/Account.js';
import AgreementRecord from '../../src/models/AgreementRecord.js';
import User from '../../src/models/User.js';
import { changePassword, login, register } from '../../src/services/userService.js';
import {
	PASSWORD,
	TERMS_VERSION,
	initModels,
	makeAccount,
	resetDb,
	seedAgreement,
} from '../helpers/fixtures.js';

const validRegistration = (overrides = {}) => ({
	accountName: 'Cortes Law',
	username: 'daniel',
	email: 'Daniel@Example.com',
	password: 'secret123',
	termsVersion: TERMS_VERSION,
	...overrides,
});

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('userService.register', () => {
	beforeEach(async () => {
		await seedAgreement();
	});

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
			mustAcceptTerms: false,
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

	it('records the acceptance of the current terms with the account', async () => {
		const session = await register(validRegistration());

		const records = await AgreementRecord.find().lean();
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ termsVersion: TERMS_VERSION });
		expect(records[0].userId.toString()).toBe(session.userId.toString());
		expect(records[0].accountId.toString()).toBe(session.accountId.toString());
		expect(records[0].acceptedAt).toBeInstanceOf(Date);
		expect((await Account.findById(session.accountId)).acceptedTermsVersion).toBe(TERMS_VERSION);
	});

	it.each([
		['missing', undefined],
		['outdated', '12-31-2025'],
	])('rejects a %s terms version and creates nothing', async (_, termsVersion) => {
		await expect(register(validRegistration({ termsVersion }))).rejects.toMatchObject({
			statusCode: 409,
			code: 'TERMS_OUTDATED',
		});

		expect(await Account.countDocuments()).toBe(0);
		expect(await User.countDocuments()).toBe(0);
		expect(await AgreementRecord.countDocuments()).toBe(0);
	});

	it('fails closed when no terms are published', async () => {
		await resetDb();

		await expect(register(validRegistration())).rejects.toMatchObject({
			statusCode: 503,
			code: 'TERMS_UNAVAILABLE',
		});
		expect(await Account.countDocuments()).toBe(0);
	});

	it('leaves no acceptance behind when the user insert fails', async () => {
		await register(validRegistration());

		await expect(
			register(validRegistration({ username: 'other', email: 'daniel@example.com' }))
		).rejects.toMatchObject({ statusCode: 409 });

		expect(await AgreementRecord.countDocuments()).toBe(1);
	});
});

describe('session mustAcceptTerms', () => {
	it('is false when no terms are published', async () => {
		const fixture = await makeAccount();

		expect((await login(fixture.admin.email, PASSWORD)).mustAcceptTerms).toBe(false);
	});

	it('is true until the account has accepted the current version', async () => {
		const fixture = await makeAccount({ members: 1 });
		await seedAgreement();

		expect((await login(fixture.admin.email, PASSWORD)).mustAcceptTerms).toBe(true);
		expect((await login(fixture.member.email, PASSWORD)).mustAcceptTerms).toBe(true);

		await Account.updateOne({ _id: fixture.account._id }, { acceptedTermsVersion: TERMS_VERSION });

		expect((await login(fixture.member.email, PASSWORD)).mustAcceptTerms).toBe(false);
	});

	it('is returned by changePassword', async () => {
		const fixture = await makeAccount();
		await seedAgreement();

		const session = await changePassword(fixture.authFor(fixture.admin), {
			currentPassword: PASSWORD,
			newPassword: 'brand-new-password',
		});

		expect(session.mustAcceptTerms).toBe(true);
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

		// Awaited together: awaiting one first leaves the other's rejection unhandled.
		await Promise.all([
			expect(disabled).rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 }),
			expect(wrong).rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 }),
		]);
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
