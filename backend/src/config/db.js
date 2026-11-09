const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  logger.info(`MongoDB connected: ${mongoose.connection.host}`);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
