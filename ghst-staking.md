---
task: GHST Staking
test_command: "pnpm lint && pnpm typecheck && pnpm test:agent"
prd: "ghst-staking.md"
---
# GHST Staking
Enable GHST staking in the top-up flow and reflect it in the client UI. The
staking contract already supports GHST; this work wires it through the server
config, client types/constants, and UI.

## Success Criteria
- [x] Wire GHST staking end-to-end (server topup config + token maps, client
  topup types/constants/mappers, subgraph/goldsky decoding, and UI enablement
  in Lobby/Upgrade dialog + Topup form).
- [x] Link locked difficulty tiers to the upgrade dialog so players can stake
  and unlock higher difficulties.
