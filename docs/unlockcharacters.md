### Unlock Characters via Lick Tongues — Questions & Design Notes

Goal: Let new players receive 5 Lick Tongues at signup (via the signup trigger) and allow them to spend those tongues to unlock a character. Locked characters cannot be selected until unlocked.

---

### Summary of Intended Behavior

- **Signup grant**: AFTER INSERT trigger on `players` grants 5 Lick Tongues, updating both inventory and `players.lick_tongue_count`. See `docs/triggers.md`.
- **Unlock flow**: Players spend Lick Tongues to unlock characters, similar to difficulty unlocks in `spend-tongues.md`.
- **Selection constraint**: Only unlocked characters are selectable as the active character.

---

### Implementation Notes

- Persisted unlocks live in `players.unlocked_characters` (text array) with the currently selected character stored alongside preferences on the same row. A helper endpoint (`POST /api/player/unlocks/character`) handles the tongue spend, updates the array, and auto-selects the character in a single transaction.
- Character selection now goes through `POST /api/player/character/select`, which validates that the character is already unlocked (unless it is a dynamic gotchi) before updating preferences.
- The signup trigger (`grant_signup_bonus`) now upserts 5 Lick Tongues into the inventory, logs an `inventory_events` row with reason `signup_bonus`, and bumps `players.lick_tongue_count` for denormalized reads. Existing players are retro-credited 5 tongues via migration.

---

### Proposed Server Changes (high level)

- **Trigger update**: Extend `players_grant_signup_bonus` to also grant 5 Lick Tongues.
  - Upsert `player_inventories` for `item_type = 'material'`, `item_name = 'Lick Tongue'` by +5.
  - Update `players.lick_tongue_count += 5` for denormalized consistency.
  - Insert an `inventory_events` row with reason `signup_bonus` (or similar) for transparency.

- **Persistence of unlocks**:
  - Store per-player unlocked characters either in `players.unlocked_characters TEXT[]` or in a join table `player_unlocked_characters(player_id, character_id, created_at)`.

- **APIs**:
  - POST `/api/player/unlocks/character` with `{ characterId }` to spend Lick Tongues and add to unlocked characters.
  - POST `/api/player/character/select` with `{ characterId }` to set the active character; must already be unlocked.
  - Responses return updated `unlockedCharacters`, `lickTongueCount`, and optionally `activeCharacterId`.

---

### Proposed Client Changes (high level)

- Disable character cards that are locked; show an Unlock CTA when the player has enough Lick Tongues.
- Unlock action triggers the server endpoint; on success, mark the character as unlocked and optionally select it.
- Selecting a character requires it to be unlocked; otherwise show an error or present the unlock CTA.

---

### Telemetry (optional)

- `character_unlocked` with `{ characterId, cost, remainingTongues }`.
- `character_selected` with `{ characterId }`.

---

### Testing Checklist (v1)

- New player has +5 Lick Tongues on first insert via trigger.
- Initially no characters are unlocked; Unlock button appears on character cards if the player has enough tongues.
- Unlocking a character decrements inventory by cost, adds to unlocked list, and allows selection.
- Selecting a locked character is blocked by the server.
- Idempotent unlock requests behave correctly (no double-spend).

—

### Open Questions for You

1. **Data model for unlocks**: Prefer `players.unlocked_characters TEXT[]` or a dedicated table `player_unlocked_characters`? Any concerns about array size or querying?

Whichever is fastest for querying.

2. **Character IDs**: What is the canonical `characterId` string we should use (source of truth)? Today we have multiple `data/characters.ts` copies; should we pick one side (server) as canonical and mirror to client at build time?

data/character.ts is canonical, as is the verson that gets built on the server at build time.

3. **Unlock cost**: Is the cost a flat 5 Lick Tongues for every character, or only for the first unlock? If variable in the future, should cost live in character data (`lickTonguesRequired`)?

Yes, I already added the unlock cost to the character data. Please update the generate shared files if that is not being added already.

4. **Initial state**: Should new players start with zero unlocked characters and must unlock one to play, or should exactly one default character be free/unlocked? If default free, which one?

New players will get 5 lictons and they can choose which character to unlock.

5. **Selection field**: Do we have/need `players.active_character_id` (or similar) to persist the selection outside sessions? If it doesn’t exist, OK to add a column with a foreign key to character IDs?

Yes, I think we already have that, don't we?

6. **Unlock + select in one call**: Do you prefer a single endpoint that unlocks-and-selects if not already unlocked, or keep them separate for clarity?

Sure, unlock and select.

7. **Idempotency semantics**: If a player calls unlock for an already-unlocked character, should the server return 409 (as with difficulty unlocks) or 200 no-op?

Whatever we do for the difficulty tier unlocking.

8. **Error UX**: If the player lacks tongues, should the client show a toast or inline error on the card? Any preferred copy?

No toast, just don't let them select it.

9. **Signup logging**: For the trigger’s 5 tongues grant, should we log an `inventory_events` row with `reason = 'signup_bonus'` and metadata `{ amount: 5 }`? Any additional audit you want?

Sure.

10. **Existing players migration**: For existing accounts, do we retro-credit 5 tongues, or only apply to newly inserted players post-migration?

Yes, please retro credit five tongues.

11. **Gameplay constraints**: Any characters that should never be unlockable (admin/test-only), or any prerequisite relationships between characters?

Nope.

12. **Client surface**: Where should the Unlock CTA live (existing character picker, or a first-run modal)? Any copy or visual requirements?

Existing character picker. Use the same UI that we use for difficulty tiers.

13. **Concurrency**: OK to use a transaction with `FOR UPDATE` on the Lick Tongue inventory row to prevent double-spend on rapid clicks?

Okay.

14. **Telemetry**: Approve `character_unlocked` and `character_selected` event names/fields, or adjust?

If you confirm the answers, I’ll proceed to implement: trigger update, data model, endpoints, client wiring, and tests, mirroring the `spend-tongues.md` approach for difficulty tiers.
