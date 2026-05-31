# Eliminate 'hands' and primarySlot; migrate equippedWearables to slot map

## Goal

- Always use explicit slots (`handLeft`/`handRight`), never `'hands'`.
- Remove all reliance on `primarySlot` for slot assignment.
- Convert character `equippedWearables` from string[] to a slot-mapped object and update all consumers.

## 1) Character model (server, client, shared)

- Files:
  - `apps/server/src/data/characters.ts`
  - `apps/client/src/data/characters.ts`
  - `data/characters.ts`
- Change `CharacterInfo`:

```ts
export type EquipmentSlotMap = Partial<
  Record<
    | 'head'
    | 'body'
    | 'face'
    | 'eyes'
    | 'handLeft'
    | 'handRight'
    | 'pet'
    | 'background',
    string
  >
>;

export interface CharacterInfo {
  // ...
  equippedWearables?: EquipmentSlotMap; // replaces string[]
}
```

- Migrate all character entries to explicit slot maps. Example:

```ts
{
  id: 'aagent',
  equippedWearables: {
    handRight: 'aagent-pistol',
    body: 'aagent-shirt',
    head: 'aagent-fedora-hat',
    eyes: 'aagent-shades',
    face: 'aagent-headset',
  },
}
```

## 2) Wearable slot types and definitions (server, client, shared)

- Files:
  - `apps/server/src/data/wearables.ts`
  - `apps/client/src/data/wearables.ts`
  - `data/wearables.ts`
- Update types:
  - Remove `'hands'` from `WearableSlot` and from `VALID_WEARABLE_SLOTS`.
  - Ensure any wearable that could be in either hand has `slots: ['handLeft','handRight']`.
  - Remove `primarySlot` from `WearableDefinition` (and all usages). Keep only `slots` for capability; actual assignment comes from character map or gotchi assignments.

## 3) Derived stats (server + client)

- Files:
  - `apps/server/src/data/characters.ts`
  - `apps/client/src/data/characters.ts`
- In `getCharacterStats`:
  - Build `assignmentsBySlug: Map<string, WearableSlot[]>` from `character.equippedWearables`.
  - For base characters, set `equipment.items[].slot` exclusively via `assignmentsBySlug`; throw if any equipped slug has no slot mapping.
  - Do not fallback to `primarySlot` (removed) or any heuristic; no `'hands'` anywhere.

Helper:

```ts
function buildAssignmentsBySlug(map: EquipmentSlotMap | undefined) {
  const result = new Map<string, WearableSlot[]>();
  if (!map) return result;
  (Object.entries(map) as Array<[WearableSlot, string]>).forEach(
    ([slot, slug]) => {
      if (!slug) return;
      const list = result.get(slug) || [];
      list.push(slot);
      result.set(slug, list);
    }
  );
  return result;
}
```

## 4) Gotchi path (server)

- File:
  - `apps/server/src/lib/equipment-service.ts`
  - `apps/server/src/data/characters.ts` (gotchi derivation)
- Ensure on-chain assignments are hydrated before stat derivation (`ensureGotchiWearablesHydrated`).
- In gotchi derivation, require assignments; do not use `primarySlot` or `'hands'`. If missing, surface an error and hydrate.

## 5) Equipment service/API

- File: `apps/server/src/lib/equipment-service.ts`
  - `normalizeSlot()` should reject `'hands'` (throw `invalid_slot`).
  - `resolveWearableSlot()` should only accept slots present in `wearable.slots`, which must be explicit `handLeft/handRight`.

## 6) Runtime consumers

- Files:
  - `apps/server/src/rooms/GameRoom.ts` → remove the `'hands'` branch in `getHandWeaponEntriesForPlayer`.
  - `apps/server/src/lib/player-stats.ts` → remove any parsing/branching for `'hands'`; expect explicit hands only.
  - `apps/client/src/game/GameScene.ts` → remove any fallback for non-hand slots when rendering HUD; accept only `handLeft`/`handRight`.

## 7) Tests and docs

- Update tests (e.g., `scripts/aavegotchi-wearable-assignments.spec.ts`) to assert explicit hand slots; remove any `'hands'` expectations.
- Update docs (`docs/EQUIPMENT_LIFECYCLE.md`) to state `'hands'` is not used anywhere and slot assignment is explicit at source.

## 8) Repo-wide cleanup

- Replace/remove `'hands'` tokens referring to slot names across server, client, shared code. Ensure no branch handles `'hands'`.
- Remove usages of `primarySlot`; adjust code to rely on character slot map or gotchi assignments.

## 9) Validation

- Typecheck server and client.
- Confirm `players.derived_stats.equipment.items[].slot` is always `handLeft`/`handRight` for base characters.
- Manual run-through: HUD shows correct hands; equip flows remain consistent.
