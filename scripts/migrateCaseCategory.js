/**
 * Backfills `category` from the legacy `caseType` + `charge` pair, then drops
 * the two old fields.
 *
 * Runs against the raw collection on purpose: the Case schema no longer knows
 * about caseType/charge, so Mongoose would strip them before we could read them.
 *
 *   node scripts/migrateCaseCategory.js --dry-run   # report only
 *   node scripts/migrateCaseCategory.js             # apply
 *
 * Safe to re-run: documents that already have a `category` are skipped.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectToDB, disconnectFromDB } from '../db.js';
import { legacyPairToCategoryId } from '../src/caseCategories.js';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');

const migrate = async () => {
  await connectToDB();

  const cases = mongoose.connection.collection('cases');
  const cursor = cases.find({ category: { $exists: false } });

  const operations = [];
  const unmapped = [];
  let scanned = 0;

  for await (const doc of cursor) {
    scanned += 1;

    const categoryId = legacyPairToCategoryId(doc.caseType, doc.charge);

    if (!categoryId) {
      unmapped.push({
        _id: doc._id.toString(),
        caseType: doc.caseType,
        charge: doc.charge,
      });
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { category: categoryId },
          $unset: { caseType: '', charge: '' },
        },
      },
    });
  }

  console.log(`Scanned ${scanned} case(s) without a category.`);
  console.log(`Mappable: ${operations.length}`);
  console.log(`Unmappable: ${unmapped.length}`);

  if (unmapped.length) {
    console.log('\nThese need a manual decision -- no catalog entry matches:');
    for (const doc of unmapped) {
      console.log(`  ${doc._id}  caseType=${doc.caseType}  charge=${doc.charge}`);
    }
  }

  if (isDryRun) {
    console.log('\nDry run -- nothing written.');
  } else if (operations.length) {
    const result = await cases.bulkWrite(operations, { ordered: false });
    console.log(`\nUpdated ${result.modifiedCount} case(s).`);
  } else {
    console.log('\nNothing to update.');
  }

  await disconnectFromDB();
};

migrate().catch(async (error) => {
  console.error('Migration failed:', error);
  await disconnectFromDB().catch(() => {});
  process.exit(1);
});
