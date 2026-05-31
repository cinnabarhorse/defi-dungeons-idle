### Armor system – questions to clarify before implementation

Please answer these to lock the design. I will implement immediately after.

### Scope and identity

- **Single source of truth for characters**: Which file should we extend with equipment as the canonical source?
  - `data/characters.ts` (repo root)

`data/wearables.ts` Should be the source of truth for all forms of equipment. Then, in characters.ts, each character should import the equipment that it's using. So, for example, Bushido gotchi has the Yoroi armor equipped. Then in the characters.ts file under Bushido gotchi you would have the yoroi armor as an item in the equipment array for `body`.

- `apps/client/src/data/characters.ts`
- `apps/server/src/data/characters.ts`
- If root is canonical, should we extend `scripts/generate-shared-files.ts` to propagate to client/server?

Yes.

- **Wearable reference format**: How should a character reference a wearable?
  - numeric id (e.g., 314)
  - canonical name (e.g., "yoroi armor")
  - stable slug (e.g., `yoroi-armor`)

I think it's best to use the stable slug method.

- **Armor scope**: Are all entries in `data/wearables.ts` potentially equipable armor, or only a subset? If subset, how do we tag them (e.g., `category: 'armor'`)?

Not all of them are armor. There's only a certain subcategory that are armor. You can also see in the wearables.ts file, I've started grouping certain wearables based on different types of armor, such as light armor or heavy armor.

- **Non-armor equipment**: Should non-armor wearables (rings/amulets/capes) also be able to grant effects? If yes, should we generalize to an "equipment effects" system rather than "armor-only"?

Yes, that's a great point. This is really more of an equipment system rather than an armor system.

- **Ownership model**: Can multiple characters equip the same wearable concurrently in current game modes, or is equipment uniquely owned per run/session?

Yes, they can.

### Equipment model and constraints

- **Slots**: What slots exist? Examples: `head`, `chest`, `legs`, `boots`, `gloves`, `weapon`, `offhand`, `accessory1`, `accessory2`. Or do you prefer free-form lists without slots?

TBD, let's use the current slots that already exist, such as body, eyes, face, hands, etc.

- **Slot limits**: One item per slot? Are multiple accessories allowed?

Yes, one item per slot. Except for hands, there are two slots for hands.

- **Set bonuses**: Do we want set bonuses (e.g., Samurai/Yoroi set grants an extra effect when multiple pieces are equipped)? If yes, how should we define and detect sets?

We could do. You can include that in the system, but we won't have any set bonuses for now.

- **Exclusivity rules**: Any mutual exclusions (e.g., heavy vs light armor cannot mix; only one chest piece)?

Yes, there's only one armor equipped per character.

### Effects design

- **Which stats can armor modify?** Please check all that apply and add others:
  - maxHealth (flat or percent)
  - armor (unified mitigation scalar)
  - armorRating/mitigation curve
  - blockChance
  - dodgeChance
  - movementSpeed (flat or percent)
  - attackSpeed / cooldownReduction
  - critChance / critDamage
  - lifesteal / on-hit effects
  - status resistances (poison/bleed/slow/stun/freeze/burn)
  - elemental/typed resistances (physical/fire/ice/lightning/poison/magic)
  - thorns/reflect

That's a great initial list. Let's start with that.

- **Damage types**: What incoming damage types currently exist in combat? Please confirm the list we should support.

Currently we only have basic melee and range, we don't have specific types of damage yet.

- **Operators**: Should effects support additive, multiplicative, and clamped/min/max operators? If so, what merge precedence do you prefer (e.g., additive, then multiplicative, then clamp caps)?

Whatever is industry standard for in the nor'r'p'v's.

- **Duration**: Are effects purely passive while equipped, or do we need time-limited/conditional effects (on-crit, below 30% HP, vs specific enemy types)?

Currently they're all going to be passive, but I think we will also add in active abilities.

- **Decoupling location**: Should the effect metadata live next to the wearable definition or in a separate registry keyed by wearable id/slug to keep wearables and characters decoupled?

Yes, exactly. The effects will be in the wearables file and the character will import the wearable or equipment.

- **Visual hints**: Do we need optional visual effect hints per wearable (glow, palette, trail), even if logic is server-authoritative?

Yes, it's possible we will add this, but you don't need to do that in the first pass.

### Stacking rules

- **Combining multiple items**: How do multiple items affecting the same stat combine?
  - additive first, multiplicative second, then clamp
  - explicit caps (e.g., armor-derived mitigation ≤ 80%)
  - movement speed min/max bounds

Whatever is industry standard.

- **Exclusive flags**: If two items provide the same exclusive boolean (e.g., `cannotBeSlowed`), do we OR them or should one override?
- **Diminishing returns**: Apply DR curves for dodge/crit/resistances?

Whatever is industry standard.

### Server authority and sync

- **Source of truth**: Confirm server is the authoritative source for equipment and effects application; clients only render derived results and visuals.

Yes, that's correct.

- **Where to apply effects**: Preferred integration point(s):
  - central `deriveStats(baseStats, equipment, buffs)` during spawn and on equip changes
  - during damage calculation pipeline
  - both (precompute derived stats, then use them in damage calc)

whatever results in the fewest amount of code changed in different places. Let's try to avoid spaghetti code.

We already have the abilities.ts file. So you might want to create an effects.ts that is similar, but for specific effects like the armor.

- **Events**: Which events exist/are needed: `equip`, `unequip`, `loadoutChanged`, `characterSpawned`, `revive`? Should these be routed through the existing action system?

The character will currently not be able to change their armor in the game, so we don't need to worry about that at the moment. But I think it would be a good idea to have those events, such as equip and unequip, and load out changed.

- **Network schema**: Should we extend server room API types to include `equippedWearables` and optionally `derivedStats` for clients?

Yes.

- **Persistence**: Are loadouts saved between sessions anywhere, or rehydrated from static `characters.ts` each run?

Currently they're rehydrated from staticcharacters.ts, but that will soon be updated and they'll be loaded in dynamically.

### Authoring shape for characters.ts

- **Field name and shape**: Which do you prefer?
  - `equippedWearables: number[]` (ids)
  - `equippedWearables: string[]` (names)
  - `equipment: { slot: 'head' | 'chest' | ...; wearableId: number }[]`
  - `equipment: Record<Slot, WearableRef | null>`

**Update:** We now map character equipment directly to slots via an object (e.g. `{ handRight: 'haanzo-katana' }`). This keeps slot assignment explicit (including `handLeft` / `handRight`) and avoids ambiguous `'hands'` values.

- **Stable identity**: Introduce stable slugs for wearables to avoid breakage from name changes?

Yes.

- **Validation**: Add a script/lint step to validate that equipment references exist and respect slot rules?

Absolutely.

- **Client UI**: Should we display equipment in builds/character UI now or defer until after logic lands?

We can defer to later on that.

### Migration and seeding

- **Initial loadouts**: Which characters launch with predefined armor? Please confirm Bushido Gotchi:
  - equip "yoroi armor" (id 314) — which slot?
  - any matching helm/gloves/boots?

Yes, the bushido gotchi has the yoroi armor and the kabuto helmet (313) equipped.

- **Other characters**: Any other characters to seed with starting armor?

Not yet.

- **Backwards compatibility**: Characters without equipment should behave as before (empty equipment), correct?

Yes, exactly.

- **Performance**: Any need to precompute and cache (characterId → derived stats) at boot?

No, probably not.

### Security/cheat resistance

- **Client inputs**: Should client-driven equipment changes be disallowed except via authorized actions? Any admin/dev modes that bypass restrictions?

Not at the moment.
