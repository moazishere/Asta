import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { loadSeedFoods, seedFoods } from './seed/foods.js';

// npm run seed:foods : loads server/data/foods.json into the database (idempotent).
const config = loadConfig(process.env);
const db = createPgDb({ url: config.databaseUrl, ssl: config.databaseSsl });
try {
  const foods = loadSeedFoods();
  const count = await db.asService((q) => seedFoods(q, foods));
  console.log(`seeded ${count} foods`);
} finally {
  await db.close();
}
