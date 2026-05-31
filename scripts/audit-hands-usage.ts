import { Pool } from 'pg';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!url) {
    throw new Error('DATABASE_URL (or SUPABASE_DB_URL) is required');
  }
  return url;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const client = await pool.connect();
  try {
    const eqCounts = await client.query(
      `select count(*)::int as row_count,
              count(distinct player_id)::int as player_count
         from player_equipment
        where slot = 'hands'`
    );

    const eqTop = await client.query(
      `select player_id, count(*)::int as row_count
         from player_equipment
        where slot = 'hands'
        group by 1
        order by row_count desc
        limit 20`
    );

    const playersWithHandsSigs = await client.query(
      `select count(*)::int as player_count
         from players p
        where exists (
          select 1
            from jsonb_array_elements_text(p.equipped_wearables) as elem
           where elem like 'hands::%'
        )`
    );

    const totalHandsSigs = await client.query(
      `select coalesce(sum(cnt), 0)::int as signature_count
         from (
           select count(*) as cnt
             from players p,
                  jsonb_array_elements_text(p.equipped_wearables) as elem
            where elem like 'hands::%'
            group by p.id
         ) s`
    );

    const sampleHandsSigs = await client.query(
      `select p.id as player_id,
              jsonb_agg(elem) as hands_signatures
         from players p,
              jsonb_array_elements_text(p.equipped_wearables) as elem
        where elem like 'hands::%'
        group by p.id
        order by jsonb_array_length(jsonb_agg(elem)) desc
        limit 10`
    );

    console.log('=== Audit: legacy "hands" usage ===');
    console.log('player_equipment rows with slot="hands"');
    console.log({
      rows: eqCounts.rows[0]?.row_count ?? 0,
      players: eqCounts.rows[0]?.player_count ?? 0,
    });

    console.log('Top players with slot="hands" in player_equipment (up to 20)');
    console.table(eqTop.rows);

    console.log('players with any equipped_wearables entry like "hands::%"');
    console.log({ players: playersWithHandsSigs.rows[0]?.player_count ?? 0 });

    console.log('total number of "hands::%" signatures across all players');
    console.log({ total: totalHandsSigs.rows[0]?.signature_count ?? 0 });

    console.log('sample players with "hands::%" signatures (up to 10)');
    console.table(sampleHandsSigs.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[audit-hands-usage] failed', err);
  process.exitCode = 1;
});
