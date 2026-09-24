import mongoose from 'mongoose';

/**
 * Runs `fn(session)` in a transaction, retrying on transient errors. Every
 * query inside must pass `session`, or it runs outside the transaction.
 *
 * Requires a replica set (MongoDB Atlas is one); a standalone mongod rejects
 * transactions.
 */
export const withTransaction = (fn) => mongoose.connection.transaction(fn);
