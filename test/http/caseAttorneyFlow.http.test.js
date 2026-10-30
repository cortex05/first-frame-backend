import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import { TERMS_VERSION, initModels, resetDb, seedAgreement } from '../helpers/fixtures.js';

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

// A member who has already replaced their temporary password.
const addMember = async (adminToken, suffix) => {
	const created = await request(app)
		.post('/api/account/users')
		.set(bearer(adminToken))
		.send({ username: `member-${suffix}`, email: `member-${suffix}@example.com`, password: 'temporary1' });
	expect(created.status).toBe(201);

	const login = await request(app)
		.post('/api/auth/login')
		.send({ email: `member-${suffix}@example.com`, password: 'temporary1' });
	const changed = await request(app)
		.post('/api/auth/change-password')
		.set(bearer(login.body.data.token))
		.send({ currentPassword: 'temporary1', newPassword: 'member-pass' });
	expect(changed.status).toBe(200);

	return { id: created.body.user._id, username: `member-${suffix}`, token: changed.body.data.token };
};

const casePayload = (overrides = {}) => ({
	clientName: 'Jane Client',
	category: 'criminal.theft',
	studentNumber: 2,
	owners: [],
	...overrides,
});

beforeAll(async () => {
	await initModels();
	await resetDb();
	await seedAgreement();
});

describe('case attorney (spec 021)', () => {
	it('gives a member chosen as attorney access, and keeps it when owners are replaced', async () => {
		const admin = await register('a');
		const member = await addMember(admin.token, 'a');

		const created = await request(app)
			.post('/api/cases')
			.set(bearer(admin.token))
			.send(casePayload({ attorneyId: member.id }));
		expect(created.status).toBe(201);
		expect(created.body.data).toMatchObject({
			attorneyId: member.id,
			attorney: member.username,
			owners: [member.id],
		});
		const caseId = created.body.data._id;

		const memberCases = await request(app).get('/api/cases').set(bearer(member.token));
		expect(memberCases.body.data.map((c) => c._id)).toEqual([caseId]);

		const owners = await request(app)
			.put(`/api/cases/${caseId}/owners`)
			.set(bearer(admin.token))
			.send({ owners: [] });
		expect(owners.status).toBe(200);
		expect(owners.body.data.owners).toEqual([member.id]);
	});

	it('rejects an attorney from another account', async () => {
		const admin = await register('b');
		const outsider = await register('c');

		const res = await request(app)
			.post('/api/cases')
			.set(bearer(admin.token))
			.send(casePayload({ attorneyId: outsider.userId }));
		expect(res.status).toBe(400);
		expect(res.body.message).toBe('attorneyId must be an active user of this account');
	});
});
