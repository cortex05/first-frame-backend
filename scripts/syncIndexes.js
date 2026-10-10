/**
 * Makes the database's indexes match the schemas: drops indexes no schema
 * declares any more and builds missing ones. Mongoose builds missing indexes
 * on startup but never drops one, so removing an index from a schema needs
 * this script to take effect.
 *
 *   node scripts/syncIndexes.js           # dry run: print what would change
 *   node scripts/syncIndexes.js --apply   # make the changes
 *
 * It drops EVERY index a schema doesn't declare, including any created by
 * hand (e.g. in the Atlas UI), so read the dry run before applying. `_id`
 * indexes are never touched. Safe to re-run: once in sync it changes nothing.
 */

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

import { connectToDB, disconnectFromDB } from '../db.js';
import Account from '../src/models/Account.js';
import Agreement from '../src/models/Agreement.js';
import AgreementRecord from '../src/models/AgreementRecord.js';
import ArchivedCase from '../src/models/ArchivedCase.js';
import Case from '../src/models/Case.js';
import Playlist from '../src/models/Playlist.js';
import Recommended from '../src/models/Recommended.js';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';

export const MODELS = [
  Account,
  Agreement,
  AgreementRecord,
  ArchivedCase,
  Case,
  Playlist,
  Recommended,
  Transaction,
  User,
];

/**
 * What would change, per model that has differences:
 * `[{ model, toDrop: [indexName], toCreate: [keySpec] }]`.
 */
export const planIndexSync = async (models = MODELS) => {
  const plan = [];
  for (const Model of models) {
    const { toDrop, toCreate } = await Model.diffIndexes();
    if (toDrop.length || toCreate.length) {
      plan.push({ model: Model.modelName, toDrop, toCreate });
    }
  }
  return plan;
};

/** Applies the changes; returns `[{ model, dropped: [indexName] }]`. */
export const syncAllIndexes = async (models = MODELS) => {
  const results = [];
  for (const Model of models) {
    const dropped = await Model.syncIndexes();
    if (dropped.length) {
      results.push({ model: Model.modelName, dropped });
    }
  }
  return results;
};

const printPlan = (plan) => {
  if (!plan.length) {
    console.log('Indexes already match the schemas. Nothing to do.');
    return;
  }
  for (const { model, toDrop, toCreate } of plan) {
    console.log(`${model}:`);
    for (const name of toDrop) {
      console.log(`  drop   ${name}`);
    }
    for (const spec of toCreate) {
      console.log(`  create ${JSON.stringify(spec)}`);
    }
  }
};

const run = async () => {
  dotenv.config();
  const apply = process.argv.includes('--apply');

  await connectToDB();

  const plan = await planIndexSync();
  printPlan(plan);

  if (plan.length && apply) {
    await syncAllIndexes();
    console.log('Applied.');
  } else if (plan.length) {
    console.log('\nDry run: nothing was changed. Re-run with --apply to make these changes.');
  }

  await disconnectFromDB();
};

// Only run when executed directly, so tests can import the functions.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch(async (error) => {
    console.error('syncIndexes failed:', error);
    await disconnectFromDB().catch(() => {});
    process.exit(1);
  });
}
