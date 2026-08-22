const config = require('./config');
const { createApp } = require('./app');
const { createDatabase } = require('./database');

const database = createDatabase(config.databasePath);
const app = createApp({ config, database });
const server = app.listen(config.port, () => {
  console.log(`Homelab Beacon is listening on http://localhost:${config.port}`);
});

function shutDown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));

