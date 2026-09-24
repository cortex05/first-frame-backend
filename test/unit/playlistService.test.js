import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Playlist from '../../src/models/Playlist.js';
import {
	createPlaylist,
	deletePlaylist,
	getPlaylist,
	listPlaylists,
	updatePlaylist,
} from '../../src/services/playlistService.js';
import { initModels, makeAccount, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('playlistService', () => {
	it('stores the account and creator', async () => {
		const fixture = await makeAccount({ members: 1 });

		const playlist = await createPlaylist(fixture.authFor(fixture.member), { title: '  Opening  ' });

		expect(playlist.title).toBe('Opening');
		expect(playlist.account.toString()).toBe(fixture.account._id.toString());
		expect(playlist.createdBy.toString()).toBe(fixture.member._id.toString());
	});

	it('shows everyone every playlist in their account, and none from others', async () => {
		const fixture = await makeAccount({ members: 2 });
		const other = await makeAccount();
		await createPlaylist(fixture.authFor(fixture.members[0]), { title: 'A' });
		await createPlaylist(fixture.authFor(fixture.admin), { title: 'B' });
		const foreign = await createPlaylist(other.authFor(other.admin), { title: 'C' });

		const result = await listPlaylists(fixture.authFor(fixture.members[1]));

		expect(result.map((p) => p.title).sort()).toEqual(['A', 'B']);
		await expect(
			getPlaylist(foreign._id.toString(), fixture.authFor(fixture.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('keeps titles unique per account, not globally', async () => {
		const fixture = await makeAccount({ members: 1 });
		const other = await makeAccount();
		await createPlaylist(fixture.authFor(fixture.admin), { title: 'Same' });

		await expect(
			createPlaylist(fixture.authFor(fixture.member), { title: 'Same' })
		).rejects.toMatchObject({ message: 'Playlist title already exists in this account.', statusCode: 409 });
		await expect(createPlaylist(other.authFor(other.admin), { title: 'Same' })).resolves.toBeTruthy();
	});

	it('lets the creator and an admin change a playlist, but not another member', async () => {
		const fixture = await makeAccount({ members: 2 });
		const [creator, bystander] = fixture.members;
		const playlist = await createPlaylist(fixture.authFor(creator), { title: 'Mine' });
		const id = playlist._id.toString();

		await expect(
			updatePlaylist(id, fixture.authFor(bystander), { title: 'Hijacked' })
		).rejects.toMatchObject({ statusCode: 403 });
		await expect(deletePlaylist(id, fixture.authFor(bystander))).rejects.toMatchObject({ statusCode: 403 });

		const renamed = await updatePlaylist(id, fixture.authFor(creator), { title: 'Renamed' });
		expect(renamed.title).toBe('Renamed');

		const adminRenamed = await updatePlaylist(id, fixture.authFor(fixture.admin), { questions: [] });
		expect(adminRenamed.title).toBe('Renamed');

		await deletePlaylist(id, fixture.authFor(fixture.admin));
		expect(await Playlist.findById(id)).toBeNull();
	});

	it('returns 404 to another account on update and delete', async () => {
		const fixture = await makeAccount();
		const other = await makeAccount();
		const playlist = await createPlaylist(fixture.authFor(fixture.admin), { title: 'Mine' });

		await expect(
			updatePlaylist(playlist._id.toString(), other.authFor(other.admin), { title: 'x' })
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			deletePlaylist(playlist._id.toString(), other.authFor(other.admin))
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('rejects a rename onto an existing title with 409', async () => {
		const fixture = await makeAccount();
		const auth = fixture.authFor(fixture.admin);
		await createPlaylist(auth, { title: 'Taken' });
		const playlist = await createPlaylist(auth, { title: 'Free' });

		await expect(
			updatePlaylist(playlist._id.toString(), auth, { title: 'Taken' })
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('validates the input', async () => {
		const fixture = await makeAccount();
		const auth = fixture.authFor(fixture.admin);
		const playlist = await createPlaylist(auth, { title: 'Ok' });

		await expect(createPlaylist(auth, { title: ' ' })).rejects.toMatchObject({ statusCode: 400 });
		await expect(createPlaylist(auth, { title: 'x', questions: 'nope' })).rejects.toMatchObject({
			statusCode: 400,
		});
		await expect(updatePlaylist(playlist._id.toString(), auth, {})).rejects.toMatchObject({
			statusCode: 400,
		});
		await expect(getPlaylist('nope', auth)).rejects.toMatchObject({ statusCode: 400 });
	});
});
