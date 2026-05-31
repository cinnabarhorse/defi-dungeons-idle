import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.11.1';

const BASE_CHAIN_ID = 8453;
const GAMEPOINTS_CONTRACT_ADDRESS =
  '0xb27fa55e15be89e69b9e5babcfb30a8f67ad92a0';

interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
}

const TOKENS: TokenConfig[] = [
  {
    symbol: 'USDC',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  {
    symbol: 'GHO',
    address: '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee',
    decimals: 18,
  },
];

const SUPPORTED_TOKEN_ADDRESSES = TOKENS.reduce(
  (acc, token) => {
    acc[token.address.toLowerCase()] = token;
    return acc;
  },
  {} as Record<string, TokenConfig>
);

function normalizeAddress(addr: string): string {
  if (!addr) return '';
  let normalized = addr.toLowerCase();
  if (normalized.startsWith('\\x')) {
    normalized = '0x' + normalized.substring(2);
  }
  return normalized;
}

function getTokenByAddress(address: string): TokenConfig | null {
  if (!address) return null;
  const normalized = normalizeAddress(address);
  return SUPPORTED_TOKEN_ADDRESSES[normalized] ?? null;
}

interface GoldskyWebhookPayload {
  op: string;
  data: {
    old: unknown;
    new: GoldskyDeposit;
  };
  entity: string;
}

interface GoldskyDeposit {
  id: string;
  deposit_id: string;
  user: string;
  token: string;
  amount: string;
  yield_amount: string;
  points_minted: string;
  unlock_at: string;
  withdrawn: boolean;
  withdrawal_tx: string | null;
  timestamp: string;
  tx_hash: string;
}

function parseTimestamp(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Handle Postgres hex format
    if (value.startsWith('\\x')) {
      return Number(BigInt('0x' + value.substring(2)));
    }
    if (value.startsWith('0x')) {
      return Number(BigInt(value));
    }
    return Number(value);
  }
  return 0;
}

Deno.serve(async (req: Request) => {
  try {
    // Basic auth check
    const secret = req.headers.get('x-goldsky-webhook-secret');
    const expectedSecret = Deno.env.get('GOLDSKY_WEBHOOK_SECRET');

    if (expectedSecret && secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as GoldskyWebhookPayload;

    if (body.entity.toLowerCase() !== 'deposit' || body.op !== 'INSERT') {
      // Ignore updates or other entities for now
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const entity = body.data.new;
    console.log('Raw entity:', JSON.stringify(entity));

    // Normalize entity fields that might be in Postgres hex format (\x...)
    entity.token = normalizeAddress(entity.token);
    entity.user = normalizeAddress(entity.user);
    entity.tx_hash = normalizeAddress(entity.tx_hash);

    const tokenMeta = getTokenByAddress(entity.token);

    if (!tokenMeta) {
      console.error(`Unsupported token: ${entity.token}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Unsupported token' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const txHash = entity.tx_hash.toLowerCase();
    const depositId = entity.deposit_id;
    const pointsMinted = entity.points_minted;
    const amountWei = entity.amount;
    const amountDecimal = ethers.formatUnits(amountWei, tokenMeta.decimals);

    console.log(`Processing deposit: ${depositId} for user ${entity.user}`);

    // First, ensure the deposit record exists and is up to date
    // Check for existing deposit with this tx_hash
    const { data: existing, error: fetchError } = await supabase
      .from('deposits')
      .select('id, tx_status, points_minted')
      .eq('tx_hash', txHash)
      .maybeSingle();

    if (fetchError) {
      console.error('DB Fetch Error:', fetchError);
      throw fetchError;
    }

    let dbDepositId = existing?.id;

    if (existing) {
      if (existing.tx_status === 'credited') {
        return new Response(
          JSON.stringify({ ok: true, skipped: 'Already credited' }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Update existing record (e.g. from pending -> confirmed)
      const { error: updateError } = await supabase
        .from('deposits')
        .update({
          tx_status: 'confirmed',
          deposit_id: depositId,
          yield_amount: entity.yield_amount,
          // We intentionally DON'T set points_minted here yet if we want to trigger credit via RPC,
          // but our RPC below handles both confirmed and pending states.
          // Actually, let's update everything except status=credited.
          points_minted: pointsMinted,
          unlock_at:
            entity.unlock_at && entity.unlock_at !== '0'
              ? new Date(parseTimestamp(entity.unlock_at) * 1000).toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('DB Update Error:', updateError);
        throw updateError;
      }
    } else {
      // Insert new record
      console.log('Inserting new deposit record...');
      const { data: inserted, error: insertError } = await supabase
        .from('deposits')
        .insert({
          chain_id: BASE_CHAIN_ID,
          contract_address: GAMEPOINTS_CONTRACT_ADDRESS.toLowerCase(),
          depositor_address: entity.user.toLowerCase(),
          token_address: entity.token.toLowerCase(),
          token_symbol: tokenMeta.symbol,
          amount: amountDecimal,
          amount_wei: amountWei,
          tx_hash: txHash,
          tx_status: 'confirmed',
          deposit_id: depositId,
          yield_amount: entity.yield_amount,
          points_minted: pointsMinted,
          unlock_at:
            entity.unlock_at && entity.unlock_at !== '0'
              ? new Date(parseTimestamp(entity.unlock_at) * 1000).toISOString()
              : null,
          created_at: new Date(
            parseTimestamp(entity.timestamp) * 1000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        // Handle duplicate key error gracefully
        if (insertError.code === '23505') {
          console.log('Duplicate insert detected (race condition)');
          return new Response(
            JSON.stringify({ ok: true, skipped: 'Duplicate insert' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        console.error('DB Insert Error:', insertError);
        throw insertError;
      }
      dbDepositId = inserted.id;
      console.log('Insert success, ID:', dbDepositId);
    }

    // Now attempt to credit the user atomically using our RPC function
    if (dbDepositId && pointsMinted && pointsMinted !== '0') {
      const { data: creditResult, error: creditError } = await supabase.rpc(
        'credit_deposit',
        {
          p_deposit_id: dbDepositId,
          p_points_minted: pointsMinted,
        }
      );

      if (creditError) {
        console.error('Credit RPC failed:', creditError);
        // We don't fail the webhook because the deposit IS recorded, just crediting failed.
        // Admin can retry or poller might pick it up.
        return new Response(
          JSON.stringify({
            ok: true,
            id: depositId,
            credit_error: creditError.message,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          id: depositId,
          credit_result: creditResult,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ ok: true, id: depositId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
