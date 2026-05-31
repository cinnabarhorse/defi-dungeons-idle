import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import { DEFAULT_ADMIN_ADDRESS } from '../../constants';

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface MatchesPerDayRow {
  day: string;
  count: number;
}

export interface GetMatchesPerDayInput {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
}

export async function getMatchesPerDay(
  input: GetMatchesPerDayInput = {}
): Promise<MatchesPerDayRow[]> {
  const pool = getPool(input.client);
  // Normalize admin allowlist to lowercase for comparison
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    counts as (
      select
        date_trunc('day', coalesce(g.run_started_at, g.started_at))::date as day,
        count(*)::int as count
      from games g
      where coalesce(g.run_started_at, g.started_at) is not null
        and coalesce(g.run_started_at, g.started_at) >= $1::timestamptz
        and coalesce(g.run_started_at, g.started_at) <= $2::timestamptz
        and not exists (
          select 1
          from game_players gp
          join players p on p.id = gp.player_id
          where gp.game_id = g.id
            and lower(p.wallet_address) = any($3::text[])
        )
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(c.count, 0) as count
    from day_series ds
    left join counts c on c.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export interface TokenAllocationsPerDayRow {
  day: string;
  usdc: number;
  gho: number;
  ghst: number;
}

export interface GetTokenAllocationsPerDayInput {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
}

export async function getTokenAllocationsPerDay(
  input: GetTokenAllocationsPerDayInput = {}
): Promise<TokenAllocationsPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', d.created_at)::date as day,
        sum(case when d.token_symbol = 'USDC' then d.amount::numeric else 0 end) as usdc,
        sum(case when d.token_symbol = 'GHO' then d.amount::numeric else 0 end) as gho,
        sum(case when d.token_symbol = 'GHST' then d.amount::numeric else 0 end) as ghst
      from deposits d
      where d.created_at >= $1::timestamptz
        and d.created_at <= $2::timestamptz
        and d.tx_status = 'credited'
        and not (lower(d.depositor_address) = any($3::text[]))
        and d.token_symbol in ('USDC','GHO','GHST')
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.usdc, 0)::float8 as usdc,
      coalesce(s.gho, 0)::float8 as gho,
      coalesce(s.ghst, 0)::float8 as ghst
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{
    day: string;
    usdc: number;
    gho: number;
    ghst: number;
  }> = await pool.query(query, [fromIso, toIso, adminAllowlist]);
  return result.rows.map((r) => ({
    day: r.day,
    usdc: Number(r.usdc) || 0,
    gho: Number(r.gho) || 0,
    ghst: Number(r.ghst) || 0,
  }));
}

export interface ActiveUsersPerDayRow {
  day: string;
  dau: number;
  mau: number;
}

export interface GetActiveUsersPerDayInput {
  fromIso?: string;
  toIso?: string;
  windowDays?: number; // MAU window, default 30 days
  client?: PoolClient;
}

export async function getActiveUsersPerDay(
  input: GetActiveUsersPerDayInput = {}
): Promise<ActiveUsersPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIsoDefault = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const fromIso = input.fromIso ?? fromIsoDefault;
  const windowDays = Math.max(1, Math.min(60, input.windowDays ?? 30)); // clamp 1..60
  const baseFromIso = new Date(
    new Date(fromIso).getTime() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    per_day_players as (
      select distinct
        date_trunc('day', coalesce(g.run_started_at, g.started_at))::date as day,
        p.id as player_id
      from games g
      join game_players gp on gp.game_id = g.id
      join players p on p.id = gp.player_id
      where coalesce(g.run_started_at, g.started_at) is not null
        and coalesce(g.run_started_at, g.started_at) >= $3::timestamptz
        and coalesce(g.run_started_at, g.started_at) <= $2::timestamptz
        and (p.username is null or lower(p.username) not like 'dev-%')
        and not exists (
          select 1
          from game_players gp2
          join players p2 on p2.id = gp2.player_id
          where gp2.game_id = g.id
            and lower(p2.wallet_address) = any($4::text[])
        )
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce((
        select count(distinct pdp.player_id) from per_day_players pdp
        where pdp.day = ds.day
      ), 0)::int as dau,
      coalesce((
        select count(distinct pdp.player_id) from per_day_players pdp
        where pdp.day between (ds.day - ($5::int - 1) * interval '1 day') and ds.day
      ), 0)::int as mau
    from day_series ds
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; dau: number; mau: number }> =
    await pool.query(query, [
      fromIso,
      toIso,
      baseFromIso,
      adminAllowlist,
      windowDays,
    ]);
  return result.rows.map((r) => ({
    day: r.day,
    dau: Number(r.dau) || 0,
    mau: Number(r.mau) || 0,
  }));
}

export interface DailyCountRow {
  day: string;
  count: number;
}

export interface GetDailyCountsInput {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
}

export interface CurrencyTotalsPerDayRow {
  day: string;
  usdc: number;
  ghst: number;
}

export interface GetCurrencyTotalsPerDayInput {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
}

export async function getDailyRunsUsed(
  input: GetDailyCountsInput = {}
): Promise<DailyCountRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        pdr.date::date as day,
        sum(pdr.used_runs)::int as count
      from player_daily_runs pdr
      join players p on p.id = pdr.account_id
      where pdr.date::date >= $1::timestamptz::date
        and pdr.date::date <= $2::timestamptz::date
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.count, 0) as count
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export async function getCompetitionRunsUsed(
  input: GetDailyCountsInput = {}
): Promise<DailyCountRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    counts as (
      select
        dql.date::date as day,
        count(*)::int as count
      from daily_quest_leaderboard dql
      join players p on p.id = dql.account_id
      where dql.date >= $1::timestamptz::date
        and dql.date <= $2::timestamptz::date
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(c.count, 0) as count
    from day_series ds
    left join counts c on c.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export async function getWithdrawalsPerDay(
  input: GetCurrencyTotalsPerDayInput = {}
): Promise<CurrencyTotalsPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', tw.created_at)::date as day,
        sum(case when tw.currency = 'USDC' then tw.amount::numeric else 0 end) as usdc,
        sum(case when tw.currency = 'GHST' then tw.amount::numeric else 0 end) as ghst
      from token_withdrawals tw
      join players p on p.id = tw.player_id
      where tw.created_at >= $1::timestamptz
        and tw.created_at <= $2::timestamptz
        and tw.status = 'withdrawal_confirmed'
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.usdc, 0)::float8 as usdc,
      coalesce(s.ghst, 0)::float8 as ghst
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; usdc: number; ghst: number }> =
    await pool.query(query, [fromIso, toIso, adminAllowlist]);
  return result.rows.map((r) => ({
    day: r.day,
    usdc: Number(r.usdc) || 0,
    ghst: Number(r.ghst) || 0,
  }));
}

export async function getDepositsPerDay(
  input: GetCurrencyTotalsPerDayInput = {}
): Promise<CurrencyTotalsPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', d.created_at)::date as day,
        sum(case when d.token_symbol = 'USDC' then d.amount::numeric else 0 end) as usdc,
        sum(case when d.token_symbol = 'GHST' then d.amount::numeric else 0 end) as ghst
      from deposits d
      where d.created_at >= $1::timestamptz
        and d.created_at <= $2::timestamptz
        and d.tx_status = 'confirmed'
        and not (lower(d.depositor_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.usdc, 0)::float8 as usdc,
      coalesce(s.ghst, 0)::float8 as ghst
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; usdc: number; ghst: number }> =
    await pool.query(query, [fromIso, toIso, adminAllowlist]);
  return result.rows.map((r) => ({
    day: r.day,
    usdc: Number(r.usdc) || 0,
    ghst: Number(r.ghst) || 0,
  }));
}

export async function getXpGainedPerDay(
  input: GetDailyCountsInput = {}
): Promise<DailyCountRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', coalesce(g.run_started_at, g.started_at))::date as day,
        sum(gp.xp_gained)::bigint as count
      from game_players gp
      join games g on g.id = gp.game_id
      join players p on p.id = gp.player_id
      where coalesce(g.run_started_at, g.started_at) is not null
        and coalesce(g.run_started_at, g.started_at) >= $1::timestamptz
        and coalesce(g.run_started_at, g.started_at) <= $2::timestamptz
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.count, 0) as count
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export async function getFloorsClearedPerDay(
  input: GetDailyCountsInput = {}
): Promise<DailyCountRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', coalesce(g.run_started_at, g.started_at))::date as day,
        sum(g.floor_reached)::int as count
      from games g
      where coalesce(g.run_started_at, g.started_at) is not null
        and coalesce(g.run_started_at, g.started_at) >= $1::timestamptz
        and coalesce(g.run_started_at, g.started_at) <= $2::timestamptz
        and not exists (
          select 1
          from game_players gp
          join players p on p.id = gp.player_id
          where gp.game_id = g.id
            and lower(p.wallet_address) = any($3::text[])
        )
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.count, 0) as count
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export async function getEnemyKillsPerDay(
  input: GetDailyCountsInput = {}
): Promise<DailyCountRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', coalesce(g.run_started_at, g.started_at))::date as day,
        sum(gp.kills)::int as count
      from game_players gp
      join games g on g.id = gp.game_id
      join players p on p.id = gp.player_id
      where coalesce(g.run_started_at, g.started_at) is not null
        and coalesce(g.run_started_at, g.started_at) >= $1::timestamptz
        and coalesce(g.run_started_at, g.started_at) <= $2::timestamptz
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.count, 0) as count
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result: QueryResult<{ day: string; count: number }> = await pool.query(
    query,
    [fromIso, toIso, adminAllowlist]
  );
  return result.rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}

export interface TradeRunTokensPerDayRow {
  day: string;
  btc: number;
  eth: number;
  ghst: number;
}

export interface TradeRunDirectionsPerDayRow {
  day: string;
  long: number;
  short: number;
}

export interface TradeRunLeverageCount {
  leverage: number;
  count: number;
}

export interface TradeRunLeveragePerDayRow {
  day: string;
  leverageCounts: TradeRunLeverageCount[];
}

export async function getTradeRunTokensPerDay(
  input: GetDailyCountsInput = {}
): Promise<TradeRunTokensPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', ctr.created_at)::date as day,
        sum(case when upper(ctr.token) = 'BTC' then 1 else 0 end)::int as btc,
        sum(case when upper(ctr.token) = 'ETH' then 1 else 0 end)::int as eth,
        sum(case when upper(ctr.token) = 'GHST' then 1 else 0 end)::int as ghst
      from competition_trade_runs ctr
      join players p on p.id = ctr.account_id
      where ctr.created_at >= $1::timestamptz
        and ctr.created_at <= $2::timestamptz
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.btc, 0) as btc,
      coalesce(s.eth, 0) as eth,
      coalesce(s.ghst, 0) as ghst
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{
    day: string;
    btc: number;
    eth: number;
    ghst: number;
  }>(query, [fromIso, toIso, adminAllowlist]);

  return result.rows.map((row) => ({
    day: row.day,
    btc: Number(row.btc) || 0,
    eth: Number(row.eth) || 0,
    ghst: Number(row.ghst) || 0,
  }));
}

export async function getTradeRunDirectionsPerDay(
  input: GetDailyCountsInput = {}
): Promise<TradeRunDirectionsPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', ctr.created_at)::date as day,
        sum(case when lower(ctr.direction) = 'long' then 1 else 0 end)::int as long,
        sum(case when lower(ctr.direction) = 'short' then 1 else 0 end)::int as short
      from competition_trade_runs ctr
      join players p on p.id = ctr.account_id
      where ctr.created_at >= $1::timestamptz
        and ctr.created_at <= $2::timestamptz
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.long, 0) as long,
      coalesce(s.short, 0) as short
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{
    day: string;
    long: number;
    short: number;
  }>(query, [fromIso, toIso, adminAllowlist]);

  return result.rows.map((row) => ({
    day: row.day,
    long: Number(row.long) || 0,
    short: Number(row.short) || 0,
  }));
}

export async function getTradeRunLeveragePerDay(
  input: GetDailyCountsInput = {}
): Promise<TradeRunLeveragePerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    leverage_counts as (
      select
        date_trunc('day', ctr.created_at)::date as day,
        least(20, greatest(1, round(coalesce(ctr.risk_leverage, 1)::numeric)))::int as leverage,
        count(*)::int as count
      from competition_trade_runs ctr
      join players p on p.id = ctr.account_id
      where ctr.created_at >= $1::timestamptz
        and ctr.created_at <= $2::timestamptz
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1, 2
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'leverage', lc.leverage,
            'count', lc.count
          )
          order by lc.leverage
        ) filter (where lc.leverage is not null),
        '[]'::jsonb
      ) as leverage_counts
    from day_series ds
    left join leverage_counts lc on lc.day = ds.day
    group by ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{
    day: string;
    leverage_counts: unknown;
  }>(query, [fromIso, toIso, adminAllowlist]);

  return result.rows.map((row) => ({
    day: row.day,
    leverageCounts: Array.isArray(row.leverage_counts)
      ? row.leverage_counts.map((entry) => ({
          leverage: Number((entry as { leverage?: unknown }).leverage) || 0,
          count: Number((entry as { count?: unknown }).count) || 0,
        }))
      : [],
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Daily Summary (for Discord notifications)
// ────────────────────────────────────────────────────────────────────────────

export interface DailySummary {
  date: string;
  runsCompleted: number;
  dau: number;
  competitionRunsCompleted: number;
  competitionDau: number;
  highestScore: number | null;
  highestScorePlayer: string | null;
  highestScorePlayerUsername: string | null;
}

export interface GetDailySummaryInput {
  date: string; // YYYY-MM-DD format
  client?: PoolClient;
}

export async function getDailySummary(
  input: GetDailySummaryInput
): Promise<DailySummary> {
  const pool = getPool(input.client);
  const { date } = input;

  // Normalize admin allowlist to lowercase for comparison
  const adminAllowlist = (
    process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Single query to get all stats for a specific day
  const query = `
    with day_games as (
      -- Get all games started on the target date, excluding admin games
      select g.id
      from games g
      where date_trunc('day', coalesce(g.run_started_at, g.started_at))::date = $1::date
        and coalesce(g.run_started_at, g.started_at) is not null
        and not exists (
          select 1
          from game_players gp
          join players p on p.id = gp.player_id
          where gp.game_id = g.id
            and lower(p.wallet_address) = any($2::text[])
        )
    ),
    runs_completed as (
      select count(*)::int as count
      from day_games
    ),
    unique_players as (
      select count(distinct gp.player_id)::int as count
      from day_games dg
      join game_players gp on gp.game_id = dg.id
    ),
    competition_entries as (
      select dql.account_id
      from daily_quest_leaderboard dql
      join players p on p.id = dql.account_id
      where dql.date = $1::date
        and not (lower(p.wallet_address) = any($2::text[]))
    ),
    competition_stats as (
      select
        count(*)::int as runs_completed,
        count(distinct account_id)::int as dau
      from competition_entries
    ),
    highest_score as (
      select 
        rs.score,
        rs.player_id,
        p.username,
        p.wallet_address
      from run_scores rs
      join day_games dg on rs.game_id = dg.id
      join players p on p.id = rs.player_id
      where rs.score is not null
      order by rs.score desc
      limit 1
    )
    select
      (select count from runs_completed) as runs_completed,
      (select count from unique_players) as dau,
      (select runs_completed from competition_stats) as competition_runs_completed,
      (select dau from competition_stats) as competition_dau,
      (select score from highest_score) as highest_score,
      (select player_id from highest_score) as highest_score_player_id,
      (select coalesce(username, left(wallet_address, 8) || '...') from highest_score) as highest_score_player_name
  `;

  const result = await pool.query<{
    runs_completed: number;
    dau: number;
    competition_runs_completed: number;
    competition_dau: number;
    highest_score: number | null;
    highest_score_player_id: string | null;
    highest_score_player_name: string | null;
  }>(query, [date, adminAllowlist]);

  const row = result.rows[0];

  return {
    date,
    runsCompleted: Number(row?.runs_completed) || 0,
    dau: Number(row?.dau) || 0,
    competitionRunsCompleted: Number(row?.competition_runs_completed) || 0,
    competitionDau: Number(row?.competition_dau) || 0,
    highestScore: row?.highest_score != null ? Number(row.highest_score) : null,
    highestScorePlayer: row?.highest_score_player_id ?? null,
    highestScorePlayerUsername: row?.highest_score_player_name ?? null,
  };
}

export interface CurrencyDeltaPerDayRow {
  day: string;
  earned: number;
  spent: number;
  net: number;
}

export interface CurrencyTotalPerDayRow {
  day: string;
  total: number;
}

export interface ForgeCountsPerDayByRarityRow {
  day: string;
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
  mythical: number;
  godlike: number;
}

export interface GoldSpendEventRow {
  day: string;
  delta: number;
  metadata: Record<string, unknown>;
}

export interface DailyCountPerDayRow {
  day: string;
  count: number;
}

export interface GetCurrencyFlowPerDayInput {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
}

function buildAdminAllowlist() {
  return (process.env.ADMIN_WALLET_ALLOWLIST || DEFAULT_ADMIN_ADDRESS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function subtractCurrencyTotalsSeries(
  base: CurrencyTotalPerDayRow[],
  deduction: CurrencyTotalPerDayRow[]
): CurrencyTotalPerDayRow[] {
  const deductionByDay = new Map(
    deduction.map((row) => [row.day, Number(row.total) || 0])
  );
  return base.map((row) => ({
    day: row.day,
    total: (Number(row.total) || 0) - (deductionByDay.get(row.day) ?? 0),
  }));
}

function toSourceMatchers(sources: string[]) {
  return sources.map((source) => source.trim().toLowerCase()).filter(Boolean);
}

async function getFungibleCurrencyFlowPerDay(params: {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
  itemTypeMatchers: string[];
  itemNameMatchers: string[];
}): Promise<CurrencyDeltaPerDayRow[]> {
  const pool = getPool(params.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = params.toIso ?? nowIso;
  const fromIso =
    params.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    filtered_events as (
      select
        date_trunc('day', e.created_at)::date as day,
        e.delta::numeric as delta
      from player_inventory_events e
      join players p on p.id = e.player_id
      where e.created_at >= $1::timestamptz
        and e.created_at <= $2::timestamptz
        and lower(trim(e.item_type)) = any($3::text[])
        and lower(trim(e.item_name)) = any($4::text[])
        and not (lower(p.wallet_address) = any($5::text[]))
    ),
    sums as (
      select
        day,
        sum(case when delta > 0 then delta else 0 end) as earned,
        sum(case when delta < 0 then -delta else 0 end) as spent,
        sum(delta) as net
      from filtered_events
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.earned, 0)::float8 as earned,
      coalesce(s.spent, 0)::float8 as spent,
      coalesce(s.net, 0)::float8 as net
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{ day: string; earned: number; spent: number; net: number }>(query, [
    fromIso,
    toIso,
    params.itemTypeMatchers,
    params.itemNameMatchers,
    adminAllowlist,
  ]);

  return result.rows.map((r) => ({
    day: r.day,
    earned: Number(r.earned) || 0,
    spent: Number(r.spent) || 0,
    net: Number(r.net) || 0,
  }));
}

async function getFungibleCurrencyTotalPerDay(params: {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
  itemTypeMatchers: string[];
  itemNameMatchers: string[];
  excludedReasons?: string[];
}): Promise<CurrencyTotalPerDayRow[]> {
  const pool = getPool(params.client);
  const adminAllowlist = buildAdminAllowlist();
  const excludedReasons = (params.excludedReasons ?? [])
    .map((reason) => reason.trim().toLowerCase())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  const toIso = params.toIso ?? nowIso;
  const fromIso =
    params.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    filtered_events as (
      select
        e.created_at,
        date_trunc('day', e.created_at)::date as day,
        e.delta::numeric as delta
      from player_inventory_events e
      join players p on p.id = e.player_id
      where lower(trim(e.item_type)) = any($3::text[])
        and lower(trim(e.item_name)) = any($4::text[])
        and not (coalesce(lower(trim(e.reason)), '') = any($5::text[]))
        and not (lower(p.wallet_address) = any($6::text[]))
    ),
    starting as (
      select coalesce(sum(delta), 0)::numeric as total
      from filtered_events
      where created_at < $1::timestamptz
    ),
    per_day as (
      select day, coalesce(sum(delta), 0)::numeric as net
      from filtered_events
      where created_at >= $1::timestamptz
        and created_at <= $2::timestamptz
      group by 1
    ),
    filled as (
      select
        ds.day,
        coalesce(pd.net, 0)::numeric as net
      from day_series ds
      left join per_day pd on pd.day = ds.day
      order by ds.day asc
    )
    select
      to_char(day, 'YYYY-MM-DD') as day,
      (
        (select total from starting)
        + sum(net) over (order by day asc rows between unbounded preceding and current row)
      )::float8 as total
    from filled
    order by day asc
  `;

  const result = await pool.query<{ day: string; total: number }>(query, [
    fromIso,
    toIso,
    params.itemTypeMatchers,
    params.itemNameMatchers,
    excludedReasons,
    adminAllowlist,
  ]);

  return result.rows.map((r) => ({
    day: r.day,
    total: Number(r.total) || 0,
  }));
}

async function getEconomyCurrencySpendPerDay(params: {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
  currency: string;
  sources: string[];
}): Promise<DailyCountRow[]> {
  const pool = getPool(params.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = params.toIso ?? nowIso;
  const fromIso =
    params.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', et.created_at)::date as day,
        sum(et.amount::numeric)::float8 as count
      from economy_transactions et
      join players p on p.id = et.player_id
      where et.created_at >= $1::timestamptz
        and et.created_at <= $2::timestamptz
        and lower(trim(et.currency)) = lower($3)
        and lower(trim(et.source)) = any($4::text[])
        and not (lower(p.wallet_address) = any($5::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.count, 0)::float8 as count
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{ day: string; count: number }>(query, [
    fromIso,
    toIso,
    params.currency,
    toSourceMatchers(params.sources),
    adminAllowlist,
  ]);

  return result.rows.map((row) => ({
    day: row.day,
    count: Number(row.count) || 0,
  }));
}

async function getEconomyCurrencySpendTotalPerDay(params: {
  fromIso?: string;
  toIso?: string;
  client?: PoolClient;
  currency: string;
  sources: string[];
}): Promise<CurrencyTotalPerDayRow[]> {
  const pool = getPool(params.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = params.toIso ?? nowIso;
  const fromIso =
    params.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    filtered_spend as (
      select
        et.created_at,
        date_trunc('day', et.created_at)::date as day,
        et.amount::numeric as amount
      from economy_transactions et
      join players p on p.id = et.player_id
      where lower(trim(et.currency)) = lower($3)
        and lower(trim(et.source)) = any($4::text[])
        and not (lower(p.wallet_address) = any($5::text[]))
    ),
    starting as (
      select coalesce(sum(amount), 0)::numeric as total
      from filtered_spend
      where created_at < $1::timestamptz
    ),
    per_day as (
      select day, coalesce(sum(amount), 0)::numeric as total
      from filtered_spend
      where created_at >= $1::timestamptz
        and created_at <= $2::timestamptz
      group by 1
    ),
    filled as (
      select
        ds.day,
        coalesce(pd.total, 0)::numeric as total
      from day_series ds
      left join per_day pd on pd.day = ds.day
      order by ds.day asc
    )
    select
      to_char(day, 'YYYY-MM-DD') as day,
      (
        (select total from starting)
        + sum(total) over (order by day asc rows between unbounded preceding and current row)
      )::float8 as total
    from filled
    order by day asc
  `;

  const result = await pool.query<{ day: string; total: number }>(query, [
    fromIso,
    toIso,
    params.currency,
    toSourceMatchers(params.sources),
    adminAllowlist,
  ]);

  return result.rows.map((row) => ({
    day: row.day,
    total: Number(row.total) || 0,
  }));
}

const GOLD_ITEM_TYPES = ['coin', 'gold_coin', 'gold'];
const GOLD_ITEM_NAMES = ['gold', 'gold coin'];
const LICK_TONGUE_ITEM_TYPES = ['material', 'lick_tongue'];
const LICK_TONGUE_ITEM_NAMES = ['lick tongue', 'lick_tongue'];

export async function getGoldFlowPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<CurrencyDeltaPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    inventory_events as (
      select
        date_trunc('day', e.created_at)::date as day,
        e.delta::numeric as delta
      from player_inventory_events e
      join players p on p.id = e.player_id
      where e.created_at >= $1::timestamptz
        and e.created_at <= $2::timestamptz
        and e.reason is distinct from 'wearable_repair'
        and lower(trim(e.item_type)) = any($3::text[])
        and lower(trim(e.item_name)) = any($4::text[])
        and not (lower(p.wallet_address) = any($5::text[]))
    ),
    repair_transactions as (
      select
        date_trunc('day', t.created_at)::date as day,
        -t.amount::numeric as delta
      from economy_transactions t
      join players p on p.id = t.player_id
      where t.created_at >= $1::timestamptz
        and t.created_at <= $2::timestamptz
        and t.source = 'wearable_repair'
        and lower(trim(t.currency)) = 'gold'
        and not (lower(p.wallet_address) = any($5::text[]))
    ),
    filtered_events as (
      select day, delta from inventory_events
      union all
      select day, delta from repair_transactions
    ),
    sums as (
      select
        day,
        sum(case when delta > 0 then delta else 0 end) as earned,
        sum(case when delta < 0 then -delta else 0 end) as spent,
        sum(delta) as net
      from filtered_events
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.earned, 0)::float8 as earned,
      coalesce(s.spent, 0)::float8 as spent,
      coalesce(s.net, 0)::float8 as net
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<{
    day: string;
    earned: number;
    spent: number;
    net: number;
  }>(query, [fromIso, toIso, GOLD_ITEM_TYPES, GOLD_ITEM_NAMES, adminAllowlist]);

  return result.rows.map((row) => ({
    day: row.day,
    earned: Number(row.earned) || 0,
    spent: Number(row.spent) || 0,
    net: Number(row.net) || 0,
  }));
}

export async function getGoldSpendEvents(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<GoldSpendEventRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    select
      to_char(date_trunc('day', e.created_at)::date, 'YYYY-MM-DD') as day,
      e.delta::numeric as delta,
      e.metadata
    from player_inventory_events e
    join players p on p.id = e.player_id
    where e.created_at >= $1::timestamptz
      and e.created_at <= $2::timestamptz
      and e.delta < 0
      and e.reason is distinct from 'wearable_repair'
      and lower(trim(e.item_type)) = any($3::text[])
      and lower(trim(e.item_name)) = any($4::text[])
      and not (lower(p.wallet_address) = any($5::text[]))
    order by e.created_at asc
  `;

  const result = await pool.query<{
    day: string;
    delta: number;
    metadata: unknown;
  }>(query, [fromIso, toIso, GOLD_ITEM_TYPES, GOLD_ITEM_NAMES, adminAllowlist]);

  return result.rows.map((row) => ({
    day: row.day,
    delta: Number(row.delta) || 0,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}

export async function getRepairItemsPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<DailyCountPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    counts as (
      select
        date_trunc('day', t.created_at)::date as day,
        sum(
          case
            when jsonb_typeof(t.metadata->'items') = 'array'
              then jsonb_array_length(t.metadata->'items')
            else 0
          end
        )::int as count
      from economy_transactions t
      join players p on p.id = t.player_id
      where t.created_at >= $1::timestamptz
        and t.created_at <= $2::timestamptz
        and t.source = 'wearable_repair'
        and lower(trim(t.currency)) = 'gold'
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(c.count, 0) as count
    from day_series ds
    left join counts c on c.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<DailyCountPerDayRow>(query, [
    fromIso,
    toIso,
    adminAllowlist,
  ]);

  return result.rows.map((row) => ({
    day: row.day,
    count: Number(row.count) || 0,
  }));
}

export async function getRepairGoldSpentPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<DailyCountPerDayRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    counts as (
      select
        date_trunc('day', t.created_at)::date as day,
        sum(case when t.amount > 0 then t.amount else 0 end)::float8 as count
      from economy_transactions t
      join players p on p.id = t.player_id
      where t.created_at >= $1::timestamptz
        and t.created_at <= $2::timestamptz
        and t.source = 'wearable_repair'
        and lower(trim(t.currency)) = 'gold'
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(c.count, 0)::float8 as count
    from day_series ds
    left join counts c on c.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<DailyCountPerDayRow>(query, [
    fromIso,
    toIso,
    adminAllowlist,
  ]);

  return result.rows.map((row) => ({
    day: row.day,
    count: Number(row.count) || 0,
  }));
}

export async function getGoldTotalPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<CurrencyTotalPerDayRow[]> {
  const [inventoryTotals, repairSpendTotals, forgeSpendTotals] = await Promise.all([
    getFungibleCurrencyTotalPerDay({
      fromIso: input.fromIso,
      toIso: input.toIso,
      client: input.client,
      itemTypeMatchers: GOLD_ITEM_TYPES,
      itemNameMatchers: GOLD_ITEM_NAMES,
      excludedReasons: ['wearable_repair'],
    }),
    getEconomyCurrencySpendTotalPerDay({
      fromIso: input.fromIso,
      toIso: input.toIso,
      client: input.client,
      currency: 'Gold',
      sources: ['wearable_repair'],
    }),
    getEconomyCurrencySpendTotalPerDay({
      fromIso: input.fromIso,
      toIso: input.toIso,
      client: input.client,
      currency: 'Gold',
      sources: ['wearable_forge'],
    }),
  ]);

  return subtractCurrencyTotalsSeries(
    subtractCurrencyTotalsSeries(inventoryTotals, repairSpendTotals),
    forgeSpendTotals
  );
}

export async function getForgeGoldSpentPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<DailyCountRow[]> {
  return getEconomyCurrencySpendPerDay({
    fromIso: input.fromIso,
    toIso: input.toIso,
    client: input.client,
    currency: 'Gold',
    sources: ['wearable_forge'],
  });
}

export async function getForgeCountsPerDayByRarity(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<ForgeCountsPerDayByRarityRow[]> {
  const pool = getPool(input.client);
  const adminAllowlist = buildAdminAllowlist();
  const nowIso = new Date().toISOString();
  const toIso = input.toIso ?? nowIso;
  const fromIso =
    input.fromIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    with day_series as (
      select generate_series(
        $1::timestamptz::date,
        $2::timestamptz::date,
        interval '1 day'
      )::date as day
    ),
    sums as (
      select
        date_trunc('day', et.created_at)::date as day,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'common' then 1 else 0 end)::int as common,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'uncommon' then 1 else 0 end)::int as uncommon,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'rare' then 1 else 0 end)::int as rare,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'legendary' then 1 else 0 end)::int as legendary,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'mythical' then 1 else 0 end)::int as mythical,
        sum(case when lower(coalesce(et.metadata->>'rarity', '')) = 'godlike' then 1 else 0 end)::int as godlike
      from economy_transactions et
      join players p on p.id = et.player_id
      where et.created_at >= $1::timestamptz
        and et.created_at <= $2::timestamptz
        and lower(trim(et.source)) = 'wearable_forge'
        and lower(trim(et.currency)) = 'gold'
        and not (lower(p.wallet_address) = any($3::text[]))
      group by 1
    )
    select
      to_char(ds.day, 'YYYY-MM-DD') as day,
      coalesce(s.common, 0) as common,
      coalesce(s.uncommon, 0) as uncommon,
      coalesce(s.rare, 0) as rare,
      coalesce(s.legendary, 0) as legendary,
      coalesce(s.mythical, 0) as mythical,
      coalesce(s.godlike, 0) as godlike
    from day_series ds
    left join sums s on s.day = ds.day
    order by ds.day asc
  `;

  const result = await pool.query<ForgeCountsPerDayByRarityRow>(query, [
    fromIso,
    toIso,
    adminAllowlist,
  ]);

  return result.rows.map((row) => ({
    day: row.day,
    common: Number(row.common) || 0,
    uncommon: Number(row.uncommon) || 0,
    rare: Number(row.rare) || 0,
    legendary: Number(row.legendary) || 0,
    mythical: Number(row.mythical) || 0,
    godlike: Number(row.godlike) || 0,
  }));
}

export async function getLickTongueFlowPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<CurrencyDeltaPerDayRow[]> {
  return getFungibleCurrencyFlowPerDay({
    fromIso: input.fromIso,
    toIso: input.toIso,
    client: input.client,
    itemTypeMatchers: LICK_TONGUE_ITEM_TYPES,
    itemNameMatchers: LICK_TONGUE_ITEM_NAMES,
  });
}

export async function getLickTongueTotalPerDay(
  input: GetCurrencyFlowPerDayInput = {}
): Promise<CurrencyTotalPerDayRow[]> {
  return getFungibleCurrencyTotalPerDay({
    fromIso: input.fromIso,
    toIso: input.toIso,
    client: input.client,
    itemTypeMatchers: LICK_TONGUE_ITEM_TYPES,
    itemNameMatchers: LICK_TONGUE_ITEM_NAMES,
  });
}
