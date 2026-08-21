/**
 * Grants or revokes administrator rights on a user account.
 *
 * Admin is never settable over HTTP -- registration ignores an `isAdmin` field
 * on purpose, so this script is the only way to flip it. That makes server
 * access the thing that grants admin, which is the gate we actually want.
 *
 *   node scripts/grantAdmin.js someone@example.com            # grant
 *   node scripts/grantAdmin.js someone@example.com --revoke   # revoke
 *   node scripts/grantAdmin.js --list                         # show admins
 *
 * Safe to re-run: a user who already has the requested state is left alone.
 */

import dotenv from 'dotenv';

import { connectToDB, disconnectFromDB } from '../db.js';
import User from '../src/models/User.js';

dotenv.config();

const args = process.argv.slice(2);
const shouldList = args.includes('--list');
const shouldRevoke = args.includes('--revoke');
const email = args.find((arg) => !arg.startsWith('--'));

const usage = () => {
  console.error('Usage: node scripts/grantAdmin.js <email> [--revoke]');
  console.error('       node scripts/grantAdmin.js --list');
};

const listAdmins = async () => {
  const admins = await User.find({ isAdmin: true }).select('username email').sort({ email: 1 });

  if (!admins.length) {
    console.log('No administrators.');
    return;
  }

  console.log(`${admins.length} administrator(s):`);
  for (const admin of admins) {
    console.log(`  ${admin.email}  (${admin.username})`);
  }
};

const setAdmin = async (targetEmail, isAdmin) => {
  // Emails are stored lowercased by the schema, so match on the same form.
  const normalizedEmail = targetEmail.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    console.error(`No user with email ${normalizedEmail}.`);
    process.exitCode = 1;
    return;
  }

  if (user.isAdmin === isAdmin) {
    console.log(`${normalizedEmail} is already ${isAdmin ? 'an administrator' : 'a normal user'}.`);
    return;
  }

  if (!isAdmin) {
    const remaining = await User.countDocuments({ isAdmin: true, _id: { $ne: user._id } });
    if (!remaining) {
      console.error(
        `Refusing to revoke ${normalizedEmail}: they are the only administrator left. ` +
          'Grant admin to someone else first.'
      );
      process.exitCode = 1;
      return;
    }
  }

  user.isAdmin = isAdmin;
  await user.save();

  console.log(`${isAdmin ? 'Granted' : 'Revoked'} admin for ${normalizedEmail}.`);
};

const run = async () => {
  if (!shouldList && !email) {
    usage();
    process.exitCode = 1;
    return;
  }

  await connectToDB();

  if (shouldList) {
    await listAdmins();
  } else {
    await setAdmin(email, !shouldRevoke);
  }

  await disconnectFromDB();
};

run().catch(async (error) => {
  console.error('grantAdmin failed:', error);
  await disconnectFromDB().catch(() => {});
  process.exit(1);
});
