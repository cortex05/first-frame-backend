import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import { TERMS_VERSION, initModels, resetDb, seedAgreement } from '../helpers/fixtures.js';

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
	await initModels();
	await resetDb();
	await seedAgreement();
});

describe('accounts end to end', () => {
	it('register → add member → forced password change → assigned case → archive', async () => {
		// 1. Create an account; the registrant is its admin and is signed in.
		const registered = await request(app).post('/api/auth/register').send({
			accountName: 'Cortes Law',
			username: 'founder',
			email: 'founder@example.com',
			password: 'founder-pass',
			termsVersion: TERMS_VERSION,
		});
		expect(registered.status).toBe(201);
		expect(registered.body.data).toMatchObject({ role: 'admin', accountName: 'Cortes Law' });
		const adminToken = registered.body.data.token;

		// 2. The admin adds a member with a temporary password.
		const created = await request(app)
			.post('/api/account/users')
			.set(bearer(adminToken))
			.send({ username: 'associate', email: 'associate@example.com', password: 'temporary1' });
		expect(created.status).toBe(201);
		expect(created.body.user.mustChangePassword).toBe(true);
		const memberId = created.body.user._id;

		// 3. The member logs in but can do nothing until the password changes.
		const firstLogin = await request(app)
			.post('/api/auth/login')
			.send({ email: 'associate@example.com', password: 'temporary1' });
		expect(firstLogin.status).toBe(200);
		expect(firstLogin.body.data.mustChangePassword).toBe(true);

		const blocked = await request(app).get('/api/cases').set(bearer(firstLogin.body.data.token));
		expect(blocked.status).toBe(403);
		expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

		const changed = await request(app)
			.post('/api/auth/change-password')
			.set(bearer(firstLogin.body.data.token))
			.send({ currentPassword: 'temporary1', newPassword: 'associate-pass' });
		expect(changed.status).toBe(200);
		expect(changed.body.data.mustChangePassword).toBe(false);
		const memberToken = changed.body.data.token;

		// 4. The admin creates a case and hands it to the member.
		const createdCase = await request(app)
			.post('/api/cases')
			.set(bearer(adminToken))
			.send({
				clientName: 'Jane Client',
				attorney: 'Alex Attorney',
				category: 'criminal.theft',
				studentNumber: 2,
				owners: [memberId],
				questions: [
					{ id: 'q-1', text: 'Intent?', type: 'TRUE_FALSE' },
					{ id: 'q-2', text: 'Credible?', type: 'TRUE_FALSE' },
				],
			});
		expect(createdCase.status).toBe(201);
		const caseId = createdCase.body.data._id;

		// 5. The member sees it and runs it.
		const memberCases = await request(app).get('/api/cases').set(bearer(memberToken));
		expect(memberCases.body.data.map((c) => c._id)).toEqual([caseId]);

		const tooEarly = await request(app).post(`/api/cases/${caseId}/archive`).set(bearer(memberToken));
		expect(tooEarly.status).toBe(409);

		const answered = await request(app)
			.put(`/api/cases/${caseId}`)
			.set(bearer(memberToken))
			.send({
				// Seated the way StartScreen stores it: student numbers as ids, and
				// answers keyed by those numbers. The archive report reads both.
				chartData: {
					rects: [
						{
							id: 'rect-1',
							assignedStudents: [
								{ id: 1, xRel: 0, yRel: 0 },
								{ id: 2, xRel: 40, yRel: 0 },
							],
						},
					],
				},
				answers: {
					'q-1': { 1: { label: 'true', value: 5 } },
					'q-2': { 2: { label: 'false', value: 0 } },
				},
			});
		expect(answered.status).toBe(200);

		// 6. The member archives it; it leaves the live list and enters the archive.
		const archived = await request(app).post(`/api/cases/${caseId}/archive`).set(bearer(memberToken));
		expect(archived.status).toBe(201);
		const archivedId = archived.body.data._id;

		const afterArchive = await request(app).get('/api/cases').set(bearer(memberToken));
		expect(afterArchive.body.data).toEqual([]);

		for (const token of [memberToken, adminToken]) {
			const list = await request(app).get('/api/archived-cases').set(bearer(token));
			expect(list.status).toBe(200);
			expect(list.body.data.map((a) => a._id)).toEqual([archivedId]);
		}

		const detail = await request(app).get(`/api/archived-cases/${archivedId}`).set(bearer(memberToken));
		expect(detail.status).toBe(200);
		expect(detail.body.data.answers['q-2']).toEqual({ 2: { label: 'false', value: 0 } });
		// The archive report (spec 002) builds its student list from the seating
		// chart, so the snapshot must keep it intact.
		expect(detail.body.data.chartData.rects[0].assignedStudents.map((s) => s.id)).toEqual([1, 2]);
		expect(detail.body.data.answers['q-1']['1']).toEqual({ label: 'true', value: 5 });
	});
});

describe('admin handoff over HTTP', () => {
	it('refuses self-disable and handing off to an unfinished admin, then hands off', async () => {
		const registered = await request(app).post('/api/auth/register').send({
			accountName: 'Handoff Law',
			username: 'outgoing',
			email: 'outgoing@example.com',
			password: 'outgoing-pass',
			termsVersion: TERMS_VERSION,
		});
		expect(registered.status).toBe(201);
		const { token: adminToken, userId: adminId } = registered.body.data;

		const selfDisable = await request(app)
			.patch(`/api/account/users/${adminId}`)
			.set(bearer(adminToken))
			.send({ status: 'disabled' });
		expect(selfDisable.status).toBe(400);
		expect(selfDisable.body.code).toBe('CANNOT_DISABLE_SELF');

		// The new admin still has a temporary password, so they don't count yet.
		const created = await request(app)
			.post('/api/account/users')
			.set(bearer(adminToken))
			.send({ username: 'incoming', email: 'incoming@example.com', password: 'temporary1', role: 'admin' });
		expect(created.status).toBe(201);

		const tooEarly = await request(app)
			.patch(`/api/account/users/${adminId}`)
			.set(bearer(adminToken))
			.send({ role: 'member' });
		expect(tooEarly.status).toBe(409);
		expect(tooEarly.body.code).toBe('LAST_ACCOUNT_ADMIN');

		const firstLogin = await request(app)
			.post('/api/auth/login')
			.send({ email: 'incoming@example.com', password: 'temporary1' });
		const changed = await request(app)
			.post('/api/auth/change-password')
			.set(bearer(firstLogin.body.data.token))
			.send({ currentPassword: 'temporary1', newPassword: 'incoming-pass' });
		expect(changed.status).toBe(200);

		const handedOff = await request(app)
			.patch(`/api/account/users/${adminId}`)
			.set(bearer(adminToken))
			.send({ role: 'member' });
		expect(handedOff.status).toBe(200);
		expect(handedOff.body.user.role).toBe('member');
	});
});
