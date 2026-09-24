import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
	assertAccountAdmin,
	buildAuthContext,
	canWritePlaylist,
	caseScopeFilter,
	playlistScopeFilter,
} from '../../src/policies/accountScope.js';

const id = () => new mongoose.Types.ObjectId();

const admin = { userId: 'u-admin', accountId: 'acc-1', role: 'admin' };
const member = { userId: 'u-member', accountId: 'acc-1', role: 'member' };

describe('buildAuthContext', () => {
	it('reads the account id from a populated or bare reference', () => {
		const accountId = id();
		const userId = id();

		const populated = buildAuthContext({ _id: userId, account: { _id: accountId }, role: 'member' });
		const bare = buildAuthContext({ _id: userId, account: accountId, role: 'admin', isAdmin: true });

		expect(populated).toEqual({
			userId: userId.toString(),
			accountId: accountId.toString(),
			role: 'member',
			isPlatformAdmin: false,
		});
		expect(bare.accountId).toBe(accountId.toString());
		expect(bare.isPlatformAdmin).toBe(true);
	});
});

describe('caseScopeFilter', () => {
	it('gives an admin the whole account', () => {
		expect(caseScopeFilter(admin)).toEqual({ account: 'acc-1' });
	});

	it('limits a member to cases they own', () => {
		expect(caseScopeFilter(member)).toEqual({ account: 'acc-1', owners: 'u-member' });
	});
});

describe('playlistScopeFilter / canWritePlaylist', () => {
	it('shows every playlist in the account to everyone', () => {
		expect(playlistScopeFilter(member)).toEqual({ account: 'acc-1' });
	});

	it('lets the creator and admins write, and nobody else', () => {
		const ownPlaylist = { createdBy: 'u-member' };
		const othersPlaylist = { createdBy: 'u-someone' };

		expect(canWritePlaylist(member, ownPlaylist)).toBe(true);
		expect(canWritePlaylist(member, othersPlaylist)).toBe(false);
		expect(canWritePlaylist(admin, othersPlaylist)).toBe(true);
	});
});

describe('assertAccountAdmin', () => {
	it('throws 403 for a member', () => {
		expect(() => assertAccountAdmin(member)).toThrow(
			expect.objectContaining({ statusCode: 403 })
		);
		expect(() => assertAccountAdmin(admin)).not.toThrow();
	});
});
