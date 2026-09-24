/**
 * One-off reset for the move to accounts (spec 001). Pre-account users, cases
 * and playlists have no account to belong to, and the decision was to start
 * fresh rather than migrate them.
 *
 *   node scripts/resetForAccounts.js --confirm
 *
 * Drops `users`, `cases` and `playlists`, then syncs indexes for every model so
 * the new unique indexes (per-account playlist titles, archived originalCaseId)
 * exist before the first write. `recommended` is left alone; its `createdBy`
 * may then point at a deleted user, which the read paths tolerate. Platform
 * admins have to register again and be re-granted with `npm run admin:grant`.
 *
 * Safe to re-run: collections that are already gone are skipped.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import { connectToDB, disconnectFromDB } from '../db.js';
import Account from '../src/models/Account.js';
import ArchivedCase from '../src/models/ArchivedCase.js';
import Case from '../src/models/Case.js';
import Playlist from '../src/models/Playlist.js';
import User from '../src/models/User.js';

const COLLECTIONS_TO_DROP = ['users', 'cases', 'playlists'];

export const resetForAccounts = async ({ confirm = false } = {}) => {
  if (confirm !== true) {
    throw new Error('Refusing to reset without confirmation (pass --confirm).');
  }

  const existing = new Set(
    (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name
    )
  );

  const dropped = [];
  for (const name of COLLECTIONS_TO_DROP) {
    if (existing.has(name)) {
      await mongoose.connection.dropCollection(name);
      dropped.push(name);
    }
  }

  for (const Model of [Account, User, Case, ArchivedCase, Playlist]) {
    await Model.createCollection();
    await Model.syncIndexes();
  }

  return { dropped };
};

const run = async () => {
  dotenv.config();

  if (!process.argv.includes('--confirm')) {
    console.error('This deletes every user, case and playlist.');
    console.error('Usage: node scripts/resetForAccounts.js --confirm');
    process.exitCode = 1;
    return;
  }

  await connectToDB();
  const { dropped } = await resetForAccounts({ confirm: true });
  console.log(dropped.length ? `Dropped: ${dropped.join(', ')}.` : 'Nothing to drop.');
  console.log('Indexes synced. Recommended sets were left untouched.');
  await disconnectFromDB();
};

// Only run when executed directly, so tests can import resetForAccounts.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch(async (error) => {
    console.error('resetForAccounts failed:', error);
    await disconnectFromDB().catch(() => {});
    process.exit(1);
  });
}
