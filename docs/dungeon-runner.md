## Dungeon Runner — Core Mechanics

### Core loop

- **Clarity**: Explore → fight → loot → upgrade → face a spike (miniboss/boss) → repeat.
- **Short runs**: 5–15 minutes, instant restarts, micro-goals each room.
- **Clear goals**: Keys, gates, shrines, and visible "next payoff" to keep momentum.

### Combat feel

- **Responsiveness**: Dodge with i-frames, animation cancels, snappy acceleration.
- **Readability**: Enemy telegraphs, elite affixes, distinct roles (bruiser/sniper/support/summoner).
- **Feedback**: Hitstop, crunchy SFX, concise damage numbers/crit pop, consistent TTK bands.

### Buildcrafting

- **Synergies**: Boons/items that multiply each other (on-hit, AoE, DoT, summon, crit).
- **Trade-offs**: Glass-cannon vs sustain; stamina/weight; ramp-up vs burst.
- **Drafting**: 1-of-3 upgrade choices; limited respec; per-run boons + modest meta unlocks.

### Loot and economy

- **Chase & floor**: Uniques/legendaries + deterministic crafting/pity to avoid droughts.
- **Smart loot**: Bias toward current build without hard-locking; clear rarity color/FX.
- **Risk loot**: Cursed/mimic/locked chests; optional corruption for stronger rewards.

### Level generation and exploration

- **Curated procedural**: Hand-authored room blueprints + procedural connectors for loops, secrets, and variety.
- **Room modifiers**: "Blizzard," "Double elites," "Low light," changing tactics mid-run.
- **Fog-of-war/LOS**: Tension and ambushes; light radius as a tactical stat.

### Risk–reward levers

- **Corruption/greed meter**: Power now vs danger later.
- **Altars/curses**: Strong boons with meaningful drawbacks.
- **Timed/optional challenges**: Extra loot if you clear fast or take elites.

### Pacing and difficulty

- **Arc**: Density ramps → miniboss → recovery room → boss.
- **Adaptive knobs**: Enemy packs, elite rates, hazard frequency; avoid rubber-band unfairness.
- **Counterplay**: Status cleanses, stagger/break bars, interrupts; every threat has an answer.

### Meta progression (light-touch)

- **Unlocks**: Classes, starter runes, cosmetics; avoid permanent power creep that trivializes runs.
- **Collections**: Achievements/codex that teach mechanics and seed goals.

### Social and live ops

- **Daily/weekly seeds**: Fixed layouts with leaderboards and modifiers.
- **Seasonal ladders**: Rotating affix pools; boss rushes.
- **Co-op**: Complementary roles, shared risks, anti-grief rules.

### Fairness, integrity, and polish

- **Server-authoritative critical logic**: Combat, drops, timers to prevent cheating.
- **Transparent RNG**: Pseudo-random with pity; show odds where appropriate.
- **Performance/accessibility**: 60fps, low input latency, colorblind/motion options, readable UI.

### High-impact "add just five" set

- **Dodge with i-frames + stamina**, **elite affixes**, **1-of-3 shrines**, **curses/corruption chests**, **daily seed with leaderboard**.

### Key takeaways

- **Combat**: Tight, readable, instant feedback.
- **Loot/builds**: Synergistic and risky with safety valves.
- **Runs**: Curated-procedural, short, with daily challenges and fair systems.

### Run endings

- **Default**: Kill boss → an extraction portal opens. Choose to extract (bank all rewards) or push an optional post-boss escalation for higher multipliers.
- **Soft timer, not hard fail**: Use a rising threat/corruption meter that increases spawn rates, elite affixes, and hazards. Avoid strict timeouts in standard runs; reserve hard timers for time-attack modes.
- **Mid-run banking**: Optional extraction shrines that bank 50–75% of loot; continuing increases both risk and reward.
- **Fail states**: Death ends the run; extracted/banked loot is safe, unbanked is lost.
- **Anti-cheat**: Make boss kill flags, timers, extraction, and loot banking server-authoritative to prevent spoofing.
- **Variants**: Boss rush (multi-boss chain), key-item objective + evac, survival until drop-ship/portal arrives.
