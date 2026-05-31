import { getPgPool } from '../../apps/server/src/lib/db/client';

async function main() {
  const pool = getPgPool();
  console.log('Running VACUUM ANALYZE on player_inventories...');
  const t0 = Date.now();
  await pool.query('VACUUM ANALYZE player_inventories');
  console.log(`Vacuum complete in ${Date.now() - t0}ms`);
  process.exit(0);
}

main().catch(console.error);

