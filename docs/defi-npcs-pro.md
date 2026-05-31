## DeFi-capable NPCs: intents-first architecture with secure, permissioned direct onchain fallback

### Goals

- **Enable DeFi transactions inside the game** using either:
  - **Intents** via thirdweb AI/Nebula (and underlying aggregators/routers), and
  - **Direct onchain** interactions via ABIs and ethers v6.
- **Allow third-party developers to create NPCs** and declaratively control what each NPC can do:
  - **View-only** requests (no state changes)
  - **Onchain transactions** (state changes) with strict capabilities, budgets, protocols, tokens, and chains.
- **Keep critical authority server-side** for anti-cheat and safety; clients never decide policy nor hold privileged keys.

### Non-goals (initial)

- Full protocol-specific strategy UIs; NPCs surface simplified actions and guardrails.
- Cross-chain generalized routing. We start chain- and protocol-allowlisted and expand gradually.

---

## High-level architecture

1. Client (game) → 2) Server NPC Orchestrator → 3) Execution Backend(s)

- **Client**: Renders NPC dialogue/UI and sends structured requests to server. No privileged keys. Can present user approvals/signatures when required.
- **Server NPC Orchestrator** (apps/server):
  - Loads developer-provided **NPC Manifests** that declare capabilities, policies, and handlers.
  - Runs **Policy Engine** to authorize/shape each requested action.
  - Chooses execution path:
    - **Intents-first** via thirdweb AI/Nebula when possible
    - **Fallback** to direct EVM calls (ethers v6) or aggregator order APIs (e.g., UniswapX, CoW Protocol) under the same policy.
  - Handles **session keys / AA wallets / Safe module** for scoped permissions, sponsorship, and rate/budget limits.
- **Execution Backends**:
  - thirdweb AI/Nebula: natural-language-to-execution with constrained tools context
  - Aggregator intent APIs: UniswapX order, CoW sell/buy order (server-signed or user-signed)
  - Direct EVM (ethers v6): ABI-based reads/writes with simulation and enforcement

Key principles:

- **Intents-first**: better UX, automatic routing, offchain quote price improvement.
- **Policy before execution**: every request is matched to capability and constraints, then simulated.
- **Ephemeral authority**: short-lived, scope-restricted session keys for any automated sending.
- **Server custody or user signature**: support both flows; default to user approvals for state-changing actions unless policy explicitly allows server-signed with tight budgets.

---

## Capability and policy model

NPCs are defined by a manifest with explicit capabilities and policies. Capabilities state “what” an NPC can do; policies state “under what constraints.”

```ts
// apps/server/src/npc/types.ts (proposed)
export interface NpcManifest {
  id: string;
  name: string;
  version: string;
  ownerDeveloperId: string; // for audit, quotas, and moderation
  chains: ChainId[]; // allowlisted chains the NPC may touch
  capabilities: Capability[];
  policies: Policy[]; // global NPC-level constraints (applied before handler-level)
  handlers: {
    view: NpcViewHandler[];
    transact: NpcTransactHandler[];
  };
}

export interface Capability {
  kind: 'view' | 'transact';
  action:
    | 'balance'
    | 'positions'
    | 'quoteSwap'
    | 'swap'
    | 'transfer'
    | 'stake'
    | 'unstake'
    | 'claim'
    | 'wrap'
    | 'unwrap'
    | 'bridge';
  description?: string;
  // Optional narrow constraints at capability level (in addition to NPC policies)
  constraints?: Partial<CapabilityConstraints>;
}

export interface CapabilityConstraints {
  allowedProtocols: HexAddress[]; // routers, vaults, staking contracts, bridges
  allowedTokensIn: HexAddress[];
  allowedTokensOut: HexAddress[];
  allowedFunctionSelectors: Hex4[]; // exact 4-byte function selectors
  maxValueWei?: bigint; // per-action cap
  dailyValueWei?: bigint; // rolling window budget
  maxSlippageBps?: number; // for swaps
  requireUserSignature?: boolean; // force end-user signature even if session key exists
}

export interface Policy {
  id: string;
  kind:
    | 'budget'
    | 'timeWindow'
    | 'rateLimit'
    | 'sessionKey'
    | 'kyc'
    | 'tokenDenylist'
    | 'chainAllowlist'
    | 'simulation';
  config: Record<string, unknown>;
}

export interface NpcViewHandler {
  id: string;
  match: (req: ViewRequest) => boolean;
  execute: (ctx: ExecutionContext, req: ViewRequest) => Promise<ViewResponse>;
}

export interface NpcTransactHandler {
  id: string;
  match: (req: TransactRequest) => boolean;
  // Builds and (optionally) sends; always simulates first
  execute: (
    ctx: ExecutionContext,
    req: TransactRequest
  ) => Promise<TransactResult>;
}

export interface ExecutionContext {
  chainId: ChainId;
  policy: EffectivePolicy; // merged constraints after evaluation
  wallets: {
    user?: EvmAccount; // if user-signed
    session?: EvmAccount; // scoped session key
    sponsor?: EvmAccount; // paymaster/sponsor/safe module
  };
  simulateOnly?: boolean;
}
```

Policy evaluation merges NPC-level policies, capability constraints, developer-provided per-handler constraints, and per-request overrides that have been sanitized. If any check fails, the request is rejected with an explanation.

---

## Execution paths

### 1) Intents via thirdweb AI/Nebula (tools-restricted)

- Use Nebula’s programmatic API server-side with an explicit tool context that only exposes approved chains, protocols, and functions.
- Provide structured context (not free-form prompts) that enumerate:
  - allowed chains
  - allowed protocol addresses
  - explicit function selectors and ABI fragments
  - maximum slippage and value caps
- Require a pre-flight **simulation** step using the same signer the action would use (user or session key). Reject if any constraint is violated or the simulation reverts.

Pseudocode (server):

```ts
async function executeViaNebula(ctx: ExecutionContext, req: TransactRequest) {
  // Prepare a minimal tool context; never pass secrets to clients.
  const nebulaRequest = {
    message: req.intentText ?? buildIntentFromStruct(req),
    contextFilter: { chains: [ctx.chainId] },
    tools: buildNebulaToolsFromPolicy(ctx.policy),
    execution: {
      mode: ctx.policy.requireUserSignature ? 'build' : 'autonomous',
    },
    from: selectSignerAddress(ctx),
  };

  const draft = await nebula.chat(nebulaRequest); // returns proposed tx(s)
  await simulateAll(ctx, draft.transactions);
  if (ctx.policy.requireUserSignature) return returnToClientForSignature(draft);
  return await sendAll(ctx, draft.transactions);
}
```

Notes:

- Keep Nebula calls strictly on the server; store API keys in secrets management.
- Tooling context must be deterministic and derived from policy—no ad-hoc LLM autonomy.

### 2) Aggregator intent APIs (UniswapX, CoW Protocol)

- For swaps, consider creating offchain orders:
  - **UniswapX**: Dutch auction orders signed by user/session key; settlement by solvers. Good for intents.
  - **CoW Protocol**: Batch auction orders (sell/buy) settled by solvers with MEV protection.
- Orders are built under the same policy constraints, then signed and posted to the aggregator. The NPC returns the order status and settlement tx hash when filled.

Server-side flow:

```ts
async function createSwapOrder(
  ctx: ExecutionContext,
  p: {
    sellToken: HexAddress;
    buyToken: HexAddress;
    amountIn: bigint;
    minAmountOut: bigint;
  }
) {
  enforceSwapPolicy(ctx.policy, p);
  const quote = await quoteAggregator(ctx.chainId, p); // both CoW + UniswapX
  const order = toPreferredOrderFormat(quote, p, ctx.policy);
  const signer = selectSigner(ctx);
  const signature = await signOrder(signer, order);
  return await postOrder(order, signature);
}
```

### 3) Direct EVM (ethers v6) with ABIs

- For reads: no signer required; use `JsonRpcProvider`.
- For writes: use end-user signature (preferred) or scoped session key; always simulate before sending; adhere to function selector allowlist.

TypeScript (ethers v6) snippets:

```ts
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
];

const usdc = new ethers.Contract(process.env.USDC!, erc20Abi, signer);

async function transferUSDC(to: string, amountUnits: string) {
  const amount = ethers.parseUnits(amountUnits, 6);
  await simulateCall(provider, {
    to: usdc.target as string,
    from: await signer.getAddress(),
    data: usdc.interface.encodeFunctionData('transfer', [to, amount]),
  });
  const tx = await usdc.transfer(to, amount);
  return await tx.wait();
}
```

---

## Security model

- **Session keys / AA**:
  - Use ERC-4337 smart accounts or Safe + Session Key module to create temporary keys with:
    - function selector allowlist
    - token/contract address allowlist
    - value/slippage caps and per-period budgets
    - expiry timestamps and limited nonce windows
  - Prefer user consent to mint session keys; keys live server-side in HSM or KMS, never on client.
- **Simulation everywhere**: eth_call against the exact signer and state; reject any revert or unexpected state delta.
- **Permit2 / Permit (EIP-2612)**: favor permit flows over infinite approvals; scope by spender, token, value, and deadline.
- **Rate limiting and anomaly detection**: per-user and per-NPC caps on tx frequency/value; alert on spikes or unusual routes.
- **Chain and token governance**: global denylist/allowlist; block suspicious tokens and unsafe chains by default.
- **Logging and audit trails**: append-only logs for every decision and action, including pre- and post-state digests and policy snapshot IDs.

---

## Developer experience (DX)

### NPC folder layout (server)

- `apps/server/src/npc/`
  - `registry.ts` – loads and validates manifests (Zod) and wires handlers
  - `types.ts` – interfaces from this document
  - `policy/` – evaluation, merging, and enforcement helpers
  - `integrations/nebula.ts` – thin Nebula client with tool-context builder
  - `integrations/ethers.ts` – provider/signers/contracts, simulation helpers
  - `integrations/orders/` – CoW, UniswapX order build/post
  - `npcs/<npc-id>/manifest.ts` – developer-provided manifest
  - `npcs/<npc-id>/handlers.ts` – view/transact handlers

### Developer SDK surface (proposed)

Provide simple helpers so third-party developers focus on behavior, not plumbing:

```ts
// apps/server/src/npc/sdk.ts (proposed)
export function defineNpc(manifest: NpcManifest) {
  return manifest; // validates with Zod and returns frozen manifest
}

export function defineViewHandler(
  id: string,
  match: NpcViewHandler['match'],
  execute: NpcViewHandler['execute']
): NpcViewHandler {
  return { id, match, execute };
}

export function defineTransactHandler(
  id: string,
  match: NpcTransactHandler['match'],
  execute: NpcTransactHandler['execute']
): NpcTransactHandler {
  return { id, match, execute };
}

export interface NpcModule {
  manifest: NpcManifest;
  view?: NpcViewHandler[];
  transact?: NpcTransactHandler[];
}

export function registerNpc(mod: NpcModule) {
  // 1) validate manifest + handlers
  // 2) attach to registry
}
```

Usage by developers:

```ts
// apps/server/src/npc/npcs/banker/index.ts
import {
  defineNpc,
  defineViewHandler,
  defineTransactHandler,
  registerNpc,
} from '../../sdk';
import { manifest } from './manifest';
import { balanceHandler, swapHandler } from './handlers';

registerNpc({
  manifest: defineNpc(manifest),
  view: [
    defineViewHandler(
      balanceHandler.id,
      balanceHandler.match,
      balanceHandler.execute
    ),
  ],
  transact: [
    defineTransactHandler(
      swapHandler.id,
      swapHandler.match,
      swapHandler.execute
    ),
  ],
});
```

This surface keeps handler logic pure and testable while centralizing policy enforcement and execution primitives in the framework.

### Minimal NPC manifest example

```ts
import { type NpcManifest } from '../../types';

export const manifest: NpcManifest = {
  id: 'banker-usdc',
  name: 'Banker',
  version: '0.1.0',
  ownerDeveloperId: 'dev_abc123',
  chains: [8453], // Base mainnet, example
  capabilities: [
    {
      kind: 'view',
      action: 'balance',
      constraints: {
        allowedTokensIn: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
      },
    },
    {
      kind: 'transact',
      action: 'swap',
      constraints: {
        allowedProtocols: ['0xRouterOrAggregator'],
        allowedTokensIn: ['0xA0b8...USDC'],
        allowedTokensOut: ['0xC02a...WETH'],
        maxSlippageBps: 50,
        maxValueWei: 1000000000n, // 1000 USDC (6 decimals) expressed in wei if wrapped
      },
    },
  ],
  policies: [
    {
      id: 'budget-daily',
      kind: 'budget',
      config: { dailyValueWei: '1000000000000000000' },
    },
    { id: 'sim', kind: 'simulation', config: { require: true } },
    { id: 'allow-chains', kind: 'chainAllowlist', config: { chains: [8453] } },
  ],
  handlers: { view: [], transact: [] },
};
```

### Server route contract

NPC requests are always structured; the client never sends arbitrary calldata.

```ts
// POST /api/npc/:npcId/request
interface NpcRequest {
  kind: 'view' | 'transact';
  action: string; // e.g., 'balance', 'swap'
  params: Record<string, unknown>; // validated per handler
  userId?: string; // in-game identity, maps to onchain account(s)
}

interface NpcResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}
```

### Handler example (swap with intents-first)

```ts
export const swapHandler: NpcTransactHandler = {
  id: 'swap-usdc-weth',
  match: (req) =>
    req.action === 'swap' && req.params.sellToken && req.params.buyToken,
  execute: async (ctx, req) => {
    const p = validateSwapParams(req.params);
    enforceSwapPolicy(ctx.policy, p);

    // try intents (Nebula); fallback to aggregator order; then direct router
    try {
      return await executeViaNebula(ctx, req);
    } catch {}
    try {
      return await createSwapOrder(ctx, p);
    } catch {}
    return await executeDirectRouterSwap(ctx, p);
  },
};
```

---

## Client integration (minimal)

- Client renders NPC UI using standard game patterns and sends `NpcRequest` to server.
- For user-signature flows, server returns a **prepared transaction** or **order** for the client to sign. Client signs and sends back the signature (or broadcasts from client). Prefer signing on client hardware; never export private keys to server.
- For server-signed flows (session key), client shows an approval modal with clear amounts/risks and logs the consent.

---

## Ethers v6 patterns (reference)

```ts
import { ethers } from 'ethers';

// Read-only provider
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);

// User or session signer
const signer = new ethers.Wallet(process.env.SESSION_KEY!, provider);

// Contract
const contract = new ethers.Contract(
  '0xContract',
  ['function foo(uint256)'],
  signer
);

// Simulate
await provider.call({
  to: contract.target as string,
  from: await signer.getAddress(),
  data: contract.interface.encodeFunctionData('foo', [123n]),
});

// Send
const tx = await contract.foo(123n);
await tx.wait();
```

---

## Session keys and account abstraction

- **4337 Smart Accounts**: Create per-user smart accounts; issue **scoped session keys** with:
  - selector allowlist
  - token/contract allowlist
  - spending caps per period
  - expiry and nonce windows
- **Safe + Session Key module**: Alternative with mature permission primitives; enforce module policies onchain.
- **Gas sponsorship**: Use paymasters or relayers to sponsor gas under budget policies; log sponsored value per user/NPC.

Operational tips:

- Store keys in KMS/HSM; rotate frequently; never log secrets.
- Treat session keys as consumables; revoke on anomaly.

---

## Aggregator specifics (quick notes)

- **UniswapX**: Build Dutch orders with Permit2 approvals; sign with user/session; post to orderbook; poll or webhook settlement.
- **CoW Protocol**: Build sell/buy orders; sign EIP-712; post to API; rely on solver for settlement; track order UID.
- Always normalize token decimals; verify minOut against slippage; respect protocol fee fields.

---

## Compliance and risk controls

- **Geofencing / KYC gating** where required; configurable per NPC and per environment.
- **Sanctions screening** for destination addresses; denylisted tokens/contracts.
- **Per-user and per-developer quotas**; daily/weekly value limits.
- **Disclosure** in client UI for any server-signed actions; explicit opt-in.

---

## Observability and operations

- **Structured logs** for: request → capability match → policy snapshot → simulation → execution result.
- **Metrics**: success rate, revert rate, average slippage, sponsored gas, per-NPC volume.
- **Simulators**: use RPC `eth_call`; optionally integrate Tenderly/thirdweb simulate for richer traces.
- **Env separation**: dev (testnets only), staging, prod; distinct keys and RPCs.

---

## Milestones

1. Skeleton: registry, types, policy engine scaffolding; one demo NPC (view-only)
2. Ethers v6 reads/writes with simulation; client approval UX (testnet)
3. Session keys + budgets; server-signed limited actions (testnet)
4. Intents integration (Nebula) with tools-restricted context; guarded autonomous mode (testnet)
5. Aggregator orders (UniswapX/CoW) path; best-quote selection (testnet)
6. Prod hardening: logging/metrics, denylist/allowlist governance, compliance switches
7. Developer program: CLI scaffold, validation, publishing/approval flow for third-party NPCs

---

## Example: developer-authored NPC (balance + swap)

```ts
// apps/server/src/npc/npcs/banker/handlers.ts
export const balanceHandler: NpcViewHandler = {
  id: 'balance-usdc',
  match: (req) =>
    req.action === 'balance' && typeof req.params.address === 'string',
  execute: async (ctx, req) => {
    const address = req.params.address as string;
    const provider = getProvider(ctx.chainId);
    const usdc = getErc20(provider, TOKENS.USDC[ctx.chainId]);
    const balance = await usdc.balanceOf(address);
    return { balances: { USDC: balance.toString() } };
  },
};

export const swapHandler: NpcTransactHandler = {
  id: 'swap-usdc-weth',
  match: (req) => req.action === 'swap',
  execute: async (ctx, req) => {
    const p = validateSwapParams(req.params);
    enforceSwapPolicy(ctx.policy, p);
    try {
      return await executeViaNebula(ctx, req);
    } catch {}
    try {
      return await createSwapOrder(ctx, p);
    } catch {}
    return await executeDirectRouterSwap(ctx, p);
  },
};
```

---

## Notes on thirdweb AI/Nebula integration

- Keep the Nebula API key in server secrets; never in client bundles.
- Build a small adapter that:
  - transcribes `NpcTransactRequest` to a constrained tools schema
  - injects allowlists (chains, protocols, function selectors)
  - enforces `requireUserSignature` mode by returning a prepared transaction to the client rather than sending
  - records the full Nebula prompt/tools context for audit
- Validate Nebula’s output against ABI and policy again before broadcasting.

---

## What to build next in this repo

- `apps/server/src/npc/` scaffolding as described (types, registry, policy, integrations)
- A demo NPC (`banker`) with `balance` (view) and `swap` (intents-first)
- Minimal client UI that calls `POST /api/npc/:id/request` and renders results/approval prompts

This design keeps authority on the server, provides a clean DX for third-party NPC developers, and supports both intents-first and direct onchain execution with strong safety rails.
