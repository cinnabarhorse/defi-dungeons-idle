## Bash (Passive Stun) — Pre‑implementation Questions

Please answer these to finalize the spec before we implement.

### Required numbers

- **Chance to Stun (%)**: 20
- **Stun Duration (seconds)**: 1.25

### Trigger and scope

- **Trigger source**: Basic attacks only, or all damage sources/abilities?

Melee, and grenades only.

- **On-hit vs on-attack**: Proc on successful hit that deals damage, or on attack attempt?

Successful hit only.

- **Weapon types**: Melee only, or also ranged/projectile attacks?

Melee + grenade.

- **Multi-hit/AoE**: For cleave or multi-hit/projectiles, can Bash roll once per target per attack, or once per projectile/hit?

Once per projectile/hit.

- **Critical interaction**: Can a hit both crit and stun in the same event?

yes

### Proc mechanics and cooldowns

- **Internal cooldown (ICD)**: None, global, per-attacker, or per-target? If present, how long (seconds)?

NOne

- **Proc roll timing**: Roll once per attack animation, or per-hit/per-target?

Once per hit per target

- **Guaranteed proc after N misses**: Any pity/stacking mechanic?

Not right now

### Stacking, refresh, and diminishing returns

- **While target is already stunned**: New proc ignored, refresh to full, or extend up to a max cap?

Refresh to full

- **Max stun cap**: Hard cap on total stun duration from consecutive procs?

No

- **Diminishing returns (DR)**: Any DR system (e.g., 50% duration for successive stuns within X seconds)? Provide formula or table if yes.

No

### Valid targets and immunity

- **Targets**: Enemies only (PvE), players (PvP), bosses, elites, summons?

All

- **Immunity/tenacity**: Any per-enemy stun resistance/tenacity that scales duration or proc chance?

Nope

- **Boss rules**: Immune, partially resistant (e.g., 50% duration), or normal?

none

### Stun behavior

- **Action lock**: Prevent movement, basic attacks, ability casts, and item use?

Yes, all prevented

- **Interrupts**: Does stun break/interrupt ongoing windups/channels/casts?

yes

- **Break on damage**: Should taking damage end stun early (usually no)?

No

- **AI handling**: Should stunned AI drop current path/target, or resume after stun expires?

Drop current path

### Duration model and scaling

- **PvE vs PvP**: Separate durations and/or proc chances?

No

- **Scaling**: Scale with ability level/rarity, character stats (e.g., STR), or item affixes?

Yes — configured per weapon via ability params (chance/duration).

### UI/UX

- **Status icon**: Provide an icon name/asset for the stunned state.

Just add the text "Stunned" above their head

- **VFX/SFX**: Any specific effect and sound to play on stun application/expiration?

Not yet

- **Tooltip copy**: Provide final text for ability description.

### Networking, authority, and logging

- **Authority**: Confirm server-authoritative application and timing of stun.

Yes server authoritative. Sensible defaults.

- **Events**: Desired server → client message (e.g., `status_applied: { type: 'stun', durationMs }`).

Yes and use the @StatusSystem.ts

- **Telemetry**: Log `stun_applied` with attackerId, targetId, durationMs, and source ability.

### Data and config placement

- **Definition location**: Add ability config in `data/abilities.ts` (client) and mirror in `apps/server/src/data/abilities.ts` (server)?

Yes

- **Status model**: Represent stun as a timed status effect (e.g., `stunnedUntilMs`) on the server entity state?

Yes

### Suggested defaults (optional — edit freely)

- **Chance to Stun**: 20%
- **Duration**: 1.25s (PvE), 0.75s (PvP)
- **ICD**: 2.0s per target (prevents stunlock), no global ICD
- **Trigger**: On successful basic-attack hit that deals damage; roll once per target per attack
- **Stacking**: Does not stack; refreshes duration if re-applied; 2.5s max cap
- **Immunity**: Bosses 50% duration; elites 75% duration; minions 100%
- **Behavior**: Full action lock; interrupts windups; does not break on damage

Looks good

### Acceptance criteria (for later implementation)

- Applying a basic attack that procs Bash stuns valid targets for the configured duration.
- Targets under stun cannot move, attack, or cast; AI resumes after expiration.
- Stun respects ICD, stacking/refresh rules, and PvE/PvP/boss modifiers.
- Visual/SFX feedback shown; tooltip and logs are correct.

Initial Weapons:
All melee with hammerType
Grenades: Basketball and Coconut

### Implementation snapshot

- Passive stun applied on melee hits from hammer-class weapons (`thaave-hammer`, `pickaxe`, `bitcoin-guitar`) and on `basketball`/`coconut` grenades.
- Base parameters: 20% proc chance, 1.25s duration; reapplying refreshes the timer (no stacking or ICD).
