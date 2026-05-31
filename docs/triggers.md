### Database triggers in gotchiverse-live

This project uses Postgres triggers for small, atomic side-effects that must occur whenever certain records are created or updated. Triggers keep invariants close to the data and guarantee they run even if multiple code paths touch the same tables.

Key principles:

- Keep triggers minimal and deterministic; avoid complex logic and external calls.
- Prefer AFTER triggers for side-effects that should see the final row state.
- Avoid double-accounting: when a trigger owns an invariant, do not repeat it in application code.
- Make every trigger addition/removal via SQL migrations; never ad-hoc in production.

Current triggers:

- players_grant_signup_bonus (AFTER INSERT on `players`)
  - Function: `grant_signup_bonus()`
  - Purpose: Grant 5 Lick Tongues to every new player.
  - Effects:
    - Upsert Lick Tongue inventory (`player_inventories`)
    - Update `players.lick_tongue_count`
  - Location:
    - Migration: `db/migrations/20250928_000018_grant_signup_bonus_trigger.sql`

Application code guidelines:

- Do not grant signup bonuses in code. The trigger enforces this invariant.
- Credits bonuses are deprecated; new bonuses should flow through inventory.

Testing notes:

- In local/dev, run migrations before testing to ensure the trigger exists.
- Create a new wallet/player and verify:
  - Lick Tongues are granted on first insert

Operations:

- To disable the signup bonus (e.g., via feature change), ship a migration to `drop trigger players_grant_signup_bonus on players;` and optionally `drop function grant_signup_bonus();` Then remove or update documentation in this file.
