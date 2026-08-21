import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Recommended from '../../src/models/Recommended.js';
import {
	createRecommended,
	deleteRecommended,
	findRecommendedForCharge,
	getRecommendedById,
	listRecommended,
	updateRecommended,
} from '../../src/services/recommendedService.js';

const adminId = () => new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
	// The unique charge index has to exist before the duplicate tests.
	await Recommended.init();
});

describe('recommendedService.createRecommended', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
	});

	it('creates a recommended set for a catalog charge', async () => {
		const createdBy = adminId();

		const created = await createRecommended(
			{
				charge: 'Assault',
				questions: [{ id: 'q-1', text: 'Was there intent?', type: 'TRUE_FALSE' }],
			},
			createdBy
		);

		expect(created.createdBy.toString()).toBe(createdBy);
		expect(created.charge).toBe('Assault');
		expect(created.questions).toHaveLength(1);

		const inDb = await Recommended.findById(created._id).lean();
		expect(inDb.charge).toBe('Assault');
	});

	it('normalizes a loosely spelled charge onto its catalog value', async () => {
		const created = await createRecommended({ charge: '  dwi  ' }, adminId());

		expect(created.charge).toBe('DWI');
		expect(created.questions).toEqual([]);
	});

	it('rejects a charge that is not in the catalog', async () => {
		await expect(
			createRecommended({ charge: 'Jaywalking' }, adminId())
		).rejects.toMatchObject({ message: 'Invalid charge', statusCode: 400 });
	});

	it('rejects a missing charge', async () => {
		await expect(createRecommended({ questions: [] }, adminId())).rejects.toMatchObject({
			message: 'charge is required',
			statusCode: 400,
		});
	});

	it('rejects questions that are not an array', async () => {
		await expect(
			createRecommended({ charge: 'Theft', questions: 'nope' }, adminId())
		).rejects.toMatchObject({ message: 'questions must be an array', statusCode: 400 });
	});

	it('requires an authenticated user', async () => {
		await expect(createRecommended({ charge: 'Theft' }, 'not-an-id')).rejects.toMatchObject({
			message: 'Authenticated user is required',
			statusCode: 401,
		});
	});

	it('rejects a second set for the same charge, even from a different author', async () => {
		await createRecommended({ charge: 'Theft' }, adminId());

		await expect(createRecommended({ charge: 'Theft' }, adminId())).rejects.toMatchObject({
			message: 'A recommended set for this charge already exists',
			statusCode: 409,
		});
	});
});

describe('recommendedService.listRecommended', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
		await createRecommended({ charge: 'Divorce' }, adminId());
		await createRecommended({ charge: 'Assault' }, adminId());
	});

	it('returns every set, for any user, sorted by charge', async () => {
		const all = await listRecommended();

		expect(all.map((item) => item.charge)).toEqual(['Assault', 'Divorce']);
		// Browse view omits the question bodies.
		expect(all[0].questions).toBeUndefined();
	});
});

describe('recommendedService.findRecommendedForCharge', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
		await createRecommended(
			{ charge: 'Divorce', questions: [{ id: 'q-1', text: 'Contested?', type: 'TRUE_FALSE' }] },
			adminId()
		);
	});

	it('finds the single set for a charge, with its questions', async () => {
		const found = await findRecommendedForCharge({ charge: 'divorce' });

		expect(found.charge).toBe('Divorce');
		expect(found.questions).toHaveLength(1);
	});

	it('finds it by the case category id a case stores', async () => {
		const found = await findRecommendedForCharge({ category: 'family.divorce' });

		expect(found.charge).toBe('Divorce');
	});

	it('returns null for a charge nobody has curated yet', async () => {
		expect(await findRecommendedForCharge({ charge: 'Arson' })).toBeNull();
	});

	it('rejects an unknown category id', async () => {
		await expect(
			findRecommendedForCharge({ category: 'criminal.divorce' })
		).rejects.toMatchObject({ message: 'Invalid case category', statusCode: 400 });
	});

	it('rejects a lookup with neither charge nor category', async () => {
		await expect(findRecommendedForCharge({ charge: '', category: '' })).rejects.toMatchObject({
			message: 'charge or category is required',
			statusCode: 400,
		});
	});
});

describe('recommendedService.getRecommendedById', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
	});

	it('returns the set with its questions', async () => {
		const created = await createRecommended(
			{ charge: 'Arson', questions: [{ id: 'q-1', text: 'Motive?', type: 'TRUE_FALSE' }] },
			adminId()
		);

		const found = await getRecommendedById(created._id.toString());

		expect(found.charge).toBe('Arson');
		expect(found.questions).toHaveLength(1);
	});

	it('rejects a malformed id', async () => {
		await expect(getRecommendedById('nope')).rejects.toMatchObject({
			message: 'Valid recommended id is required',
			statusCode: 400,
		});
	});

	it('reports a missing set', async () => {
		await expect(
			getRecommendedById(new mongoose.Types.ObjectId().toString())
		).rejects.toMatchObject({ message: 'Recommended not found', statusCode: 404 });
	});
});

describe('recommendedService.updateRecommended', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
	});

	it('updates the charge and questions of any author\'s set', async () => {
		const created = await createRecommended({ charge: 'Burglary' }, adminId());

		const updated = await updateRecommended(created._id.toString(), {
			charge: 'Robbery',
			questions: [{ id: 'q-1', text: 'Force used?', type: 'TRUE_FALSE' }],
		});

		expect(updated.charge).toBe('Robbery');
		expect(updated.questions).toHaveLength(1);
	});

	it('rejects a charge outside the catalog', async () => {
		const created = await createRecommended({ charge: 'Burglary' }, adminId());

		await expect(
			updateRecommended(created._id.toString(), { charge: 'Loitering' })
		).rejects.toMatchObject({ message: 'Invalid charge', statusCode: 400 });
	});

	it('rejects moving a set onto a charge another set already covers', async () => {
		await createRecommended({ charge: 'Arson' }, adminId());
		const created = await createRecommended({ charge: 'Burglary' }, adminId());

		await expect(
			updateRecommended(created._id.toString(), { charge: 'Arson' })
		).rejects.toMatchObject({
			message: 'A recommended set for this charge already exists',
			statusCode: 409,
		});
	});

	it('requires at least one updatable field', async () => {
		const created = await createRecommended({ charge: 'Burglary' }, adminId());

		await expect(updateRecommended(created._id.toString(), {})).rejects.toMatchObject({
			message: 'At least one updatable field is required',
			statusCode: 400,
		});
	});

	it('reports a missing set', async () => {
		await expect(
			updateRecommended(new mongoose.Types.ObjectId().toString(), { charge: 'Fraud' })
		).rejects.toMatchObject({ message: 'Recommended not found', statusCode: 404 });
	});
});

describe('recommendedService.deleteRecommended', () => {
	beforeEach(async () => {
		await Recommended.deleteMany({});
	});

	it('removes the set', async () => {
		const created = await createRecommended({ charge: 'Fraud' }, adminId());

		await deleteRecommended(created._id.toString());

		expect(await Recommended.findById(created._id)).toBeNull();
	});

	it('reports a missing set', async () => {
		await expect(
			deleteRecommended(new mongoose.Types.ObjectId().toString())
		).rejects.toMatchObject({ message: 'Recommended not found', statusCode: 404 });
	});
});
