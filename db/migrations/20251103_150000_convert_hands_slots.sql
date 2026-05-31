-- Convert legacy 'hands' slot assignments into explicit handLeft/handRight entries
-- This migration is prepared but should be applied only after deploying the
-- code changes that rely on explicit per-hand slots.

begin;

-- Update player_equipment rows that still use the legacy 'hands' slot.
-- We conservatively map all remaining rows to 'handRight'. Operators can
-- reassign specific rows manually if more precise data is available, but
-- this guarantees the new code path never encounters the removed value.
update public.player_equipment
   set slot = 'handRight'
 where lower(slot) = 'hands';

-- Normalise cached equipped wearables stored on the players table.
update public.players
   set equipped_wearables = (
     select jsonb_agg(
              case
                when coalesce(elem->>'slot', '') = 'hands' then
                  jsonb_set(elem, '{slot}', to_jsonb('handRight'::text))
                else
                  elem
              end
            )
       from jsonb_array_elements(coalesce(players.equipped_wearables, '[]'::jsonb)) elem
   )
 where exists (
   select 1
     from jsonb_array_elements(coalesce(players.equipped_wearables, '[]'::jsonb)) elem
    where coalesce(elem->>'slot', '') = 'hands'
 );

commit;
