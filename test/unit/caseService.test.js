import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Case from '../../src/models/Case.js';
import { createCase, listCases, updateCase } from '../../src/services/caseService.js';

describe('caseService.createCase', () => {
	beforeEach(async () => {
		await Case.deleteMany({});
	});

	it('creates and persists a case for a valid owner and payload', async () => {
		const ownerId = new mongoose.Types.ObjectId().toString();
		const payload = {
			clientName: '  Jane Client  ',
			attorney: '  Alex Attorney  ',
			caseType: 'Criminal',
			charge: 'Theft',
			studentNumber: 2,
			questions: [
				{
					id: 'q-1',
					text: 'Was there intent?',
					type: 'TRUE_FALSE',
				},
			],
		};

		const created = await createCase(payload, ownerId);

		expect(created).toBeTruthy();
		expect(created.owner.toString()).toBe(ownerId);
		expect(created.clientName).toBe('Jane Client');
		expect(created.attorney).toBe('Alex Attorney');
		expect(created.caseType).toBe('criminal');
		expect(created.charge).toBe('Theft');
		expect(created.studentNumber).toBe(2);
		expect(created.questions).toHaveLength(1);

		const inDb = await Case.findById(created._id).lean();
		expect(inDb).not.toBeNull();
		expect(inDb.owner.toString()).toBe(ownerId);
		expect(inDb.caseType).toBe('criminal');
	});
});

describe('caseService.listCases', () => {
	beforeEach(async () => {
		await Case.deleteMany({});
	});

	it('returns only owner cases sorted by createdOn descending', async () => {
		const ownerId = new mongoose.Types.ObjectId();
		const otherOwnerId = new mongoose.Types.ObjectId();

		await Case.create([
			{
				owner: ownerId,
				clientName: 'Older Case',
				attorney: 'Attorney A',
				caseType: 'criminal',
				charge: 'Theft',
				studentNumber: 1,
				createdOn: new Date('2026-01-01T00:00:00.000Z'),
			},
			{
				owner: ownerId,
				clientName: 'Newer Case',
				attorney: 'Attorney B',
				caseType: 'criminal',
				charge: 'Assault',
				studentNumber: 2,
				createdOn: new Date('2026-02-01T00:00:00.000Z'),
			},
			{
				owner: otherOwnerId,
				clientName: 'Other Owner Case',
				attorney: 'Attorney C',
				caseType: 'criminal',
				charge: 'Battery',
				studentNumber: 3,
				createdOn: new Date('2026-03-01T00:00:00.000Z'),
			},
		]);

		const result = await listCases(ownerId.toString());

		expect(result).toHaveLength(2);
		expect(result[0].clientName).toBe('Newer Case');
		expect(result[1].clientName).toBe('Older Case');
		expect(result.every((item) => item.owner.toString() === ownerId.toString())).toBe(true);
	});

	it('throws when ownerId is missing', async () => {
		await expect(listCases()).rejects.toMatchObject({
			message: 'Authenticated user is required',
			statusCode: 401,
		});
	});
});

describe('caseService.updateCase', () => {
	beforeEach(async () => {
		await Case.deleteMany({});
	});

	it('updates an existing case for the owner and persists changes', async () => {
		const ownerId = new mongoose.Types.ObjectId().toString();
		const created = await createCase(
			{
				clientName: 'Initial Client',
				attorney: 'Initial Attorney',
				caseType: 'criminal',
				charge: 'Theft',
				studentNumber: 2,
				questions: [],
			},
			ownerId
		);

		const updated = await updateCase(
			created._id.toString(),
			{
				clientName: '  Updated Client  ',
				attorney: '  Updated Attorney  ',
				caseType: 'civil',
				charge: 'Personal Injury',
				studentNumber: 5,
				questions: [
					{ id: 'q-1', text: 'Updated question', type: 'TRUE_FALSE' },
				],
			},
			ownerId
		);

		expect(updated.clientName).toBe('Updated Client');
		expect(updated.attorney).toBe('Updated Attorney');
		expect(updated.caseType).toBe('civil');
		expect(updated.charge).toBe('Personal Injury');
		expect(updated.studentNumber).toBe(5);
		expect(updated.questions).toHaveLength(1);

		const persisted = await Case.findById(created._id).lean();
		expect(persisted.clientName).toBe('Updated Client');
		expect(persisted.caseType).toBe('civil');
		expect(persisted.charge).toBe('Personal Injury');
	});

	it('throws 404 when case does not belong to the owner', async () => {
		const ownerId = new mongoose.Types.ObjectId().toString();
		const otherOwnerId = new mongoose.Types.ObjectId().toString();

		const created = await createCase(
			{
				clientName: 'Owner Case',
				attorney: 'Attorney',
				caseType: 'criminal',
				charge: 'Theft',
				studentNumber: 1,
			},
			ownerId
		);

		await expect(
			updateCase(created._id.toString(), { clientName: 'No Access' }, otherOwnerId)
		).rejects.toMatchObject({
			message: 'Case not found',
			statusCode: 404,
		});
	});
});
