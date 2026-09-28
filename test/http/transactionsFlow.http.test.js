import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import { initModels, resetDb } from '../helpers/fixtures.js';

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const register = async (suffix) => {
	const res = await request(app).post('/api/auth/register').send({
		accountName: `Firm ${suffix}`,
		username: `admin-${suffix}`,
		email: `admin-${suffix}@example.com`,
		password: 'admin-pass',
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

	return { id: created.body.user._id, token: changed.body.data.token };
};

beforeAll(async () => {
	await initModels();
	await resetDb();
});

describe('transactions end to end', () => {
	it('create → start (twice) → archive, then list as an admin', async () => {
		const admin = await register('a');
		const member = await addMember(admin.token, 'a');
		const outsider = await register('b');

		// 1. Creating a case opens its transaction; the response is still the case.
		const created = await request(app)
			.post('/api/cases')
			.set(bearer(admin.token))
			.send({
				clientName: 'Jane Client',
				attorney: 'Alex Attorney',
				category: 'criminal.theft',
				studentNumber: 2,
				owners: [member.id],
				timezone: 'America/Chicago',
			});
		expect(created.status).toBe(201);
		expect(created.body.data).toMatchObject({ clientName: 'Jane Client', questions: [] });
		const caseId = created.body.data._id;

		// 2. The owner starts the session; a second start changes nothing.
		const started = await request(app).post(`/api/cases/${caseId}/start`).set(bearer(member.token));
		expect(started.status).toBe(200);
		expect(started.body.data).toEqual({ caseId, transactionStatus: 'in_progress' });

		const restarted = await request(app).post(`/api/cases/${caseId}/start`).set(bearer(admin.token));
		expect(restarted.status).toBe(200);
		expect(restarted.body.data.transactionStatus).toBe('in_progress');

		// 3. Complete the case and archive it.
		const saved = await request(app)
			.put(`/api/cases/${caseId}`)
			.set(bearer(member.token))
			.send({
				questions: [{ id: 'q-1', text: 'Intent?', type: 'TRUE_FALSE' }],
				answers: { 'q-1': { 1: { label: 'true', value: 3 } } },
			});
		expect(saved.status).toBe(200);

		const archived = await request(app).post(`/api/cases/${caseId}/archive`).set(bearer(member.token));
		expect(archived.status).toBe(201);

		// 4. The admin sees the closed transaction with the whole lifecycle.
		const listed = await request(app).get('/api/transactions').set(bearer(admin.token));
		expect(listed.status).toBe(200);
		expect(listed.body.data).toHaveLength(1);
		const [transaction] = listed.body.data;
		expect(transaction).toMatchObject({
			case: caseId,
			archivedCase: archived.body.data._id,
			username: 'admin-a',
			status: 'closed',
			timezone: 'America/Chicago',
			stripe: { paymentIntentId: null, checkoutSessionId: null },
			coreFeature: { username: 'member-a', userId: member.id },
			termination: {
				archived: true,
				finishedAt: archived.body.data.archivedAt,
				conclusion: { manuallyClosed: true, actor: 'member-a', actorId: member.id },
			},
		});

		const active = await request(app).get('/api/transactions?status=active').set(bearer(admin.token));
		expect(active.status).toBe(200);
		expect(active.body.data).toEqual([]);

		expect((await request(app).get('/api/transactions?status=bogus').set(bearer(admin.token))).status).toBe(400);
		expect((await request(app).get('/api/transactions?limit=0').set(bearer(admin.token))).status).toBe(400);

		// 5. Members, anonymous callers and other accounts see nothing.
		expect((await request(app).get('/api/transactions').set(bearer(member.token))).status).toBe(403);
		expect((await request(app).get('/api/transactions')).status).toBe(401);
		const foreign = await request(app).get('/api/transactions').set(bearer(outsider.token));
		expect(foreign.status).toBe(200);
		expect(foreign.body.data).toEqual([]);

		// 6. Start needs a token, and the archived (deleted) case is gone.
		expect((await request(app).post(`/api/cases/${caseId}/start`)).status).toBe(401);
		expect(
			(await request(app).post(`/api/cases/${caseId}/start`).set(bearer(admin.token))).status
		).toBe(404);
	});

	it('stores UTC when the client sends no timezone', async () => {
		const admin = await register('c');

		const created = await request(app).post('/api/cases').set(bearer(admin.token)).send({
			clientName: 'Client',
			attorney: 'Attorney',
			category: 'criminal.theft',
			studentNumber: 1,
		});
		expect(created.status).toBe(201);

		const listed = await request(app).get('/api/transactions').set(bearer(admin.token));
		expect(listed.body.data).toHaveLength(1);
		expect(listed.body.data[0]).toMatchObject({ status: 'active', timezone: 'UTC' });
	});
});
