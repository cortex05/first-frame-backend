import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import User from '../../src/models/User.js';
import { buildSessionPayload } from '../../src/services/userService.js';
import { initModels, makeAccount, resetDb } from '../helpers/fixtures.js';

const tokenFor = (user, account) => buildSessionPayload(user, account).token;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const NOT_ADMIN = 'Only an account admin can change a playlist.';

const QUESTIONS = [
	{
		id: 'q-1',
		text: 'Was there intent?',
		type: 'TRUE_FALSE',
		options: [
			{ label: true, value: 3 },
			{ label: false, value: 0 },
		],
	},
];

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('playlist writes are for account admins only (spec 022)', () => {
	it('refuses a member, even the creator, on PATCH and DELETE', async () => {
		const fixture = await makeAccount({ members: 1 });
		const memberToken = tokenFor(fixture.member, fixture.account);
		const created = await request(app)
			.post('/api/playlists')
			.set(bearer(memberToken))
			.send({ title: 'Mine' });
		const id = created.body.playlist._id;

		const patch = await request(app)
			.patch(`/api/playlists/${id}`)
			.set(bearer(memberToken))
			.send({ title: 'Renamed' });
		const del = await request(app).delete(`/api/playlists/${id}`).set(bearer(memberToken));

		expect(patch.status).toBe(403);
		expect(patch.body.message).toBe(NOT_ADMIN);
		expect(del.status).toBe(403);
		expect(del.body.message).toBe(NOT_ADMIN);

		const stillThere = await request(app).get(`/api/playlists/${id}`).set(bearer(memberToken));
		expect(stillThere.status).toBe(200);
		expect(stillThere.body.playlist.title).toBe('Mine');
	});

	it('lets an admin update and then delete a playlist', async () => {
		const fixture = await makeAccount({ members: 1 });
		const adminToken = tokenFor(fixture.admin, fixture.account);
		const created = await request(app)
			.post('/api/playlists')
			.set(bearer(tokenFor(fixture.member, fixture.account)))
			.send({ title: 'Theirs' });
		const id = created.body.playlist._id;

		const patch = await request(app)
			.patch(`/api/playlists/${id}`)
			.set(bearer(adminToken))
			.send({ title: 'Updated', questions: QUESTIONS });

		expect(patch.status).toBe(200);
		expect(patch.body.playlist.title).toBe('Updated');
		expect(patch.body.playlist.questions).toHaveLength(1);
		expect(patch.body.playlist.questions[0]).toMatchObject({ id: 'q-1', type: 'TRUE_FALSE' });

		const del = await request(app).delete(`/api/playlists/${id}`).set(bearer(adminToken));
		expect(del.status).toBe(200);
		expect(del.body).toEqual({ message: 'Playlist deleted.' });

		const gone = await request(app).get(`/api/playlists/${id}`).set(bearer(adminToken));
		expect(gone.status).toBe(404);
	});

	it('reads the role from the database, so a demoted admin is refused', async () => {
		const fixture = await makeAccount({ admins: 2 });
		const [first, second] = fixture.admins;
		const created = await request(app)
			.post('/api/playlists')
			.set(bearer(tokenFor(first, fixture.account)))
			.send({ title: 'Shared' });
		const secondToken = tokenFor(second, fixture.account);
		await User.updateOne({ _id: second._id }, { role: 'member' });

		const res = await request(app)
			.patch(`/api/playlists/${created.body.playlist._id}`)
			.set(bearer(secondToken))
			.send({ title: 'Nope' });

		expect(res.status).toBe(403);
		expect(res.body.message).toBe(NOT_ADMIN);
	});
});
