## Goldsky deposits: connecting and querying

This project can read the Goldsky Pipeline sink for `dd-deposits` (hosted Postgres).

### 1) Configure environment

From the Goldsky UI, copy the Postgres connection string for your hosted database (`HOSTED_POSTGRES_CMI4LAYHC0`) and set it as an environment variable in the server environment:

```
GOLDSKY_DEPOSITS_DB_URL=<postgres-url>
```

Optional pool tuning (defaults are fine for most cases):

```
GOLDSKY_POOL_MAX=10
GOLDSKY_POOL_IDLE_MS=10000
GOLDSKY_POOL_CONNECT_TIMEOUT_MS=5000
GOLDSKY_POOL_MAX_USES=7500
```

Notes:

- This is used server-side only; do not expose these credentials to the client.
- SSL is enabled with permissive verification by default for hosted providers.

### 2) Query helpers (server)

Use the helpers in `apps/server/src/lib/goldsky/deposits.ts`:

- `fetchRecentDeposits(limit?: number)` – newest first
- `fetchDepositsSinceBlock(blockNumberExclusive: number, limit?: number)` – ascending from a block
- `fetchDepositsSinceTimestamp(isoTimestampExclusive: string, limit?: number)` – ascending from a timestamp

These return raw rows from `public.deposits`. Schema mirrors the Goldsky `base.raw_logs` sink (e.g., `block_number`, `log_index`, `transaction_hash`, `address`, `data`, `topics`, `block_timestamp`).

### 3) Quick test script

Run a simple smoke test:

```
pnpm tsx scripts/goldsky-deposits.ts
```

It prints a connection check and the 10 most recent rows from `public.deposits`.









