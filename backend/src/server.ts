import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';

async function start() {
  await migrate();
  const app = await createApp();
  await app.listen({ host: '0.0.0.0', port: config.port });
  const shutdown = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(async (error) => { console.error(error); await pool.end(); process.exit(1); });
