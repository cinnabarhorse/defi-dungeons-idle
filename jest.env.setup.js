const { config: loadEnv } = require('dotenv');

loadEnv({ path: '.env.test', override: false, quiet: true });
loadEnv({ path: '.env', override: false, quiet: true });

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SIM_SEED = process.env.SIM_SEED || '12345';
process.env.GOTCHI_SPRITES_BACKEND =
  process.env.GOTCHI_SPRITES_BACKEND || 'mock';

process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.SUPABASE_DB_URL =
  process.env.SUPABASE_DB_URL || 'postgres://localhost/defi_dungeons_test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'test-client-id';
