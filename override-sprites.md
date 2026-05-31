## Override Wearables → Sprite Regeneration Plan

### Goal

Ensure that when a player equips/unequips server-only override wearables for a custom gotchi character, a new spritesheet is generated and used immediately by that player, without affecting the canonical on-chain sprite that other viewers see.

---

## Current State (Summary)

- Server generates sprites into Supabase Storage under `aavegotchi-sprites` with keys:
  - `spritesheets/<id>.png`
  - `spritesheets/<id>.meta.json`
- The `.meta.json` includes `{ attributesHash, generatorVersion, pngHash }`.
- Client loads sprite URLs from:
  - `GET /api/gotchis/:id` (canonical, on-chain), or list via `GET /api/gotchis`.
  - GameScene sets runtime `setCharacterSpriteOverride(characterId, { imagePath, ... })` for custom gotchis using that URL.
- Equipment changes (server-only overrides) are already captured in `equipment-service.ts`, which builds a `GeneratorGotchi` reflecting overrides and calls `generateOne(...)`.
- Today, `generateOne(...)` uploads to the canonical key `spritesheets/<id>.png` (risk: owner’s overrides would overwrite the global gotchi asset for all viewers).

---

## Proposed Design

### 1) Isolate override sprites via hash-based variant keys (no global clobber)

- Introduce an optional "override mode" that stores sprites under a path keyed by the effective equipment signature (attributes hash), not by player.
- Storage layout additions:
  - `spritesheets/variants/override/<id>/<attributesHash8>.png`
  - `spritesheets/variants/override/<id>/<attributesHash8>.meta.json`
- The URL returned still uses Supabase public base, with `?v=<sha8>` computed from the PNG bytes as today. Multiple players sharing the same override set (same attributes) will resolve to the same asset.
- Canonical `GET /api/gotchis/:id` remains on-chain and is not impacted by overrides.

### 2) Server API and flows

- Extend `gotchi-sprites.ts` to accept an optional `variant` descriptor on generation:
  - `generateOne(g: GeneratorGotchi, variant?: { kind: 'override' }): Promise<SpriteInfo>`
  - Internally, derive `attributesHash` from `g` and resolve keys via `objectKeysFor(id, attributesHash)`.
  - Keep hashing and metadata logic identical; only object keys differ in override mode.

- Update equipment flows (`equipment-service.ts`):
  - After computing the new `EquipmentState`, call `generateOne(generator, { kind: 'override' })`.
  - Capture the returned `SpriteInfo.url` into the broadcast payload.

- Broadcast the new URL to the client:
  - Extend `EquipmentBroadcastPayload` with `spriteUrl?: string` and send it in `equipment_updated`.
  - In `GameRoom.equipmentBroadcastUpdate`, forward `spriteUrl` to the client.

- Optional API support (nice-to-have for initial load):
  - Add `GET /api/gotchis/:id/variant` that resolves the player’s own variant using session identity and returns `{ sprite: { id, url, hash } }`.
  - Use this for initial load so the owner immediately sees their override variant without waiting for an equipment event.

### 3) Client updates

- Extend message type `EquipmentUpdatedPayload` to include `spriteUrl?: string`.
- In the client message handler for `equipment_updated` (wherever we process WS room messages), if `payload.spriteUrl` is present and the local player’s `characterId` is a gotchi, call:

```ts
setCharacterSpriteOverride(player.characterId, {
  imagePath: payload.spriteUrl,
  frameWidth: 100,
  frameHeight: 100,
});
```

- For initial load of the local player in `GameScene.loadPlayerSprite`:
  - Prefer resolving the variant endpoint (if implemented) to get the owner’s `spriteUrl`.
  - Otherwise, fall back to canonical `GET /api/gotchis/:id`, then rely on equipment broadcast to swap to the variant URL as soon as state is hydrated.

---

## Detailed Server Tasks

### A) gotchi-sprites.ts – add override variant support

- New types:

```ts
export interface SpriteVariant {
  kind: 'override';
}
```

- Key resolver:

```ts
function objectKeysFor(
  id: number,
  attributesHash: string,
  variant?: SpriteVariant
) {
  const base =
    variant && variant.kind === 'override'
      ? `variants/override/${id}/${attributesHash.slice(0, 8)}`
      : `${id}`;
  return {
    pngKey: `spritesheets/${base}.png`,
    metaKey: `spritesheets/${base}.meta.json`,
    publicPath: base,
  };
}
```

- Overload `generateOne` to accept the optional `variant` and use `objectKeysFor` for override mode (compute `attributesHash` internally) when constructing keys and URLs.
- Keep `attributesHash` and `pngHash` logic as-is; versioning remains via `?v=<sha8>`.

### B) equipment-service.ts – generate override variant + broadcast URL

- Add helper:

```ts
async function regenerateAndGetOverrideUrl(
  state: EquipmentState
): Promise<string | null> {
  const generator = await buildGeneratorGotchiForState(state);
  if (!generator) return null;
  const info = await generateOne(generator, { kind: 'override' });
  return info.url;
}
```

- Extend `EquipmentBroadcastPayload` with `spriteUrl?: string`.
- Update `equipWearable`, `unequipWearable`, `batchEquipWearables`, `batchUnequipWearables` to:
  1. compute `state` (unchanged),
  2. `const spriteUrl = await regenerateAndGetOverrideUrl(state);`
  3. `await broadcastEquipmentUpdate(playerId, { ...state, spriteUrl });`

### C) GameRoom – forward the URL

- In `equipmentBroadcastUpdate`, forward `payload.spriteUrl` in the `equipment_updated` message to the client.
- Optionally store it on `player` state for debugging/inspection.

### D) Server API (optional, but recommended)

- Add `GET /api/gotchis/:id/override` that returns the current override URL for the authenticated session’s effective equipment (compute generator from server-side state, then call `generateOne(..., { kind: 'override' })`).

---

## Detailed Client Tasks

### A) Types

- Update `apps/client/src/types/messages.ts`:

```ts
export interface EquipmentUpdatedPayload {
  equipment: unknown;
  overrides?: unknown;
  version: number;
  spriteUrl?: string; // NEW
}
```

### B) Message handling

- Where the client handles `equipment_updated` (room message dispatcher), if `spriteUrl` is present and the recipient is the local player or references their `characterId`, call `setCharacterSpriteOverride` with the new URL.

### C) Initial load

- In `GameScene.loadPlayerSprite` when custom gotchi is detected for the local player:
  - Resolve `spriteUrl` via `GET /api/gotchis/:id/variant` if available; else canonical as today.
  - Immediately set `setCharacterSpriteOverride(...)` before texture load to avoid a “double load” flash.

---

## Caching, Perf, and Safety

- PNG objects: keep `cacheControl: 31536000, immutable`; cache bust via `?v=<sha8>`.
- Metadata JSON: `cacheControl: 0` (no-cache) so regen decisions are always fresh.
- No global invalidation required; variants live under distinct keys.
- Rate-limiting of equip actions already exists; sprite generation stays behind that.
- Errors in upload/regeneration bubble to logs; client still has SVG fallback paths.

---

## Testing Checklist

- Override equip/unequip triggers a new URL (`?v=` changes) in variant path; canonical remains unchanged.
- Client receives `equipment_updated` with `spriteUrl` and updates textures live.
- Fresh session for a player with existing overrides loads variant URL on first load (via variant endpoint or an early broadcast).
- Other viewers of the same gotchi continue to see the canonical sprite.
- Supabase objects for both canonical and variant exist and have correct cache-control headers.

---

## Rollout Steps

1. Implement variant support in `gotchi-sprites.ts` (no external behavior change until used).
2. Wire `equipment-service.ts` to generate variant sprites and include `spriteUrl` in broadcast payload.
3. Forward `spriteUrl` from `GameRoom` in `equipment_updated`.
4. Update client message types and handlers to swap sprites on `equipment_updated`.
5. (Optional) Add `GET /api/gotchis/:id/variant` and switch initial load to use it for the local player.
6. Verify end-to-end with one player equipping overrides while another views the same gotchi.

---

## Critical Review (Risks, Tradeoffs, Mitigations)

- Hash truncation collisions:
  - Using `<attributesHash8>` in the path has a theoretical collision risk. Mitigation: use 12–16 hex chars for the directory segment while keeping `?v=<pngHash8>` unchanged. Also validate meta `attributesHash` on read; if mismatch is detected, regenerate and promote a longer key.

- Concurrency and temp file clashes:
  - Current generator writes to a temp file named `<id>.png` under a shared temp dir. Rapid consecutive equips for the same gotchi could overlap. Mitigation: include `attributesHash8` in the temp filename (e.g., `<id>.<hash8>.png`) or guard with a per-`id` mutex during generation.

- Equip latency vs UX:
  - Generating before broadcasting ensures clients get a working URL but adds latency to the equip response. Options:
    - (A) Synchronous generate → single broadcast with URL (simpler; slightly slower response).
    - (B) Immediate broadcast without URL, followed by a second broadcast when URL is ready (faster response; more client complexity). Choose A for simplicity unless latency becomes an issue.

- CDN propagation and eventual consistency:
  - Supabase/edge should be quick, but first fetch right after upload might 404 in rare cases. Mitigation: client retry with small backoff when load fails; server could also HEAD-check after upload if needed.

- Storage growth:
  - Each unique override set creates a new object. Given keys are stable per hash, churn is limited. If necessary, add a periodic job to track usage and prune cold variants. Not required initially.

- Client swap correctness:
  - Ensure the client’s `equipment_updated` handler actually reloads textures for the specific player entity (local and remote) and disposes old textures to avoid memory leaks or double-binded animations.

- Canonical vs runtime divergence:
  - Canonical `/api/gotchis/:id` stays on-chain. All in-room rendering should come from broadcasts’ `spriteUrl` to reflect overrides. Document this to avoid confusion.

- Meta integrity:
  - Meta JSON includes `attributesHash` and `pngHash`. In override mode, the path also embeds the (truncated) hash. On load, if meta hash doesn’t match the embedded path segment, treat as corruption: re-generate and overwrite.

- Security/validation:
  - Equipment state is server-authoritative and normalized through known wearable definitions, minimizing injection risk. Continue to sanitize slugs/slots.

---

## Open Questions

1. Hash length in path: Use 8, 12, or 16 hex? (Recommend 12 for lower collision risk without long paths.)
2. Equip response policy: Prefer synchronous generate+broadcast (simpler) or dual-stage broadcast (faster perceived responsiveness)?
3. Temp file strategy: OK to include `<hash8>` in temp filename to avoid clashes, or do you prefer a process-wide mutex per gotchi id?
4. Client retries: Are we okay adding a small retry/backoff on texture load failure to ride out rare CDN propagation delays?
5. Admin/observability: Do you want an endpoint or admin log to inspect override meta (attributesHash, updatedAt, generatorVersion) for debugging?
