### Abilities System – Initial Prompt

> I want to create a new system called abilities. It should be part of the data structure in the data folder. Abilities can be inherited by characters. They can also be inherited by enemies. They can also be inherited by weapons. Or wearables. The first ability I want to add is called life steal. When the enemy or the player does damage to their opponent, they steal a certain portion of the HP that they dealt to that opponent. So if I have 5% life steal and I do 100% damage, I will gain 5 HP. Before you begin coding this feature, please ask some clarifying questions to help me think through it and also show that you understand the feature.

### Clarifying questions for the abilities system

- **Scope**
  - Should life steal apply to both players and enemies? Any exceptions (e.g., bosses)?

Yes, it should apply to both players and enemies, although we could have an ability called Life Steal Resistance that makes the enemy resistant to this feature or ability.

- Should it apply to all damage sources: melee, ranged, AoE, projectile hits, on-hit effects, and DoT ticks? Or only direct hits?

Let's make it melee only. For now. And it can also stack with other abilities that we add in the future, such as a cleave attack.

- **Computation**
  - Should life steal be calculated from final damage dealt after all mitigations/resistances? (recommended)

Yes.

- For overkill damage (e.g., target had 3 HP left, hit deals 20), should life steal be based on 3 or 20?

Three, it should not be based on overkill.

- If damage is fully blocked/absorbed, should life steal be 0?

Yes.

- **Values and units**
  - Store magnitude as a fraction or percent? e.g., 0.05 vs 5 for “5%”. (I’ll default to 0.05.)

Up to you, but I probably think a fraction or a decimal is better.

- Rounding: floor, ceil, or round to nearest when converting healed amount to integer HP? Minimum 1 HP heal when > 0?

Yes, you can round up to the nearest integer.

- Global cap on total life steal (e.g., max 30%)?

No, there's no global count.

- **Stacking and inheritance**
  - If multiple sources grant life steal (character + weapon + wearable), should they stack additively (e.g., 5% + 5% = 10%)? Any multiplicative/diminishing returns?

Yes, they should stack additively. 5 plus 5 equals 10.

- Should we support per-source parameters (e.g., `life_steal: 0.03` from character + `0.02` from wearable), aggregated at runtime?

Yes.

- Any future “conditional” stacking (e.g., only melee/ranged, only vs elites)?

I'm not sure about that.

- **Health rules**
  - Can life steal overheal beyond max HP? If not, cap at max. If yes, should overheal become a temporary shield/overheal buffer?

No, you cannot exceed your max HP with Life Steel feature.

- Any per-hit or per-second healing caps?

No caps.

- **Game interactions**
  - Should life steal work in PvP as well as PvE?

Yes.

- Apply on each hit instance for multi-hit/projectile shotguns? Per target for AoE?

For aoe, such as a cleat melee attack, it will apply per target.

- Exclude environmental objects or friendly targets?

Yes.

- **Data model**
  - Create `data/abilities.ts` with an ability registry (id, label, description, default params), then reference abilities from `characters.ts`, `enemies.ts`, `wearables.ts`, and weapons as:
    - `abilities: [{ id: 'life-steal', params: { percent: 0.05 } }]`

I'm thinking it the other way. I think we should have the abilities listed out in the data file, but then we should kind of import them into the characters and other places where they're used. So the character will import the abilities on the abilities data file.

- Any other ability metadata you want up front (tags like passive/active, category, stacking policy, max values)?

Passive vs Active is a good idea. Any parameters such as melee versus ranged or aoe could also be added here. Basically everything that we need for the configuration of this ability on a player, weapon, or enemy, or item should be part of the config.

- **Engine integration**
  - Confirm we implement life steal on the server in `apps/server` damage-resolution path so it’s authoritative and anti-cheat.

Yes.

- Client will reflect HP changes from server state updates; do you want local prediction for snappier UI, or server-only?

For now, let's just keep it server only.

- **UI/FX**
  - Show green heal floaters on life steal events? Any SFX?

Yes, we could show the number amount of HP that was returned to the player, just like we have the HP that was deducted from the player every time they get hit. It could be next to it.

- Display total life steal value in HUD/tooltips (e.g., aggregated % in character panel)?

Yes, that would be cool.

- **Rollout**
  - Start with adding life steal to a test character/enemy/wearable for validation?

Yes, add it to the bushido gotchi.

- Any initial balancing targets (e.g., player baseline 5%, enemies 2%)?

Let's make it 5%.

---

You can answer inline under each question or annotate decisions at the top. Once confirmed, implementation will follow these decisions.
