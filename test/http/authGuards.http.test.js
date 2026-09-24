import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import Account from '../../src/models/Account.js';
import User from '../../src/models/User.js';
import { buildSessionPayload } from '../../src/services/userService.js';
import { answerAll, initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

const tokenFor = (user, account) => buildSessionPayload(user, account).token;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('authenticate', () => {
	it('rejects a disabled user even with a valid token', async () => {
		const fixture = await makeAccount({ members: 1 });
		const token = tokenFor(fixture.member, fixture.account);
		await User.updateOne({ _id: fixture.member._id }, { status: 'disabled' });

		const res = await request(app).get('/api/cases').set(bearer(token));

		expect(res.status).toBe(401);
	});

	it('rejects every user of a suspended account', async () => {
		const fixture = await makeAccount();
		const token = tokenFor(fixture.admin, fixture.account);
		await Account.updateOne({ _id: fixture.account._id }, { status: 'suspended' });

		const res = await request(app).get('/api/account').set(bearer(token));

		expect(res.status).toBe(403);
		expect(res.body.message).toBe('Account is suspended');
	});

	it('treats a token for a deleted user as invalid', async () => {
		const fixture = await makeAccount();
		const token = tokenFor(fixture.admin, fixture.account);
		await User.deleteOne({ _id: fixture.admin._id });

		const res = await request(app).get('/api/cases').set(bearer(token));

		expect(res.status).toBe(401);
	});
});

describe('account-admin routes', () => {
	it('refuse a member', async () => {
		const fixture = await makeAccount({ members: 1 });
		const caseDoc = await makeCase(fixture, { owners: [fixture.member._id] });
		const token = tokenFor(fixture.member, fixture.account);

		const responses = await Promise.all([
			request(app).post('/api/cases').set(bearer(token)).send({}),
			request(app).put(`/api/cases/${caseDoc._id}/owners`).set(bearer(token)).send({ owners: [] }),
			request(app).post('/api/account/users').set(bearer(token)).send({}),
			request(app).patch('/api/account').set(bearer(token)).send({ name: 'x' }),
			request(app).patch(`/api/account/users/${fixture.admin._id}`).set(bearer(token)).send({ role: 'member' }),
		]);

		expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
	});

	it('let a member read the account and its users', async () => {
		const fixture = await makeAccount({ members: 1 });
		const token = tokenFor(fixture.member, fixture.account);

		const account = await request(app).get('/api/account').set(bearer(token));
		const users = await request(app).get('/api/account/users').set(bearer(token));

		expect(account.status).toBe(200);
		expect(users.status).toBe(200);
		expect(users.body.users).toHaveLength(2);
		expect(users.body.users[0].password).toBeUndefined();
	});
});

describe('cross-account isolation', () => {
	it('returns 404 for another account case, archive and playlist, even to its admin', async () => {
		const mine = await makeAccount();
		const theirs = await makeAccount();
		const theirToken = tokenFor(theirs.admin, theirs.account);
		const myToken = tokenFor(mine.admin, mine.account);

		const liveCase = await makeCase(mine);
		const toArchive = await makeCase(mine, { answers: answerAll() });
		const archived = await request(app).post(`/api/cases/${toArchive._id}/archive`).set(bearer(myToken));
		const playlist = await request(app).post('/api/playlists').set(bearer(myToken)).send({ title: 'Mine' });

		const responses = await Promise.all([
			request(app).put(`/api/cases/${liveCase._id}`).set(bearer(theirToken)).send({ clientName: 'x' }),
			request(app).post(`/api/cases/${liveCase._id}/archive`).set(bearer(theirToken)),
			request(app).put(`/api/cases/${liveCase._id}/owners`).set(bearer(theirToken)).send({ owners: [] }),
			request(app).get(`/api/archived-cases/${archived.body.data._id}`).set(bearer(theirToken)),
			request(app).get(`/api/playlists/${playlist.body.playlist._id}`).set(bearer(theirToken)),
			request(app).delete(`/api/playlists/${playlist.body.playlist._id}`).set(bearer(theirToken)),
		]);

		expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
	});
});

describe('platform admin vs account admin', () => {
	it('keeps Recommended writes for platform admins only', async () => {
		const fixture = await makeAccount({ members: 1 });
		await User.updateOne({ _id: fixture.member._id }, { isAdmin: true });
		const accountAdminToken = tokenFor(fixture.admin, fixture.account);
		const platformAdminToken = tokenFor(fixture.member, fixture.account);

		const asAccountAdmin = await request(app)
			.post('/api/recommended')
			.set(bearer(accountAdminToken))
			.send({ charge: 'Assault' });
		const asPlatformAdmin = await request(app)
			.post('/api/recommended')
			.set(bearer(platformAdminToken))
			.send({ charge: 'Assault' });

		expect(asAccountAdmin.status).toBe(403);
		expect(asPlatformAdmin.status).toBe(201);
	});

	it('does not let a platform admin manage account users', async () => {
		const fixture = await makeAccount({ members: 1 });
		await User.updateOne({ _id: fixture.member._id }, { isAdmin: true });

		const res = await request(app)
			.post('/api/account/users')
			.set(bearer(tokenFor(fixture.member, fixture.account)))
			.send({ username: 'x', email: 'x@example.com', password: 'temporary1' });

		expect(res.status).toBe(403);
	});
});

describe('error body', () => {
	it('includes a code only when the API set one, never a driver code', async () => {
		const fixture = await makeAccount();
		const token = tokenFor(fixture.admin, fixture.account);
		await request(app).post('/api/playlists').set(bearer(token)).send({ title: 'Dup' });

		const duplicate = await request(app).post('/api/playlists').set(bearer(token)).send({ title: 'Dup' });
		const noToken = await request(app).get('/api/cases');

		expect(duplicate.status).toBe(409);
		expect(duplicate.body.code).toBeUndefined();
		expect(noToken.status).toBe(401);
		expect(noToken.body.code).toBeUndefined();
	});
});
