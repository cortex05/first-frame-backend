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

const detailsUrl = (caseId, number) => `/api/cases/${caseId}/students/${number}/details`;

beforeAll(async () => {
	await initModels();
	await resetDb();
});

describe('student details end to end', () => {
	it('save → list → whole-case save → archive, and the archive has no details', async () => {
		const admin = await register('a');
		const member = await addMember(admin.token, 'a');
		const outsider = await register('b');

		const created = await request(app)
			.post('/api/cases')
			.set(bearer(admin.token))
			.send({
				clientName: 'Jane Client',
				attorney: 'Alex Attorney',
				category: 'criminal.theft',
				studentNumber: 3,
				owners: [member.id],
			});
		expect(created.status).toBe(201);
		expect(created.body.data.studentDetails).toEqual({});
		const caseId = created.body.data._id;

		// 1. Guards: token, id, scope, range and field validation.
		expect((await request(app).put(detailsUrl(caseId, 1)).send({ age: 30 })).status).toBe(401);
		expect((await request(app).put(detailsUrl('nope', 1)).set(bearer(member.token)).send({ age: 30 })).status).toBe(400);
		expect((await request(app).put(detailsUrl(caseId, 1)).set(bearer(outsider.token)).send({ age: 30 })).status).toBe(404);
		expect((await request(app).put(detailsUrl(caseId, 4)).set(bearer(member.token)).send({ age: 30 })).status).toBe(400);
		const invalid = await request(app).put(detailsUrl(caseId, 1)).set(bearer(member.token)).send({ age: 17 });
		expect(invalid.status).toBe(400);
		expect(invalid.body.message).toMatch(/age/);

		// 2. The owner saves details for student 3.
		const saved = await request(app)
			.put(detailsUrl(caseId, 3))
			.set(bearer(member.token))
			.send({ age: 34, occupation: '  Teacher ', gender: null, race: '' });
		expect(saved.status).toBe(200);
		expect(saved.body).toEqual({
			success: true,
			message: 'Student details updated successfully',
			data: { caseId, studentNumber: 3, studentDetails: { 3: { age: 34, occupation: 'Teacher' } } },
		});

		// 3. Listing returns the map as a plain object.
		const listed = await request(app).get('/api/cases').set(bearer(admin.token));
		expect(listed.status).toBe(200);
		expect(listed.body.data[0].studentDetails).toEqual({ 3: { age: 34, occupation: 'Teacher' } });

		// 4. A whole-case save can't overwrite details, but completes the case.
		const updated = await request(app)
			.put(`/api/cases/${caseId}`)
			.set(bearer(member.token))
			.send({
				questions: [{ id: 'q-1', text: 'Intent?', type: 'TRUE_FALSE' }],
				answers: { 'q-1': { 3: { label: 'true', value: 3 } } },
				studentDetails: {},
			});
		expect(updated.status).toBe(200);
		expect(updated.body.data.studentDetails).toEqual({ 3: { age: 34, occupation: 'Teacher' } });

		// 5. Archive: scoring data survives, details do not.
		const archived = await request(app).post(`/api/cases/${caseId}/archive`).set(bearer(member.token));
		expect(archived.status).toBe(201);
		expect(archived.body.data).not.toHaveProperty('studentDetails');
		expect(archived.body.data.answers).toEqual({ 'q-1': { 3: { label: 'true', value: 3 } } });

		const fetched = await request(app)
			.get(`/api/archived-cases/${archived.body.data._id}`)
			.set(bearer(member.token));
		expect(fetched.status).toBe(200);
		expect(fetched.body.data).not.toHaveProperty('studentDetails');

		// 6. The live case, and its details, are gone.
		expect((await request(app).put(detailsUrl(caseId, 3)).set(bearer(member.token)).send({ age: 30 })).status).toBe(404);
	});
});
