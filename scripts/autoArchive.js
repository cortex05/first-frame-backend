/**
 * Archives every case whose purchase is a week old (src/jobs/autoArchiveExpiredCases.js).
 * Meant to run on a schedule: a Render Cron Job today, an EventBridge-triggered
 * task on AWS later. Both just run:
 *
 *   npm run job:auto-archive
 *
 * Safe to re-run or overlap: an already-archived case is skipped. Exits 1 if
 * any case failed, so the scheduler marks the run as failed.
 */

import dotenv from 'dotenv';

import { connectToDB, disconnectFromDB } from '../db.js';
import { runAutoArchive } from '../src/jobs/autoArchiveExpiredCases.js';

dotenv.config();

const run = async () => {
  await connectToDB();

  const startedAt = new Date();
  const { archived, skipped, failed } = await runAutoArchive({ now: startedAt });

  console.log(
    `Auto-archive at ${startedAt.toISOString()}: ${archived} archived, ${skipped} skipped, ${failed} failed.`
  );
  if (failed) {
    process.exitCode = 1;
  }

  await disconnectFromDB();
};

run().catch(async (error) => {
  console.error('autoArchive failed:', error);
  await disconnectFromDB().catch(() => {});
  process.exit(1);
});
