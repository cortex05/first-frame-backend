import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import Recommended from '../../src/models/Recommended.js';
import {
	applyQuestionFieldMigration,
	planQuestionFieldMigration,
} from '../../scripts/migrateQuestionFields.js';
import { initModels, makeAccount, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

const UPDATED_AT = new Date('2026-10-01T12:00:00Z');
const OPTIONS = [{ label: 'true', value: 6 }];
const ANSWER = { label: 'true', value: 6 };

// A question as documents written before spec 010 hold it.
const oldQuestion = (id, labels = { 1: 'true' }) => ({
	id,
	text: `Question ${id}`,
	type: 'TRUE_FALSE',
	caseId: 'c',
	options: OPTIONS,
	answers: labels,
	firstPoll: true,
});
const slimQuestion = (id) => ({ id, text: `Question ${id}`, type: 'TRUE_FALSE', options: OPTIONS });

// Raw inserts, so the old fields are stored exactly as an old document has them.
const seed = async () => {
	const fixture = await makeAccount();
	const base = {
		account: fixture.account._id,
		createdBy: fixture.admin._id,
		owners: [],
		clientName: 'C',
		attorney: 'A',
		category: 'criminal.theft',
		studentNumber: 2,
		createdOn: new Date(),
	};

	const { insertedId: caseId } = await Case.collection.insertOne({
		...base,
		questions: [oldQuestion('q-1'), oldQuestion('q-2')],
		answers: { 'q-1': { 1: ANSWER }, 'q-2': { 1: ANSWER } },
		revision: 3,
		updatedAt: UPDATED_AT,
	});
	// The old copy for q-2 holds data that case.answers lacks.
	const { insertedId: divergingId } = await Case.collection.insertOne({
		...base,
		questions: [oldQuestion('q-1'), oldQuestion('q-2')],
		answers: { 'q-1': { 1: ANSWER } },
	});
	// Old fields, but an empty copy, so nothing diverges.
	const { insertedId: playlistId } = await Playlist.collection.insertOne({
		account: fixture.account._id,
		createdBy: fixture.admin._id,
		title: 'P',
		questions: [oldQuestion('q-1', {})],
		updatedAt: UPDATED_AT,
	});
	const { insertedId: recommendedId } = await Recommended.collection.insertOne({
		createdBy: fixture.admin._id,
		charge: 'Assault',
		questions: [oldQuestion('q-1', {})],
	});
	const { insertedId: archivedId } = await ArchivedCase.collection.insertOne({
		...base,
		questions: [oldQuestion('q-1')],
		answers: {},
		originalCaseId: caseId,
		archivedBy: fixture.admin._id,
		archiveReason: 'manual',
		archivedAt: new Date(),
	});

	return { caseId, divergingId, playlistId, recommendedId, archivedId };
};

describe('migrateQuestionFields', () => {
	it('counts the stale documents, lists diverging cases, and changes nothing', async () => {
		const { caseId, divergingId } = await seed();
		const before = await Case.collection.findOne({ _id: caseId });

		const plan = await planQuestionFieldMigration();

		expect(plan.counts).toEqual([
			{ collection: 'cases', documents: 2 },
			{ collection: 'playlists', documents: 1 },
			{ collection: 'recommended', documents: 1 },
		]);
		expect(plan.divergingCaseIds).toEqual([String(divergingId)]);
		expect(await Case.collection.findOne({ _id: caseId })).toEqual(before);
	});

	it('removes the fields from cases, playlists and recommended, and nothing else', async () => {
		const { caseId, playlistId, recommendedId, archivedId } = await seed();
		const caseBefore = await Case.collection.findOne({ _id: caseId });
		const archiveBefore = await ArchivedCase.collection.findOne({ _id: archivedId });

		const results = await applyQuestionFieldMigration();

		expect(results).toEqual([
			{ collection: 'cases', modified: 2 },
			{ collection: 'playlists', modified: 1 },
			{ collection: 'recommended', modified: 1 },
		]);

		const caseAfter = await Case.collection.findOne({ _id: caseId });
		expect(caseAfter.questions).toEqual([slimQuestion('q-1'), slimQuestion('q-2')]);
		expect(caseAfter.answers).toEqual(caseBefore.answers);
		expect(caseAfter.revision).toBe(3);
		expect(caseAfter.updatedAt).toEqual(UPDATED_AT);

		const playlist = await Playlist.collection.findOne({ _id: playlistId });
		expect(playlist.questions).toEqual([slimQuestion('q-1')]);
		expect(playlist.updatedAt).toEqual(UPDATED_AT);
		expect((await Recommended.collection.findOne({ _id: recommendedId })).questions).toEqual([
			slimQuestion('q-1'),
		]);

		// Archives stay exactly as written.
		expect(await ArchivedCase.collection.findOne({ _id: archivedId })).toEqual(archiveBefore);
	});

	it('finds nothing to do once applied', async () => {
		await seed();
		await applyQuestionFieldMigration();

		const plan = await planQuestionFieldMigration();

		expect(plan.counts.every(({ documents }) => documents === 0)).toBe(true);
		expect(plan.divergingCaseIds).toEqual([]);
		expect(await applyQuestionFieldMigration()).toEqual([
			{ collection: 'cases', modified: 0 },
			{ collection: 'playlists', modified: 0 },
			{ collection: 'recommended', modified: 0 },
		]);
	});
});
