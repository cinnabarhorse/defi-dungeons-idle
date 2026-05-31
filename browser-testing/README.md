# Browser Testing

This folder contains structured browser test specifications for the Gotchiverse Live game. Each test file provides step-by-step instructions that can be executed by an AI agent or human tester.

## Quick Start

1. Start the development servers (if not running):
   ```bash
   # Terminal 1 - Server
   cd apps/server && pnpm dev
   
   # Terminal 2 - Client
   cd apps/client && pnpm dev
   ```
2. Open the test file you want to run
3. Follow the Dev Mode URL and steps (use `?dev=true` for dev wallet login)
4. Verify success criteria
5. After testing, shut down any servers you started

## Test Files

| File | Feature | Priority |
|------|---------|----------|
| [milkshake-test.md](./milkshake-test.md) | Milkshake Healing Grenade | High |
| [dailyquest-test.md](./dailyquest-test.md) | Daily Quest Competition Flow | High |
| [potion-auto-use-test.md](./potion-auto-use-test.md) | Health Potion Auto-Use System | High |
| [wizard-ability-test.md](./wizard-ability-test.md) | Wizard Spell Abilities | Medium |

## Troubleshooting

**READ THIS FIRST:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Common issues and solutions for browser testing, including:
- Daily runs exhausted → Use `devSkipEntryFee=true` in dev mode
- Server not starting → Check SUPABASE_URL config
- Daily quest locked → Use `/api/player/lick-tongues/top-up`
- Daily quest depleted → Use `/api/daily-runs/dev-replenish`
- Dying from poison despite having potions → See bug fix notes in TROUBLESHOOTING.md

## Creating New Tests

1. Copy `TEMPLATE.md` to a new file (e.g., `feature-name-test.md`)
2. Fill in the test overview, prerequisites, and steps
3. Define clear success criteria
4. Add troubleshooting tips
5. List related files for debugging

## Test File Structure

Each test file follows this structure:

```
## Test Overview       - Test ID, feature, priority
## Prerequisites       - Server requirements, dev mode config
## Test Steps          - Numbered steps with actions and expected results
## Success Criteria    - Pass/fail conditions
## Test Data           - Relevant code snippets and expected values
## Troubleshooting     - Common issues and fixes
## Related Files       - Source files for debugging
## Test Execution Log  - History of test runs
```

## Dev Mode Parameters

All browser tests use the dev mode system. Common parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `devMode=true` | boolean | Enable dev mode (required) |
| `devEquipment=slug1,slug2` | string | Override equipment |
| `devHealthPotions=N` | number | Set health potion count |
| `devManaPotions=N` | number | Set mana potion count |
| `devStartHp=N` | number (0-100) | Starting HP percentage |
| `devStartMana=N` | number (0-100) | Starting mana percentage |
| `devStartFloor=N` | number | Starting floor number |

See [devmode.md](../devmode.md) for complete documentation.

## Running Tests with AI Agent

When asking an AI agent to run a browser test:

1. Reference the test file: "Run the test in `browser-testing/grenade-test.md`"
2. The agent will:
   - Start servers if needed
   - Navigate to the dev mode URL
   - Execute each step
   - Verify success criteria
   - Report results
3. After testing, the agent should shut down any servers it started

## Best Practices

- **Isolation**: Each test should be independent and not rely on previous tests
- **Clear Steps**: Use specific, actionable instructions
- **Verifiable Criteria**: Success criteria should be objectively verifiable
- **Dev Mode**: Always use dev mode for reproducible test conditions
- **Cleanup**: Shut down servers after testing to avoid port conflicts


