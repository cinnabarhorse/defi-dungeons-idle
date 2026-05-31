## Running tests

### Prerequisites

- Node 18+ and pnpm installed
- Install deps once (matches CI + avoids surprises):

```bash
pnpm install --frozen-lockfile
```

If you changed files under `data/` (e.g. characters / wearables), re-generate shared files before running tests:

```bash
pnpm generate:shared
```

### What `pnpm test:*` covers

Jest is configured via `jest.config.js` and currently discovers tests in:

- `scripts/**/*.spec.ts`
- `apps/server/src/**/*.(test|spec).ts`
- `apps/client/src/**/*.test.ts`

(`docs/` is ignored.)

### Quick start

- One-command local preflight (lint + type-check + agent tests):

```bash
pnpm verify
```

- Fast local run (skips e2e / Playwright / agent-browser):

```bash
pnpm test:fast
```

- What CI typically cares about for “agent” coverage (fast tests + snapshots):

```bash
pnpm test:agent
```

### Common commands

- Watch mode:

```bash
pnpm test:watch
```

- Run a single file:

```bash
pnpm jest -c jest.config.js apps/server/src/path/to/file.test.ts
```

- Filter by test name (regex):

```bash
pnpm jest -c jest.config.js -t "Client vs Server"
```

- Verbose, single-process (useful for debugging):

```bash
pnpm jest -c jest.config.js --runInBand --verbose
```

- Coverage (optional):

```bash
pnpm jest -c jest.config.js --coverage
```

### Notes

- If imports ever fail due to browser-only globals, ensure code paths guarded by `typeof window !== 'undefined'` are not executed at import time.
