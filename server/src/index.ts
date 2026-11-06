import { createServer } from 'node:http';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { createGoogleClient } from './lib/google.js';
import { createHub } from './realtime.js';

const config = loadConfig(process.env);
const db = createPgDb({ url: config.databaseUrl, ssl: config.databaseSsl });
const hub = createHub(config);
const app = createApp({ db, config, google: createGoogleClient(config), hub });

// An explicit http.Server (instead of app.listen) so the WebSocket hub can share the same port.
const server = createServer(app);
hub.attach(server);
server.listen(config.port, () => {
  console.log(`asta-server listening on :${config.port}`);
});

// Render sends SIGTERM on deploy; finish in-flight requests and release DB connections.
process.on('SIGTERM', () => {
  hub.close();
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
});
