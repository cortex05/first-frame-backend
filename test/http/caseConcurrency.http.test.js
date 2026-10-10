import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import { buildSessionPayload } from '../../src/services/userService.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

const tokenFor = (user, account) => buildSessionPayload(user, account).token;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const YES = { label: true, value: 2 };
const NO = { label: false, value: 0 };

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

// An admin and an owner running the same case at the same time.
const setup = async () => {
	const fixture = await makeAccount({ members: 1 });
	const live = await makeCase(fixture, { owners: [fixture.member._id] });
	return {
		id: live._id.toString(),
		admin: bearer(tokenFor(fixture.admin, fixture.account)),
		owner: bearer(tokenFor(fixture.member, fixture.account)),
	};
};

describe('running one case from two browsers', () => {
	it('keeps both people’s answers', async () => {
		const { id, admin, owner } = await setup();

		const [first, second] = await Promise.all([
			request(app).put(`/api/cases/${id}/questions/q-1/answers`).set(admin).send({ answers: { 1: YES } }),
			request(app).put(`/api/cases/${id}/questions/q-2/answers`).set(owner).send({ answers: { 2: NO } }),
		]);
		expect([first.status, second.status]).toEqual([200, 200]);

		const list = await request(app).get('/api/cases').set(admin);
		expect(list.body.data[0].answers).toEqual({ 'q-1': { 1: YES }, 'q-2': { 2: NO } });
		expect(list.body.data[0].revision).toBe(2);
		// case.answers is the only answer store (spec 010).
		for (const question of list.body.data[0].questions) {
			expect(question).not.toHaveProperty('answers');
			expect(question).not.toHaveProperty('firstPoll');
		}
	});

	it('saves seating without touching answers', async () => {
		const { id, admin, owner } = await setup();
		await request(app).put(`/api/cases/${id}/questions/q-1/answers`).set(owner).send({ answers: { 1: YES } });

		const res = await request(app)
			.put(`/api/cases/${id}/seating`)
			.set(admin)
			.send({ chartData: { rects: [] }, students: [{ number: 1 }] });

		expect(res.status).toBe(200);
		expect(res.body.data).toMatchObject({
			seated: true,
			chartData: { rects: [] },
			answers: { 'q-1': { 1: YES } },
		});
	});

	it('refuses a stale whole-case save with 409 CASE_CONFLICT', async () => {
		const { id, admin, owner } = await setup();
		const [loaded] = (await request(app).get('/api/cases').set(admin)).body.data;

		await request(app).put(`/api/cases/${id}/questions/q-1/answers`).set(owner).send({ answers: { 1: YES } });

		const stale = await request(app)
			.put(`/api/cases/${id}`)
			.set(admin)
			.send({ ...loaded, clientName: 'Renamed' });

		expect(stale.status).toBe(409);
		expect(stale.body.code).toBe('CASE_CONFLICT');

		const [reloaded] = (await request(app).get('/api/cases').set(admin)).body.data;
		const fresh = await request(app)
			.put(`/api/cases/${id}`)
			.set(admin)
			.send({ ...reloaded, clientName: 'Renamed' });

		expect(fresh.status).toBe(200);
		expect(fresh.body.data.clientName).toBe('Renamed');
		expect(fresh.body.data.answers).toEqual({ 'q-1': { 1: YES } });
	});

	it('404s the new endpoints for someone who cannot see the case', async () => {
		const fixture = await makeAccount({ members: 1 });
		const live = await makeCase(fixture);
		const outsider = bearer(tokenFor(fixture.member, fixture.account));

		const responses = await Promise.all([
			request(app).put(`/api/cases/${live._id}/questions/q-1/answers`).set(outsider).send({ answers: {} }),
			request(app).put(`/api/cases/${live._id}/seating`).set(outsider).send({ chartData: {}, students: [] }),
		]);

		expect(responses.map((res) => res.status)).toEqual([404, 404]);
	});
});
