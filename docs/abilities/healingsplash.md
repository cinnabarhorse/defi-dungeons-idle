### Healing Splash — Questions to Finalize Spec

Please answer inline. Once confirmed, I’ll implement the ability and wire it to the specified wearables.

### Behavior & Trigger

- **Trigger event**: Should Healing Splash trigger on grenade impact, on fuse timeout, or immediately on throw?

Only on impact.

- **Damage replacement**: Should the grenade deal zero damage to enemies entirely when this ability is active, or can it still apply knockback/other on-hit effects?

No damage to opponents.

- **Affects thrower**: Should the thrower be healed if within radius?

Yep.

- **Affects enemies/NPCs**: Should enemies or neutral NPCs ever be healed? Or strictly player entities only?

No, just players.

- **Fuse/bounce rules**: Use the existing grenade fuse/bounce behavior or detonate-on-contact?

Detonate on contact.

### Parameters & Defaults

- **radius**: Desired default radius value and unit (tiles or world units; what do you consider 1 tile)?

Whatever is being used throughout the game itself.

- **healAmount**: Flat HP number per target, or percentage of target max HP? If flat, specify default (e.g., 40 HP). If percent, specify default (e.g., 15%).

Just a Flat HP per target.

- **cooldownMs**: Confirm default 10000 ms (10 seconds). Is this value final for launch?

Yes.

- **overheal**: Allow overheal beyond max HP, or clamp at max HP?

Clamp at Mac AP.

- **falloff**: Uniform healing within radius or falloff by distance from the center? If falloff, provide the curve (linear, stepwise, etc.).

Uniform healing.

- **maxTargets**: Unlimited targets in radius, or cap the number of healed players per detonation?

Unlimited target.

### Targeting & Filtering

- **Allies only**: In mixed or future PvP scenarios, heal party/friends only, or any player character in radius?

Party and friends only. But you don't need to worry about that right now.

- **Summons/pets**: Should allied summons or AI companions be healed?

Yes.

- **Line of sight**: Respect line-of-sight and obstacles, or ignore LoS for healing?

Ignore line of sight.

### Items/Wearables Binding

- **Initial binding**: Confirm the initial sources are the milkshake wearable and the link bubbly wearable.

Yes.

- **Binding mechanism**: Do these wearables grant a grenade variant that always uses Healing Splash, or do they toggle an alternate fire mode on the existing grenade?

Yes, they are a grenade that always uses healing splash.

- **Ammo/economy**: Do these grenades consume the same ammo/resource as normal grenades? Any additional cost for Healing Splash?

No additional cost.

### Cooldown Semantics

- **Scope**: Is cooldown tracked per-player for this ability, shared across all grenades for that player, or per-item instance?

Per item.

- **Shared lockout**: If a player has multiple Healing Splash sources, should using one start the cooldown for all of them?

No. They are separate.

- **Cooldown reduction effects**: Should global cooldown reduction stats or buffs affect this ability?

No.

### UX, VFX, SFX

- **Visuals**: Preferred effect style (green splash/particles, ring, icon)? Reuse any existing assets?

Green splash would be great.

- **Numbers**: Show floating green healing numbers per player healed?

Yes.

- **HUD**: Any HUD indicator or tooltip update when equipped/available/on cooldown?

Yes, it should be shown in the grenade panel.

- **Audio**: Use existing heal sound or add a unique SFX?

Use existing heel sound.

### Balance & Interactions

- **Scaling**: Should healAmount scale with any player stat (e.g., power, level) or remain flat?

Currently just scale with the player stat.

- **Interaction with passives**: Any interactions with abilities like Life Steal, Critical Strike, Evade, Thorns, etc. (e.g., should not crit, cannot be evaded)?

No.

- **Environment**: Should the splash also affect breakables/props in any way (likely no)?

No.

### Server Authority & Anti‑Cheat

- **Authoritative side**: Confirm healing application and cooldown enforcement are fully server-authoritative.

Yes.

- **Action pipeline**: Should triggering follow the existing action system used for throws (e.g., startAction → server validates → broadcast result)? If a specific action type name is preferred, provide it.

Yes, please create a new action if needed.

- **Telemetry**: What events/metrics do you want logged (e.g., ability_used, healing_total, targets_healed, source_wearable)?

None for now.

### Edge Cases

- **No valid targets**: If no players are in range, still consume the grenade and trigger cooldown?

Yes.

- **Self at 0 HP**: If the thrower is downed the moment of detonation, should they still be healed and potentially revived, or no revive from this ability?

No revive.

- **Stacking**: Multiple Healing Splashes overlapping—allow additive healing per tick/event, or apply only the highest one?

Additive.

- **Cross‑realm/rooms**: Any cross-room restrictions needed, or always confined to the local room/instance?

No.

### Acceptance Criteria (for implementation sign‑off)

- **Minimum viable spec**: Provide final values for radius, healAmount (flat or %), cooldownMs, and whether thrower is included.

Up to you. milkshake should be significantly higher than grenade.

- **Wearable mapping**: Confirm exactly how milkshake and link bubbly enable this (grenade variant vs. mode toggle) and whether both use identical parameters.

It's just a normal grenade. But instead of damaging the opponent, it heals the player.

- **Defaults**: Confirm final default parameter values to encode in the ability registry.

Up to you.

### Optional: Confirm/Adjust Proposed Parameter Shape

```ts
interface HealingSplashParams {
  radius: number; // in tiles or world units (confirm)
  healAmount: number; // flat HP or percent (confirm meaning)
  cooldownMs: number; // default 10000
  affectsSelf?: boolean; // default true?
  alliesOnly?: boolean; // default true?
  allowOverheal?: boolean; // default false?
  falloff?: 'none' | 'linear'; // default 'none'?
  maxTargets?: number; // default undefined (unlimited)?
  detonation: 'onImpact' | 'onFuse'; // default 'onImpact'?
}
```

If you’d like different field names or defaults, please edit directly above.
