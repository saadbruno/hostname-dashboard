const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

const required = ['DASHBOARD_USERNAME', 'DASHBOARD_PASSWORD', 'WEBHOOK_TOKEN', 'SESSION_SECRET'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const offlineAfterMinutes = Number.parseInt(process.env.OFFLINE_AFTER_MINUTES || '15', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (!Number.isInteger(offlineAfterMinutes) || offlineAfterMinutes < 1) {
  throw new Error('OFFLINE_AFTER_MINUTES must be a positive integer');
}

module.exports = {
  port,
  username: process.env.DASHBOARD_USERNAME,
  password: process.env.DASHBOARD_PASSWORD,
  webhookToken: process.env.WEBHOOK_TOKEN,
  sessionSecret: process.env.SESSION_SECRET,
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/hostname-dashboard.db'),
  offlineAfterMinutes,
  trustProxy: process.env.TRUST_PROXY === 'true',
  secureCookies: process.env.SECURE_COOKIES
    ? process.env.SECURE_COOKIES === 'true'
    : process.env.NODE_ENV === 'production',
};
