I want to implement a Supabase backend for my game.

The backend should contain the following tables, at a minimum:

## player table:

- wallet_address (can be UID, if possible. otherwise have a separate UID)
- last_seen
- all of the schema needed for @xp-levels.md
- inventory (all of the items the player has. could make a separate table if needed)

## top_ups table:

- uid
- amount
- timestamp
- status (pending, paid, failed, etc.)

## games

- game uid
- player(s) UID
- difficulty

## loot

- uid
- type (erc721, erc1155, erc20)
- contract_address
- remaining
- last_claimed (the last time this loot was distributed to a player)
- reloaded_at (the last time this loot was reloaded)

## loot_distributions

- uid
- gameId
- playerId
- lootId
- amount
- timestamp
