import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import Account from '../../src/models/Account.js';
import Agreement from '../../src/models/Agreement.js';
import AgreementRecord from '../../src/models/AgreementRecord.js';
import {
	clearAgreementCache,
	getCurrentAgreement,
	isAccountCurrent,
	parseTermsVersion,
} from '../../src/services/agreementService.js';
import { acceptCurrentTerms } from '../../src/services/userService.js';
import { TERMS_VERSION, initModels, makeAccount, resetDb, seedAgreement } from '../helpers/fixtures.js';

beforeAll(async () => {
	await initModels();
});

beforeEach(async () => {
	await resetDb();
});

describe('getCurrentAgreement', () => {
	it('returns null when nothing is published', async () => {
		expect(await getCurrentAgreement()).toBeNull();
	});

	it('picks the latest version that has gone live and ignores future ones', async () => {
		await seedAgreement({ termsVersion: '01-01-2026' });
		await seedAgreement({ termsVersion: '06-01-2026' });
		await seedAgreement({ termsVersion: '12-31-2099' });

		expect((await getCurrentAgreement()).termsVersion).toBe('06-01-2026');
	});

	it('serves the cached version until the cache is cleared', async () => {
		await seedAgreement({ termsVersion: '01-01-2026' });
		expect((await getCurrentAgreement()).termsVersion).toBe('01-01-2026');

		await Agreement.create({
			termsVersion: '06-01-2026',
			agreementText: 'New terms',
			dateImplemented: new Date(Date.UTC(2026, 5, 1)),
		});

		expect((await getCurrentAgreement()).termsVersion).toBe('01-01-2026');
		expect((await getCurrentAgreement({ fresh: true })).termsVersion).toBe('06-01-2026');

		clearAgreementCache();
		expect((await getCurrentAgreement()).termsVersion).toBe('06-01-2026');
	});
});

describe('isAccountCurrent', () => {
	const current = { termsVersion: '06-01-2026' };

	it('is true with no agreement published', () => {
		expect(isAccountCurrent({ acceptedTermsVersion: null }, null)).toBe(true);
	});

	it('is false for an account that never accepted or accepted an older version', () => {
		expect(isAccountCurrent({ acceptedTermsVersion: null }, current)).toBe(false);
		expect(isAccountCurrent({ acceptedTermsVersion: '01-01-2026' }, current)).toBe(false);
	});

	it('is true for an account that accepted the current version', () => {
		expect(isAccountCurrent({ acceptedTermsVersion: '06-01-2026' }, current)).toBe(true);
	});
});

describe('parseTermsVersion', () => {
	it('parses MM-DD-YYYY to 00:00 UTC of that day', () => {
		expect(parseTermsVersion('11-20-2026').toISOString()).toBe('2026-11-20T00:00:00.000Z');
	});

	it.each(['02-30-2026', '13-01-2026', '2026-11-20', '1-2-2026', '', undefined])(
		'rejects %s',
		(value) => {
			expect(parseTermsVersion(value)).toBeNull();
		}
	);
});

describe('acceptCurrentTerms', () => {
	it('records the admin acceptance, marks the account current and returns a cleared session', async () => {
		const fixture = await makeAccount();
		const agreement = await seedAgreement();

		const session = await acceptCurrentTerms(fixture.authFor(fixture.admin), {
			termsVersion: TERMS_VERSION,
		});

		expect(session.mustAcceptTerms).toBe(false);
		expect((await Account.findById(fixture.account._id)).acceptedTermsVersion).toBe(TERMS_VERSION);

		const records = await AgreementRecord.find().lean();
		expect(records).toHaveLength(1);
		expect(records[0].userId.toString()).toBe(fixture.admin._id.toString());
		expect(records[0].accountId.toString()).toBe(fixture.account._id.toString());
		expect(records[0].agreement.toString()).toBe(agreement._id.toString());
	});

	it('refuses a member and writes nothing', async () => {
		const fixture = await makeAccount({ members: 1 });
		await seedAgreement();

		await expect(
			acceptCurrentTerms(fixture.authFor(fixture.member), { termsVersion: TERMS_VERSION })
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Only an account administrator can accept the terms',
		});
		expect(await AgreementRecord.countDocuments()).toBe(0);
	});

	it.each([
		['missing', undefined],
		['outdated', '12-31-2025'],
	])('rejects a %s version with 409 and writes nothing', async (_, termsVersion) => {
		const fixture = await makeAccount();
		await seedAgreement();

		await expect(
			acceptCurrentTerms(fixture.authFor(fixture.admin), { termsVersion })
		).rejects.toMatchObject({ statusCode: 409, code: 'TERMS_OUTDATED' });
		expect(await AgreementRecord.countDocuments()).toBe(0);
		expect((await Account.findById(fixture.account._id)).acceptedTermsVersion).toBeNull();
	});

	it('returns 503 when no terms are published', async () => {
		const fixture = await makeAccount();

		await expect(
			acceptCurrentTerms(fixture.authFor(fixture.admin), { termsVersion: TERMS_VERSION })
		).rejects.toMatchObject({ statusCode: 503, code: 'TERMS_UNAVAILABLE' });
	});

	it('is idempotent for the same user', async () => {
		const fixture = await makeAccount();
		await seedAgreement();
		const auth = fixture.authFor(fixture.admin);

		await acceptCurrentTerms(auth, { termsVersion: TERMS_VERSION });
		await acceptCurrentTerms(auth, { termsVersion: TERMS_VERSION });

		expect(await AgreementRecord.countDocuments()).toBe(1);
	});

	it('records a second admin of an already current account too', async () => {
		const fixture = await makeAccount({ admins: 2 });
		await seedAgreement();

		await acceptCurrentTerms(fixture.authFor(fixture.admins[0]), { termsVersion: TERMS_VERSION });
		const session = await acceptCurrentTerms(fixture.authFor(fixture.admins[1]), {
			termsVersion: TERMS_VERSION,
		});

		expect(session.mustAcceptTerms).toBe(false);
		expect(await AgreementRecord.countDocuments()).toBe(2);
	});

	it('accepts a version that went live after an older one was accepted', async () => {
		const fixture = await makeAccount();
		await seedAgreement();
		await acceptCurrentTerms(fixture.authFor(fixture.admin), { termsVersion: TERMS_VERSION });

		await seedAgreement({ termsVersion: '02-01-2026' });

		const session = await acceptCurrentTerms(fixture.authFor(fixture.admin), {
			termsVersion: '02-01-2026',
		});
		expect(session.mustAcceptTerms).toBe(false);
		expect(await AgreementRecord.countDocuments()).toBe(2);
	});
});
