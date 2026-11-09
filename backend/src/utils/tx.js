const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * Run fn inside a MongoDB transaction (Atlas supports them). `fn` receives a session (or null when
 * USE_TRANSACTIONS=false, e.g. a plain local mongod). Transient errors are retried by withTransaction.
 */
async function runInTransaction(fn) {
  if (!env.USE_TRANSACTIONS) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
