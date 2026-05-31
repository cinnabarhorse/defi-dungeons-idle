import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('Running VACUUM ANALYZE on player_inventories...');
  const t0 = Date.now();
  try {
    await pool.query('VACUUM ANALYZE player_inventories');
    console.log(`Vacuum complete in ${Date.now() - t0}ms`);
  } catch (error) {
    console.error('Vacuum failed:', error);
  } finally {
    await pool.end();
  }
}

main();

