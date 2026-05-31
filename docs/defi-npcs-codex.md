# DeFi NPC Integration Plan

## Goals & Constraints
- Enable in-game NPCs to perform DeFi read/write operations on behalf of authenticated players without breaking immersion.
- Support both thirdweb Nebula intent flows and direct onchain transactions via ABIs + ethers/viem.
- Let content developers create and tune NPCs, constraining what each NPC can see or execute.
- Maintain existing SIWE-based auth, Colyseus multiplayer flow, and Next.js client.
- Keep security-first posture: transparent permissions, auditable actions, replay protection.

## Current State Snapshot
- Client already wraps the app with `ThirdwebProvider` and uses thirdweb wallet hooks (`useActiveAccount`, etc.).
- Dialogue interactions are dispatched from `DialogueBox` to the server via Colyseus events handled in `NPCSystem`.
- Server uses Node/Express + Colyseus; NPC spawn logic is static and dialogue content lives under `apps/server/src/data/npc-dialogues`.
- No existing pathway connects dialogue responses to blockchain actions.

## High-Level Architecture
- **Client (Next.js / Colyseus)**
  - Dialogue UI collects player intent and routes to a new `npcAction` request handler.
  - Wallet state (thirdweb) provides connected account and chain, exposed to NPC UI modules.
  - New hooks/components map dialogue responses to structured capability requests.
- **Server (Node / Colyseus / Express)**
  - `NpcActionService` validates session + capability policy, orchestrates reads or writes.
  - Adapter layer for: (a) Nebula intent API, (b) direct contract calls via ethers/viem.
  - Persistent audit log + optional job queue for long-running intents.
- **Onchain / Offchain External**
  - thirdweb Nebula workspace with custom agent definitions (intents registry).
  - Contract ABI registry stored in repo or fetched dynamically; supports viem/ethers.
  - Optional caching (Redis/postgres) for price feeds, protocol metadata, signed intent status.

## Capability Model
- Introduce a typed NPC definition, e.g. `apps/server/src/data/npc-definitions.ts`:
  ```ts
  export interface NPCCapability {
    id: string; // e.g. view:bala:erc20
    type: 'view' | 'intent' | 'direct';
    description: string;
    schema: zodSchemaRef; // parameters allowed from client
    execution: { adapter: 'nebula' | 'contract' | 'custom'; config: Record<string, unknown>; };
    limits?: { dailyCalls?: number; maxValueUsd?: number; };
    allowedChains?: number[];
    allowedTokens?: string[];
  }

  export interface NPCDefinition {
    npcId: string;
    dialogueId: string;
    defaultCharacterId: string;
    capabilities: NPCCapability[];
  }
  ```
- Map dialogue responses to capability IDs (`nextDialogue: "action:stani.swapUSDC"`).
- Distinguish capability categories:
  - **View** (read-only): balances, positions, quotes, risk metrics.
  - **Intent**: offload to Nebula for multi-step actions (swap, lend, bridge).
  - **Direct**: call predetermined contracts/functions with bounded parameters.

## Dialogue & Interaction Pipeline
1. Player selects a dialogue response tagged as `action:<capabilityId>`.
2. Client emits `npc_action_request` Colyseus message with:
   - `sessionId`, `playerAddress`, `npcId`, `capabilityId`, `payload`.
   - `walletContext` (chainId, account) and optional proof-of-presence data.
3. Server validates:
   - Player proximity + NPC identity (existing `NPCSystem` logic).
   - Session integrity (reuse `resolveSessionFromRequest`).
   - Capability policy (NPC definition lookup + zod schema validation + rate-limit).
4. Server dispatches to adapter:
   - **Nebula**: create intent request, include `playerAddress`, `capability config`, guardrails.
   - **Direct**: build contract call data, request client signature if needed, submit transaction or return unsigned payload for user confirmation.
5. Server streams status updates back via:
   - Colyseus messages (`npc_action_update`) for progress, or
   - REST/WS fallback for long-running intents (client polls).
6. Dialogue UI transitions to result view (success/fail) with optional follow-up dialogue.

## Intents via thirdweb Nebula
- **Nebula Setup**
  - Create a Nebula project; define agent workflows for the game (e.g., `swap`, `lend`, `bridge`, `stake`).
  - For each capability, register Nebula intent template with required parameters and allowed protocols/token lists.
  - Configure Nebula API keys in server `.env`.
- **Server Adapter**
  - Add `apps/server/src/lib/nebula.ts` with functions:
    - `createIntent({ capabilityId, params, playerAddress })`.
    - `getIntentStatus(intentId)`.
    - `cancelIntent(intentId)` if necessary.
  - Include deterministic metadata (NPC id, capability id, session id) for audit tracking.
- **Execution Flow**
  1. Validate capability config includes `execution.adapter === 'nebula'`.
  2. Serialize Nebula request payload, inject guardrails (protocol allowlist, slippage limits, max value).
  3. Nebula agent either returns a transaction for the player to sign in-wallet or executes via delegated executor (depending on Nebula mode); align with player custody expectations.
  4. Server stores status -> `npc_action_events` table (intentId, status, payload).
  5. Client polls/receives updates, prompts wallet signature when Nebula returns `pending_signature`.
  6. On completion, server pushes summary dialogue + optional rewards.
- **Developer Controls**
  - Capability definition references Nebula workflow slug and sets parameter schema.
  - Provide CLI command to sync capability configs to Nebula (optional).

## Direct Onchain Transactions (ethers/viem)
- **ABI Registry**
  - Add `data/onchain/contracts.ts` listing contract metadata: address, chainId, ABI file path, expected methods.
  - Optionally autogenerate from `scripts/generate-shared-files`.
- **Execution Flow**
  1. Capability config includes `execution.adapter === 'contract'` plus `contractId`, `method`, `value`.
  2. Server resolves contract metadata, builds calldata via viem or ethers.
  3. Determine custody:
     - **User-Signed Transactions**: server returns unsigned tx to client; client uses thirdweb signer to prompt wallet, submit, then notifies server with tx hash.
     - **Sponsored / Bot-Signed**: server uses relayer key (stored securely) to submit after extra approval logic.
  4. Server enforces guardrails (max value, token allowlist, chain).
  5. Record transaction to audit table; optionally watch confirmations using Alchemy/Infura webhooks or thirdweb listeners.
- **Read-Only Views**
  - Provide helper functions (`getBalances`, `getLendingPosition`) that run via viem `publicClient` or thirdweb RPC.
  - Cache results per session to avoid rate limits.

## Developer Workflow
1. **Define Capability**
   - Edit `npc-definitions.ts` (or per-NPC file) to register new capability with schema + execution metadata.
   - Use zod schema to declare expected `payload` from dialogue (amounts, token addresses, recipient).
2. **Author Dialogue**
   - Update NPC dialogue JSON to reference `action:<capabilityId>` transitions.
   - Provide fallback dialogues for errors/timeouts.
3. **Client Binding**
   - Extend Dialogue UI to surface contextual forms before sending payload (e.g., amount slider).
   - Provide `useNpcCapability(capabilityId)` hook to fetch metadata and render input controls.
4. **Testing**
   - Add integration tests that mock Nebula API or contract calls.
   - Use scripts (e.g., `scripts/simulate-combat.ts` style) to simulate NPC interactions.
5. **Deployment**
   - Document environment variables (Nebula keys, relayer keys, RPC URLs).
   - Provide migration to create new DB tables and indexes for audit logs.

## Security & Compliance Guardrails
- Enforce per-capability allowlists (tokens, chains, protocols) and granular rate limits.
- Require explicit player confirmation for any transaction; display intent summary + estimated cost.
- Implement transaction simulation (Tenderly, thirdweb simulator, or viem multicall) before submission.
- Keep deterministic audit records:
  - `npc_action_events` table logging request, policy, player, status, tx hash.
  - Optionally hash sensitive payloads.
- Add monitoring/alerts for failed intents, stuck states, or suspicious usage.
- For relayed transactions, store relayer keys in KMS or environment injection outside repo.

## Data & Storage Changes
- Postgres migrations:
  - `npc_definitions` (id, meta) optional if storing in DB; otherwise keep in code.
  - `npc_action_events` (id, npcId, capabilityId, sessionId, playerAddress, adapter, payloadJson, status, txHash, intentId, createdAt, updatedAt).
  - `npc_capability_limits` to track rate limiting counters (could also live in Redis).
- Cache layer (Redis) for:
  - Session-specific allowances (view results).
  - Nebula intent polling (store latest status, TTL).

## Testing & Observability
- Unit tests for capability schema validation and adapter wiring.
- Contract interaction tests using Hardhat/Foundry fork or viem anvil.
- Integration tests that:
  - Mock Nebula API responses (success, requires-signature, failure).
  - Validate audit logs and Colyseus messages.
- Observability:
  - Structured logs with `npcId`, `capabilityId`, `player`.
  - Metrics: number of intents per capability, success rate, average completion time.
  - Optional tracing via OpenTelemetry (instrument adapter calls).

## Rollout Plan
- **Phase 0**: Design validation, create NPC capability schemas, stub adapters returning mock data.
- **Phase 1**: Implement view-only capabilities (balances, prices) with live onchain reads.
- **Phase 2**: Integrate Nebula intents for simple swaps (player-signed).
- **Phase 3**: Add direct contract actions for whitelisted protocols; introduce relayer (if needed).
- **Phase 4**: Harden security (simulations, monitoring), expand NPC library, publish developer docs.

## Open Questions
- Custody model: should NPCs ever execute transactions without player signatures?
- How are protocol allowlists curated and updated over time? Manual PRs vs remote config?
- Do we need multi-chain support immediately, or start with Base (chainId 8453) to match game lore?
- Should dialogue authoring surface dynamic prompts (e.g., fetch token list) or remain predefined?
- How will we surface gas/fee sponsorship costs inside the in-game economy?

## Immediate Next Steps
1. Prototype `npc-definitions.ts` with 1-2 capabilities and mocked adapters.
2. Extend dialogue flow to emit `npc_action_request` messages and render placeholder responses.
3. Draft Nebula agent workflows mirroring planned capabilities; obtain API credentials.
4. Decide on custody policy (player-signed first) and document wallet UX expectations.
5. Align database migrations + audit logging before enabling any financial actions.
