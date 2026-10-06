/**
 * Publishes a new version of the Terms of Service.
 *
 * Terms are never settable over HTTP, so this script is the only way to add a
 * version. Versions are never edited: to change the text, publish a new date.
 *
 *   node scripts/publishTerms.js terms.txt 11-20-2026
 *
 * The version goes live at 00:00 UTC of that date. Until then the previous
 * version stays current, so a version can be published ahead of time. Once it
 * is live, every account must have an admin accept it before using the app.
 */

import fs from 'node:fs/promises';
import dotenv from 'dotenv';

import { connectToDB, disconnectFromDB } from '../db.js';
import Agreement from '../src/models/Agreement.js';
import { parseTermsVersion } from '../src/services/agreementService.js';

dotenv.config();

const [filePath, termsVersion] = process.argv.slice(2);

const usage = () => {
  console.error('Usage: node scripts/publishTerms.js <file.txt> <MM-DD-YYYY>');
};

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const run = async () => {
  if (!filePath || !termsVersion) {
    usage();
    process.exitCode = 1;
    return;
  }

  const dateImplemented = parseTermsVersion(termsVersion);
  if (!dateImplemented) {
    fail(`"${termsVersion}" is not a valid MM-DD-YYYY date.`);
    return;
  }

  let agreementText;
  try {
    agreementText = (await fs.readFile(filePath, 'utf8')).trim();
  } catch {
    fail(`Cannot read ${filePath}.`);
    return;
  }
  if (!agreementText) {
    fail(`${filePath} is empty.`);
    return;
  }

  await connectToDB();

  try {
    const existing = await Agreement.findOne({
      $or: [{ termsVersion }, { dateImplemented }],
    }).lean();
    if (existing) {
      fail(`Version ${existing.termsVersion} already exists. Publish a new date instead.`);
      return;
    }

    const now = new Date();
    // The next version dated after this one, live or scheduled.
    const next = await Agreement.findOne({ dateImplemented: { $gt: dateImplemented } })
      .sort({ dateImplemented: 1 })
      .lean();

    await Agreement.create({ termsVersion, agreementText, dateImplemented });

    if (next && next.dateImplemented <= now) {
      console.warn(
        `Warning: ${next.termsVersion} is dated later and already live, so ${termsVersion} will never become current.`
      );
    } else {
      console.log(
        dateImplemented <= now
          ? `Published ${termsVersion}. It is live now (within a minute on running servers).`
          : `Published ${termsVersion}. It is scheduled to go live at ${dateImplemented.toISOString()}.`
      );
      if (next) {
        console.log(`It stays current until ${next.termsVersion} goes live at ${next.dateImplemented.toISOString()}.`);
      }
    }
  } finally {
    await disconnectFromDB();
  }
};

run().catch(async (error) => {
  console.error('publishTerms failed:', error);
  await disconnectFromDB().catch(() => {});
  process.exit(1);
});
