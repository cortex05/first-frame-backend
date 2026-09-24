import { beforeAll, describe, expect, it } from 'vitest';

import Recommended from '../../src/models/Recommended.js';
import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import User from '../../src/models/User.js';
import { resetForAccounts } from '../../scripts/resetForAccounts.js';
import { initModels, makeAccount, makeCase } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

describe('resetForAccounts', () => {
	it('refuses to run without confirmation', async () => {
		await expect(resetForAccounts()).rejects.toThrow(/confirmation/);
	});

	it('empties users, cases and playlists and leaves recommended sets alone', async () => {
		const fixture = await makeAccount();
		await makeCase(fixture);
		await Playlist.create({ account: fixture.account._id, createdBy: fixture.admin._id, title: 'P' });
		await Recommended.create({ charge: 'Assault', createdBy: fixture.admin._id });

		const { dropped } = await resetForAccounts({ confirm: true });

		expect(dropped.sort()).toEqual(['cases', 'playlists', 'users']);
		expect(await User.countDocuments()).toBe(0);
		expect(await Case.countDocuments()).toBe(0);
		expect(await Playlist.countDocuments()).toBe(0);
		expect(await Recommended.countDocuments()).toBe(1);

		// Re-running is harmless: it drops the now-empty collections again.
		await expect(resetForAccounts({ confirm: true })).resolves.toBeTruthy();
		expect(await User.countDocuments()).toBe(0);
		expect(await Recommended.countDocuments()).toBe(1);
	});
});
