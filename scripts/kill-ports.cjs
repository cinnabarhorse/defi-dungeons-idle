#!/usr/bin/env node
/*
  Kill processes listening on one or more TCP ports.

  Usage:
    node scripts/kill-ports.cjs 3001 1999

  Notes:
  - Uses `lsof` (available on macOS/Linux). If `lsof` is missing, this is a no-op.
  - Intentionally uses SIGKILL to match the previous `kill -9` behavior.
*/

const { execFileSync } = require('node:child_process');

const ports = process.argv
  .slice(2)
  .map((p) => String(p).trim())
  .filter(Boolean);

if (ports.length === 0) {
  process.exit(0);
}

function pidsForPort(port) {
  try {
    // `lsof -ti :<port>` prints PIDs (one per line) for any process using the port.
    const out = execFileSync('lsof', ['-ti', `:${port}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });

    return out
      .split(/\s+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch (err) {
    // lsof missing, permission issue, or no matching processes — treat as no-op.
    return [];
  }
}

const allPids = new Set();
for (const port of ports) {
  for (const pid of pidsForPort(port)) allPids.add(pid);
}

for (const pid of allPids) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (err) {
    // Process may have already exited; ignore.
  }
}
