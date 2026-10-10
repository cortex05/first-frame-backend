import { beforeAll, describe, expect, it } from 'vitest';

import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import User from '../../src/models/User.js';
import { MODELS, planIndexSync, syncAllIndexes } from '../../scripts/syncIndexes.js';
import { initModels } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

const indexNames = async (Model) => (await Model.collection.indexes()).map((index) => index.name);

describe('syncIndexes', () => {
	it('covers every model the fixtures create', () => {
		expect(MODELS.map((Model) => Model.modelName).sort()).toEqual(
			['Account', 'Agreement', 'AgreementRecord', 'ArchivedCase', 'Case', 'Playlist', 'Recommended', 'Transaction', 'User'].sort()
		);
	});

	it('finds nothing to change on a database built from the schemas', async () => {
		expect(await planIndexSync()).toEqual([]);
	});

	it('plans, then drops, the single-field indexes the schemas no longer declare', async () => {
		// What an existing database still has from before the cleanup.
		await Case.collection.createIndex({ account: 1 });
		await Playlist.collection.createIndex({ account: 1 });
		await User.collection.createIndex({ account: 1 });

		const plan = await planIndexSync();
		expect(plan).toEqual(
			expect.arrayContaining([
				{ model: 'Case', toDrop: ['account_1'], toCreate: [] },
				{ model: 'Playlist', toDrop: ['account_1'], toCreate: [] },
				{ model: 'User', toDrop: ['account_1'], toCreate: [] },
			])
		);
		// Planning changes nothing.
		expect(await indexNames(Case)).toContain('account_1');

		await syncAllIndexes();

		for (const Model of [Case, Playlist, User]) {
			expect(await indexNames(Model)).not.toContain('account_1');
		}
		// The compound indexes that cover account-only queries are kept.
		expect(await indexNames(Case)).toEqual(
			expect.arrayContaining(['_id_', 'account_1_createdOn_-1', 'account_1_owners_1'])
		);
		expect(await planIndexSync()).toEqual([]);
	});

	it('rebuilds a declared index that is missing', async () => {
		await Case.collection.dropIndex('account_1_owners_1');

		expect(await planIndexSync([Case])).toEqual([
			{ model: 'Case', toDrop: [], toCreate: [{ account: 1, owners: 1 }] },
		]);

		await syncAllIndexes([Case]);
		expect(await indexNames(Case)).toContain('account_1_owners_1');
	});
});
