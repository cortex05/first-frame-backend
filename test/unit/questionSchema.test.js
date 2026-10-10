import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import Recommended from '../../src/models/Recommended.js';
import { createCase, updateCase } from '../../src/services/caseService.js';
import { QUESTION_TEXT_MAX } from '../../src/types.js';
import { initModels, makeAccount, makeCase, resetDb } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

// What an old client (or an old document read back) still sends.
const OLD_SHAPE = {
	id: 'q-1',
	text: 'Intent?',
	type: 'TRUE_FALSE',
	options: [{ label: 'true', value: 6 }],
	answers: { 1: 'true' },
	firstPoll: true,
	caseId: 'some-case',
};

const expectSlim = (questions) => {
	expect(questions).toEqual([{ id: 'q-1', text: 'Intent?', type: 'TRUE_FALSE', options: [{ label: 'true', value: 6 }] }]);
};

describe('QuestionSchema (spec 010)', () => {
	it('drops answers, firstPoll and caseId when a case is created', async () => {
		const fixture = await makeAccount();

		const created = await createCase(
			{ clientName: 'C', attorney: 'A', category: 'criminal.theft', studentNumber: 2, questions: [OLD_SHAPE] },
			fixture.authFor(fixture.admin)
		);

		expectSlim((await Case.collection.findOne({ _id: created._id })).questions);
	});

	it('drops them on a whole-case save, without an error', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await updateCase(live._id.toString(), { questions: [OLD_SHAPE] }, fixture.authFor(fixture.admin));

		expectSlim((await Case.collection.findOne({ _id: live._id })).questions);
	});

	it('drops them on playlists and recommended sets', async () => {
		const fixture = await makeAccount();

		const playlist = await Playlist.create({
			account: fixture.account._id,
			createdBy: fixture.admin._id,
			title: 'P',
			questions: [OLD_SHAPE],
		});
		const recommended = await Recommended.create({
			createdBy: fixture.admin._id,
			charge: 'Assault',
			questions: [OLD_SHAPE],
		});

		expectSlim((await Playlist.collection.findOne({ _id: playlist._id })).questions);
		expectSlim((await Recommended.collection.findOne({ _id: recommended._id })).questions);
	});

	it('still applies the question size limits', async () => {
		const fixture = await makeAccount();
		const live = await makeCase(fixture);

		await expect(
			updateCase(
				live._id.toString(),
				{ questions: [{ ...OLD_SHAPE, text: 'x'.repeat(QUESTION_TEXT_MAX + 1) }] },
				fixture.authFor(fixture.admin)
			)
		).rejects.toMatchObject({ name: 'ValidationError' });
	});
});
