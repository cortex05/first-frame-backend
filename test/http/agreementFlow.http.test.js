import request from 'supertest';
import { beforeEach, beforeAll, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import Account from '../../src/models/Account.js';
import Agreement from '../../src/models/Agreement.js';
import { clearAgreementCache } from '../../src/services/agreementService.js';
import { TERMS_VERSION, initModels, resetDb, seedAgreement } from '../helpers/fixtures.js';

const NEW_VERSION = '02-01-2026';

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const register = async (suffix) => {
	const res = await request(app).post('/api/auth/register').send({
		accountName: `Firm ${suffix}`,
		username: `admin-${suffix}`,
		email: `admin-${suffix}@example.com`,
		password: 'admin-pass',
		termsVersion: TERMS_VERSION,
	});
	expect(res.status).toBe(201);
	return res.body.data;
};

const addMember = async (adminToken, suffix, { changePassword = true } = {}) => {
	const created = await request(app)
		.post('/api/account/users')
		.set(bearer(adminToken))
		.send({ username: `member-${suffix}`, email: `member-${suffix}@example.com`, password: 'temporary1' });
	expect(created.status).toBe(201);

	const login = await request(app)
		.post('/api/auth/login')
		.send({ email: `member-${suffix}@example.com`, password: 'temporary1' });
	if (!changePassword) {
		return { token: login.body.data.token };
	}

	const changed = await request(app)
		.post('/api/auth/change-password')
		.set(bearer(login.body.data.token))
		.send({ currentPassword: 'temporary1', newPassword: 'member-pass' });
	expect(changed.status).toBe(200);

	return { token: changed.body.data.token };
};

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('GET /api/agreements/current', () => {
	it('returns the current terms without a token', async () => {
		await seedAgreement({ agreementText: 'Be nice.' });

		const res = await request(app).get('/api/agreements/current');

		expect(res.status).toBe(200);
		expect(res.body.data).toEqual({
			termsVersion: TERMS_VERSION,
			agreementText: 'Be nice.',
			dateImplemented: '2026-01-01T00:00:00.000Z',
		});
	});

	it('returns 404 TERMS_UNAVAILABLE when nothing is published', async () => {
		const res = await request(app).get('/api/agreements/current');

		expect(res.status).toBe(404);
		expect(res.body.code).toBe('TERMS_UNAVAILABLE');
	});
});

describe('POST /api/auth/register', () => {
	it('returns 503 TERMS_UNAVAILABLE when nothing is published', async () => {
		const res = await request(app).post('/api/auth/register').send({
			accountName: 'Firm',
			username: 'admin',
			email: 'admin@example.com',
			password: 'admin-pass',
			termsVersion: TERMS_VERSION,
		});

		expect(res.status).toBe(503);
		expect(res.body.code).toBe('TERMS_UNAVAILABLE');
	});

	it('returns 409 TERMS_OUTDATED without a terms version', async () => {
		await seedAgreement();

		const res = await request(app).post('/api/auth/register').send({
			accountName: 'Firm',
			username: 'admin',
			email: 'admin@example.com',
			password: 'admin-pass',
		});

		expect(res.status).toBe(409);
		expect(res.body.code).toBe('TERMS_OUTDATED');
	});
});

describe('new terms going live', () => {
	it('blocks the whole account until an admin accepts, then unblocks it', async () => {
		await seedAgreement();
		const admin = await register('a');
		const member = await addMember(admin.token, 'a');
		expect(admin.mustAcceptTerms).toBe(false);

		expect((await request(app).get('/api/cases').set(bearer(admin.token))).status).toBe(200);

		await seedAgreement({ termsVersion: NEW_VERSION });

		for (const token of [admin.token, member.token]) {
			const blocked = await request(app).get('/api/cases').set(bearer(token));
			expect(blocked.status).toBe(403);
			expect(blocked.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
		}

		const login = await request(app)
			.post('/api/auth/login')
			.send({ email: 'admin-a@example.com', password: 'admin-pass' });
		expect(login.body.data.mustAcceptTerms).toBe(true);

		const byMember = await request(app)
			.post('/api/agreements/accept')
			.set(bearer(member.token))
			.send({ termsVersion: NEW_VERSION });
		expect(byMember.status).toBe(403);

		const stale = await request(app)
			.post('/api/agreements/accept')
			.set(bearer(admin.token))
			.send({ termsVersion: TERMS_VERSION });
		expect(stale.status).toBe(409);
		expect(stale.body.code).toBe('TERMS_OUTDATED');

		const accepted = await request(app)
			.post('/api/agreements/accept')
			.set(bearer(admin.token))
			.send({ termsVersion: NEW_VERSION });
		expect(accepted.status).toBe(200);
		expect(accepted.body.data.mustAcceptTerms).toBe(false);

		for (const token of [admin.token, member.token]) {
			expect((await request(app).get('/api/cases').set(bearer(token))).status).toBe(200);
		}
	});

	it('is per account: another account stays blocked', async () => {
		await seedAgreement();
		const first = await register('b');
		const second = await register('c');
		await seedAgreement({ termsVersion: NEW_VERSION });

		await request(app)
			.post('/api/agreements/accept')
			.set(bearer(first.token))
			.send({ termsVersion: NEW_VERSION })
			.expect(200);

		expect((await request(app).get('/api/cases').set(bearer(first.token))).status).toBe(200);
		expect((await request(app).get('/api/cases').set(bearer(second.token))).status).toBe(403);
	});

	it('puts a pending password change before the terms', async () => {
		await seedAgreement();
		const admin = await register('d');
		const pending = await addMember(admin.token, 'd', { changePassword: false });
		await seedAgreement({ termsVersion: NEW_VERSION });

		const cases = await request(app).get('/api/cases').set(bearer(pending.token));
		expect(cases.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

		const accept = await request(app)
			.post('/api/agreements/accept')
			.set(bearer(pending.token))
			.send({ termsVersion: NEW_VERSION });
		expect(accept.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

		const changed = await request(app)
			.post('/api/auth/change-password')
			.set(bearer(pending.token))
			.send({ currentPassword: 'temporary1', newPassword: 'member-pass' });
		expect(changed.status).toBe(200);
		expect(changed.body.data.mustAcceptTerms).toBe(true);
	});

	it('blocks nobody when no terms are published', async () => {
		await seedAgreement();
		const admin = await register('e');
		await Account.updateOne({ _id: admin.accountId }, { acceptedTermsVersion: null });
		await Agreement.deleteMany({});
		clearAgreementCache();

		expect((await request(app).get('/api/cases').set(bearer(admin.token))).status).toBe(200);
	});
});
