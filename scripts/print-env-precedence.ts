import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

interface EnvUpdate {
  path: string;
  value: string;
}

interface KeyInfo {
  updates: EnvUpdate[];
  finalValue?: string;
  finalSource?: string;
  envValue?: string;
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readEnvFile(p: string): Record<string, string> {
  const content = fs.readFileSync(p, 'utf8');
  return dotenv.parse(content);
}

function shortPath(rootDir: string, p: string | undefined): string {
  if (!p) return '(process.env)';
  return p.startsWith(rootDir) ? p.slice(rootDir.length + 1) : p;
}

function maskSecret(value: string): string {
  const v = String(value);
  if (!v) return v;
  if (v.length <= 6) return '*'.repeat(Math.max(4, v.length));
  const start = v.slice(0, 3);
  const end = v.slice(-2);
  return `${start}${'*'.repeat(Math.max(4, v.length - 5))}${end}`;
}

function maskConnectionString(conn: string): string {
  try {
    const url = new URL(conn);
    if (url.password) {
      url.password = '********';
    }
    return url.toString();
  } catch {
    // Not a standard URL; try to redact password between : and @
    return conn
      .replace(/(\w+:)\/\//, '$1//')
      .replace(/(.*:\/\/[^:]*:)([^@]*)(@.*)/, '$1********$3');
  }
}

function isConnectionKey(key: string): boolean {
  return key === 'SUPABASE_DB_URL' || key === 'DATABASE_URL';
}

function maskByKey(key: string, value: string, unmask: boolean): string {
  if (unmask) return value;
  if (isConnectionKey(key)) return maskConnectionString(value);
  if (/PASSWORD|SECRET|KEY/i.test(key)) return maskSecret(value);
  return value;
}

function main() {
  const unmask = process.argv.includes('--unmask');

  // Derive repo root as parent of this script directory
  const repoRoot = path.resolve(__dirname, '..');
  const serverDir = path.resolve(repoRoot, 'apps', 'server');
  const cwdDir = process.cwd();

  const orderedEnvPaths = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(serverDir, '.env.local'),
    path.join(cwdDir, '.env'),
    path.join(cwdDir, '.env.local'),
  ].filter(fileExists);

  const keysOfInterest = [
    'SUPABASE_DB_URL',
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_POOL_MAX',
    'DATABASE_POOL_IDLE_MS',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'PGSSLMODE',
  ];

  const info = new Map<string, KeyInfo>();
  for (const key of keysOfInterest) {
    info.set(key, { updates: [], envValue: process.env[key] });
  }

  for (const envPath of orderedEnvPaths) {
    let parsed: Record<string, string> = {};
    try {
      parsed = readEnvFile(envPath);
    } catch {
      continue;
    }
    for (const key of keysOfInterest) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        const record = info.get(key)!;
        const value = parsed[key];
        record.updates.push({ path: envPath, value });
        record.finalValue = value;
        record.finalSource = envPath;
      }
    }
  }

  const finalSupabaseDbUrl = info.get('SUPABASE_DB_URL')?.finalValue?.trim();
  const finalDatabaseUrl = info.get('DATABASE_URL')?.finalValue?.trim();
  const selectedConn = finalSupabaseDbUrl || finalDatabaseUrl || '';
  const selectedSource = finalSupabaseDbUrl
    ? info.get('SUPABASE_DB_URL')?.finalSource
    : info.get('DATABASE_URL')?.finalSource;

  // Header
  console.log('Env file load order (later overrides earlier):');
  const displayed = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(serverDir, '.env.local'),
    path.join(cwdDir, '.env'),
    path.join(cwdDir, '.env.local'),
  ];
  for (const p of displayed) {
    console.log(
      `- ${shortPath(repoRoot, p)} ${fileExists(p) ? '' : '(missing)'}`
    );
  }

  console.log('\nValues by key (masked by default):');
  for (const key of keysOfInterest) {
    const record = info.get(key)!;
    if (record.updates.length === 0 && !record.envValue) continue;
    console.log(`\n${key}:`);
    if (record.updates.length > 0) {
      for (const u of record.updates) {
        const masked = maskByKey(key, u.value, unmask);
        console.log(`  - ${shortPath(repoRoot, u.path)} = ${masked}`);
      }
      const maskedFinal = record.finalValue
        ? maskByKey(key, record.finalValue, unmask)
        : '';
      console.log(
        `  => final from ${shortPath(repoRoot, record.finalSource)} = ${maskedFinal}`
      );
    }
    if (
      record.envValue &&
      (!record.finalSource || record.envValue !== record.finalValue)
    ) {
      const maskedEnv = maskByKey(key, record.envValue, unmask);
      console.log(
        `  - process.env ${record.finalSource ? '(additional)' : '(only)'} = ${maskedEnv}`
      );
    }
  }

  console.log('\nPostgres connection selection used by server (getPgPool):');
  if (selectedConn) {
    console.log(
      `- Selected key: ${finalSupabaseDbUrl ? 'SUPABASE_DB_URL' : 'DATABASE_URL'}`
    );
    console.log(
      `- Source file: ${shortPath(repoRoot, selectedSource || '(process.env)')}`
    );
    console.log(`- Connection: ${maskConnectionString(selectedConn)}`);
    try {
      const url = new URL(selectedConn);
      const details = {
        protocol: url.protocol.replace(':', ''),
        username: url.username || undefined,
        password: url.password ? '********' : undefined,
        host: url.hostname,
        port: url.port || undefined,
        database: url.pathname.replace(/^\//, ''),
        sslmode: url.searchParams.get('sslmode') || undefined,
      };
      console.log('- Parsed (masked):', details);
    } catch {
      console.log('- Note: could not parse connection string; custom format?');
    }
  } else {
    console.log('- No SUPABASE_DB_URL or DATABASE_URL found.');
  }

  console.log(
    '\nTip: run with --unmask to print full values (careful with secrets).'
  );
}

main();
