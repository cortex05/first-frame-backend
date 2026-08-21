import { beforeEach, describe, expect, it } from 'vitest';

import User from '../../src/models/User.js';
import { register } from '../../src/services/userService.js';

describe('userService.register', () => {
	beforeEach(async () => {
		await User.deleteMany({});
	});

	it('creates a normal user', async () => {
		const user = await register('daniel', 'Daniel@Example.com', 'secret123');

		expect(user.username).toBe('daniel');
		expect(user.email).toBe('daniel@example.com');
		expect(user.isAdmin).toBe(false);
		expect(user.password).toBeUndefined();
	});

	it('ignores an isAdmin field in the payload, so nobody can self-promote', async () => {
		// register() takes three arguments; a fourth is what the old signature
		// accepted from req.body. It must not reach the document.
		const user = await register('sneaky', 'sneaky@example.com', 'secret123', true);

		expect(user.isAdmin).toBe(false);

		const inDb = await User.findById(user._id).lean();
		expect(inDb.isAdmin).toBe(false);
	});

	it('rejects a missing field', async () => {
		await expect(register('daniel', '', 'secret123')).rejects.toMatchObject({
			message: 'Username, email, and password are required',
			statusCode: 400,
		});
	});

	it('rejects a duplicate email regardless of casing', async () => {
		await register('daniel', 'daniel@example.com', 'secret123');

		await expect(register('other', 'DANIEL@example.com', 'secret123')).rejects.toMatchObject({
			message: 'User already exists',
			statusCode: 400,
		});
	});
});
