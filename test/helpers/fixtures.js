import bcrypt from 'bcryptjs';

import Account from '../../src/models/Account.js';
import Agreement from '../../src/models/Agreement.js';
import AgreementRecord from '../../src/models/AgreementRecord.js';
import ArchivedCase from '../../src/models/ArchivedCase.js';
import Case from '../../src/models/Case.js';
import Playlist from '../../src/models/Playlist.js';
import Recommended from '../../src/models/Recommended.js';
import Transaction from '../../src/models/Transaction.js';
import User from '../../src/models/User.js';
import { buildAuthContext } from '../../src/policies/accountScope.js';
import { clearAgreementCache } from '../../src/services/agreementService.js';

export const PASSWORD = 'password123';

// Hashed once: bcrypt per fixture user would dominate test time.
const hashedPassword = bcrypt.hashSync(PASSWORD, 4);

const MODELS = [
	Account,
	User,
	Case,
	ArchivedCase,
	Playlist,
	Recommended,
	Transaction,
	Agreement,
	AgreementRecord,
];

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
	clearAgreementCache();
};

// The version seedAgreement() publishes by default; registration must send it.
export const TERMS_VERSION = '01-01-2026';

/**
 * Publishes a version of the terms (spec 008) and clears the cache so the next
 * request sees it. Registration fails with 503 until one exists.
 */
export const seedAgreement = async ({
	termsVersion = TERMS_VERSION,
	dateImplemented,
	agreementText = `Terms ${termsVersion}`,
} = {}) => {
	const [month, day, year] = termsVersion.split('-').map(Number);
	const agreement = await Agreement.create({
		termsVersion,
		agreementText,
		dateImplemented: dateImplemented ?? new Date(Date.UTC(year, month - 1, day)),
	});
	clearAgreementCache();
	return agreement;
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

// Seed for Case.studentDetails (spec 005), keyed like the stored map.
export const STUDENT_DETAILS = {
	1: { age: 34, occupation: 'Teacher', gender: 'female', race: 'Hispanic' },
	2: { age: 50 },
};

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

/**
 * A transaction for a case made with `makeCase` (which, unlike the service,
 * creates none). `overrides` seeds later lifecycle states.
 */
export const makeTransaction = (fixture, caseDoc, overrides = {}) =>
	Transaction.create({
		account: fixture.account._id,
		createdBy: fixture.admin._id,
		username: fixture.admin.username,
		case: caseDoc._id,
		...overrides,
	});
