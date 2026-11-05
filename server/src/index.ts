import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { createGoogleClient } from './lib/google.js';

const config = loadConfig(process.env);
const db = createPgDb({ url: config.databaseUrl, ssl: config.databaseSsl });
const app = createApp({ db, config, google: createGoogleClient(config) });

const server = app.listen(config.port, () => {
  console.log(`asta-server listening on :${config.port}`);
});

// Render sends SIGTERM on deploy; finish in-flight requests and release DB connections.
process.on('SIGTERM', () => {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
});
