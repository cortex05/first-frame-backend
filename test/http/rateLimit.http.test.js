import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '../../src/app.js';
import {
	createApiLimiter,
	createCredentialLimiter,
	createRegisterLimiter,
} from '../../src/middleware/rateLimiters.js';

// A small app with the real limiters and tiny budgets, so a limit is reached in
// a few requests. Like src/app.js, it trusts one proxy hop.
const buildApp = (limiter, status = 200) => {
	const testApp = express();
	testApp.set('trust proxy', 1);
	testApp.use(limiter);
	testApp.all('/', (req, res) => res.status(status).json({ ok: status < 400 }));
	return testApp;
};

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const fromIp = (ip) => ({ 'X-Forwarded-For': ip });

const hit = (testApp, headers = {}) => request(testApp).get('/').set(headers);

describe('src/app.js', () => {
	it('trusts one proxy hop so the client IP comes from X-Forwarded-For', () => {
		expect(app.get('trust proxy')).toBe(1);
	});
});

describe('createApiLimiter', () => {
	it('gives each client IP its own anonymous budget', async () => {
		const testApp = buildApp(createApiLimiter({ anonymousLimit: 2, authenticatedLimit: 10 }));

		await hit(testApp, fromIp('203.0.113.1'));
		await hit(testApp, fromIp('203.0.113.1'));
		const limited = await hit(testApp, fromIp('203.0.113.1'));
		const otherClient = await hit(testApp, fromIp('203.0.113.2'));

		expect(limited.status).toBe(429);
		expect(limited.body.message).toMatch(/too many requests/i);
		expect(otherClient.status).toBe(200);
	});

	it('counts signed-in users per user, not per IP', async () => {
		const testApp = buildApp(createApiLimiter({ anonymousLimit: 1, authenticatedLimit: 2 }));
		const sameOffice = fromIp('198.51.100.7');

		const alice = { ...sameOffice, Authorization: `Bearer ${tokenFor('alice')}` };
		const bob = { ...sameOffice, Authorization: `Bearer ${tokenFor('bob')}` };

		expect((await hit(testApp, alice)).status).toBe(200);
		expect((await hit(testApp, alice)).status).toBe(200);
		expect((await hit(testApp, alice)).status).toBe(429);
		// Same IP, different user: an untouched budget.
		expect((await hit(testApp, bob)).status).toBe(200);
		// The office's anonymous IP budget is separate from both.
		expect((await hit(testApp, sameOffice)).status).toBe(200);
	});

	it('treats a forged token as anonymous', async () => {
		const testApp = buildApp(createApiLimiter({ anonymousLimit: 1, authenticatedLimit: 10 }));
		const forged = jwt.sign({ id: 'someone' }, 'not-the-secret');
		const headers = { ...fromIp('192.0.2.9'), Authorization: `Bearer ${forged}` };

		expect((await hit(testApp, headers)).status).toBe(200);
		expect((await hit(testApp, headers)).status).toBe(429);
	});
});

describe('createCredentialLimiter', () => {
	it('counts failed attempts only', async () => {
		const failing = buildApp(createCredentialLimiter({ limit: 2 }), 401);
		const headers = fromIp('203.0.113.50');

		await hit(failing, headers);
		await hit(failing, headers);
		expect((await hit(failing, headers)).status).toBe(429);

		const succeeding = buildApp(createCredentialLimiter({ limit: 2 }), 200);
		for (let i = 0; i < 5; i += 1) {
			expect((await hit(succeeding, headers)).status).toBe(200);
		}
	});
});

describe('createRegisterLimiter', () => {
	it('counts every attempt, successful or not', async () => {
		const testApp = buildApp(createRegisterLimiter({ limit: 2 }), 201);
		const headers = fromIp('203.0.113.60');

		await hit(testApp, headers);
		await hit(testApp, headers);
		expect((await hit(testApp, headers)).status).toBe(429);
	});
});
