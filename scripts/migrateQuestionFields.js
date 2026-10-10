/**
 * One-off cleanup for spec 010 (one answer store per case). Questions used to
 * carry `answers` (a copy of case.answers as string labels), `firstPoll` and
 * `caseId`. The schema no longer declares them, but Mongoose still returns
 * them from documents written before, so this removes them from every
 * question in `cases`, `playlists` and `recommended`.
 *
 *   node scripts/migrateQuestionFields.js           # dry run: counts only
 *   node scripts/migrateQuestionFields.js --apply   # remove the fields
 *
 * `archivedcases` is never touched: archives stay exactly as written, and
 * readers ignore the old fields. The dry run also lists "diverging" cases,
 * where a question's old `answers` copy holds entries but case.answers has
 * none for it. Nothing reads that copy, so removing it changes nothing anyone
 * sees; the list is there so they can be looked at first.
 *
 * Writes go to the raw collections, so `revision` and `updatedAt` don't
 * change. Safe to re-run: once clean it finds nothing.
 *
 * Deploy order: frontend, then backend, then this script.
 */

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

import { connectToDB, disconnectFromDB } from '../db.js';
import Case from '../src/models/Case.js';
import Playlist from '../src/models/Playlist.js';
import Recommended from '../src/models/Recommended.js';

export const TARGETS = [Case, Playlist, Recommended];

const OLD_FIELDS = ['answers', 'firstPoll', 'caseId'];

// A document with at least one question that still has an old field.
export const STALE_QUESTION_FILTER = {
  questions: {
    $elemMatch: { $or: OLD_FIELDS.map((field) => ({ [field]: { $exists: true } })) },
  },
};

const UNSET_OLD_FIELDS = {
  $unset: Object.fromEntries(OLD_FIELDS.map((field) => [`questions.$[].${field}`, ''])),
};

const hasEntries = (value) =>
  value !== null && typeof value === 'object' && Object.keys(value).length > 0;

/** Ids of cases whose old per-question answers hold data case.answers lacks. */
export const findDivergingCases = async () => {
  const cursor = Case.collection.find(STALE_QUESTION_FILTER, {
    projection: { answers: 1, questions: 1 },
  });

  const ids = [];
  for await (const doc of cursor) {
    const answers = doc.answers ?? {};
    const diverges = (doc.questions ?? []).some(
      (question) =>
        hasEntries(question.answers) && !Object.prototype.hasOwnProperty.call(answers, question.id)
    );
    if (diverges) {
      ids.push(String(doc._id));
    }
  }
  return ids;
};

/** `{ counts: [{ collection, documents }], divergingCaseIds }`; changes nothing. */
export const planQuestionFieldMigration = async (targets = TARGETS) => {
  const counts = [];
  for (const Model of targets) {
    counts.push({
      collection: Model.collection.collectionName,
      documents: await Model.collection.countDocuments(STALE_QUESTION_FILTER),
    });
  }
  return { counts, divergingCaseIds: await findDivergingCases() };
};

/** Removes the old fields; returns `[{ collection, modified }]`. */
export const applyQuestionFieldMigration = async (targets = TARGETS) => {
  const results = [];
  for (const Model of targets) {
    const { modifiedCount } = await Model.collection.updateMany(
      STALE_QUESTION_FILTER,
      UNSET_OLD_FIELDS
    );
    results.push({ collection: Model.collection.collectionName, modified: modifiedCount });
  }
  return results;
};

const run = async () => {
  dotenv.config();
  const apply = process.argv.includes('--apply');

  await connectToDB();

  const { counts, divergingCaseIds } = await planQuestionFieldMigration();
  for (const { collection, documents } of counts) {
    console.log(`${collection}: ${documents} document(s) with old question fields`);
  }
  if (divergingCaseIds.length) {
    console.log(
      `Diverging cases (old answer copy has data case.answers lacks): ${divergingCaseIds.join(', ')}`
    );
  }

  const pending = counts.some(({ documents }) => documents > 0);
  if (pending && apply) {
    for (const { collection, modified } of await applyQuestionFieldMigration()) {
      console.log(`${collection}: cleaned ${modified}`);
    }
  } else if (pending) {
    console.log('\nDry run: nothing was changed. Re-run with --apply to remove the fields.');
  } else {
    console.log('Nothing to migrate.');
  }

  await disconnectFromDB();
};

// Only run when executed directly, so tests can import the functions.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch(async (error) => {
    console.error('migrateQuestionFields failed:', error);
    await disconnectFromDB().catch(() => {});
    process.exit(1);
  });
}
