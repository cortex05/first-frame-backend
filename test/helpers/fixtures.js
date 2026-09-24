import bcrypt from 'bcryptjs';

import Account from '../../src/models/Account.js';
import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import Recommended from '../../src/models/Recommended.js';
import User from '../../src/models/User.js';
import { buildAuthContext } from '../../src/policies/accountScope.js';

export const PASSWORD = 'password123';

// Hashed once: bcrypt per fixture user would dominate test time.
const hashedPassword = bcrypt.hashSync(PASSWORD, 4);

const MODELS = [Account, User, Case, ArchivedCase, Playlist, Recommended];

/**
 * Creates every collection and its indexes up front. A transaction cannot
 * rely on implicitly creating a collection, and unique-index tests need the
 * index to exist before the first insert.
 */
export const initModels = async () => {
	for (const Model of MODELS) {
		await Model.createCollection();
		await Model.init();
	}
};

export const resetDb = async () => {
	for (const Model of MODELS) {
		await Model.deleteMany({});
	}
};

let sequence = 0;
const nextId = () => {
	sequence += 1;
	return sequence;
};

const makeUser = (account, overrides = {}) => {
	const n = nextId();
	return User.create({
		username: `user-${n}`,
		email: `user-${n}@example.com`,
		password: hashedPassword,
		account: account._id,
		...overrides,
	});
};

/**
 * An account with the requested number of active admins, active members and
 * disabled members. `authFor(user)` builds the same context `authenticate`
 * would put on `req.auth`.
 */
export const makeAccount = async ({ name = 'Test Account', admins = 1, members = 0, disabled = 0 } = {}) => {
	const account = await Account.create({ name });

	const adminUsers = [];
	for (let i = 0; i < admins; i += 1) {
		adminUsers.push(await makeUser(account, { role: 'admin' }));
	}
	const memberUsers = [];
	for (let i = 0; i < members; i += 1) {
		memberUsers.push(await makeUser(account, { role: 'member' }));
	}
	const disabledUsers = [];
	for (let i = 0; i < disabled; i += 1) {
		disabledUsers.push(await makeUser(account, { role: 'member', status: 'disabled' }));
	}

	if (adminUsers[0]) {
		account.createdBy = adminUsers[0]._id;
		await account.save();
	}

	return {
		account,
		admin: adminUsers[0],
		admins: adminUsers,
		member: memberUsers[0],
		members: memberUsers,
		disabledUsers,
		authFor: (user) => buildAuthContext(user),
	};
};

export const QUESTIONS = [
	{ id: 'q-1', text: 'Was there intent?', type: 'TRUE_FALSE' },
	{ id: 'q-2', text: 'Was the witness credible?', type: 'TRUE_FALSE' },
];

// Satisfies the completeness rule: every question has at least one answer.
export const answerAll = (questions = QUESTIONS) =>
	Object.fromEntries(questions.map((q) => [q.id, { 'student-1': { label: 'true' } }]));

export const makeCase = (fixture, overrides = {}) =>
	Case.create({
		account: fixture.account._id,
		createdBy: fixture.admin._id,
		owners: [],
		clientName: 'Client',
		attorney: 'Attorney',
		category: 'criminal.theft',
		studentNumber: 2,
		questions: QUESTIONS,
		...overrides,
	});
