const dns = require('dns');
const env = require('./src/config/env');
const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');
const { startJobs } = require('./src/jobs');
const logger = require('./src/utils/logger');


const dnsServers = (process.env.DNS_SERVERS ?? '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (dnsServers.length) {
  dns.setServers(dnsServers);
  logger.info(`Using DNS servers: ${dnsServers.join(', ')}`);
}

async function main() {
  if (env.isProd) {
    if (!env.PAYSTACK_SECRET_KEY) logger.warn('PAYSTACK_SECRET_KEY is not set: payments are disabled.');
    if (env.SMS_PROVIDER === 'console') logger.warn('SMS_PROVIDER=console: OTP codes are only logged, not sent!');
  }

  await connectDB();
  // Make sure indexes (slug, bookingCode, paystackReference, the partial unique booking index, ...) exist.
  await Promise.all(Object.values(require('./src/models')).map((m) => m.init()));

  const server = app.listen(env.PORT, () => logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`));
  if (env.ENABLE_JOBS) startJobs();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});