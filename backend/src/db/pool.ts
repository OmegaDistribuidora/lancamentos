import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  options: '-c timezone=America/Fortaleza',
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 60_000,
});
