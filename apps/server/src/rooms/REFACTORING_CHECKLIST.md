# GameRoom.ts Refactoring Checklist

This document categorizes all methods and properties in GameRoom.ts to guide refactoring into two modules:

- `SharedGame.ts` - Shared functionality used by both modes
- `IdleMode.ts` - Idle game mode specific functionality

## Pattern to Follow

Based on `StagingRoom.ts`, the new modules should use stateless functions that take the room instance as the first parameter:

```typescript
export function someFunction(room: GameRoom, ...otherParams): void { ... }
```

---

## IDLE MODE SPECIFIC

### Core Idle Game Loop

- `idleTick(now: number)` - Main idle game loop (called every 1s)
- `processNextRoom(player: PlayerSchema)` - Handle room progression in idle mode
- `endPlayerTurn(player: PlayerSchema)` - End player's turn in idle combat

### Idle Combat System

- `processPlayerAttack(sessionId: string, player: PlayerSchema)` - Handle player attacks in idle combat
- `processEnemyAttack(player: PlayerSchema, attackers_list: any[])` - Handle enemy attacks in idle combat
- `processGrenade(sessionId: string, player: PlayerSchema)` - Handle grenade usage in idle mode
- `getEquippedGrenadeSlug(player: PlayerSchema)` - Get equipped grenade (used by idle combat)
- `updateEncounterProgress(player: PlayerSchema)` - Update encounter state after combat actions
- `logAction(player: PlayerSchema, message: string)` - Log action messages for idle encounters

### Idle Loot & Rewards

- `rollTreasureReward(player: PlayerSchema)` - Roll loot from treasure encounters
- `rollLootForEnemy(player: PlayerSchema, enemy: any)` - Roll loot from enemy defeats (idle version)
- `addLootToEncounter(player: PlayerSchema, drop: DroppedItemData)` - Add loot to idle encounter state

### Idle Message Handlers (in setupMessageHandlers)

- `'idle_enter_next_room'` handler
- `'idle_toggle_auto'` handler
- `'idle_restart_run'` handler
- `'idle_kite'` handler
- `'idle_grenade'` handler
- `'idle_start_ascension'` handler (appears twice, needs dedup)
- `'idle_combat_action'` handler
- `'idle_set_target'` handler

### Idle-Specific Properties

- `lastIdleTick: number` - Last idle tick timestamp
- (Note: `idleRoom` is on PlayerSchema, not GameRoom)

---

## SHARED FUNCTIONALITY

### Core Room Lifecycle

- `onCreate(options: GameRoomOptions)` - Room creation
- `onJoin(client: Client, options?)` - Player joins
- `onLeave(client: Client, consented: boolean)` - Player leaves
- `onDispose()` - Room disposal

### Auth & Session

- `onAuth(client: Client, _options, request?)` - Authentication
- `getClientBySessionId(sessionId: string)` - Get client by session
- `getPlayerIdForSession(sessionId: string)` - Get player ID for session
- `getSessionIdsForPlayer(playerId: string)` - Get sessions for player

### Shared Properties

- `msg: ServerBroadcaster` - Message broadcaster
- `now: number` - Current timestamp
- `mapGenerator: MapGenerator` - Map generator
- `currentGameId: string | null` - Current game ID
- `gameStatusFinalized: boolean` - Game status flag
- `hadAnyPlayers: boolean` - Had players flag
- `tickInterval: NodeJS.Timeout` - Tick interval
- `snapshotInterval: NodeJS.Timeout` - Snapshot interval
- `isPrivateRoom: boolean` - Private room flag
- `isAdminOnly: boolean` - Admin only flag
- `phase: RoomPhase` - Current phase
- `phaseChangedAt: number` - Phase change timestamp
- `runStartedAt: number | null` - Run start timestamp
- `stagingAutoCloseTimer: NodeJS.Timeout | null` - Staging auto-close timer
- `portalCountdownTimer: NodeJS.Timeout | null` - Portal countdown timer
- `lateJoinTimer: NodeJS.Timeout | null` - Late join timer
- `currentFloor: number` - Current floor
- `floorReached: number` - Floor reached
- `bossKilled: boolean` - Boss killed flag
- `preferredChunkName: string | undefined` - Preferred chunk
- `stagingEnabled: boolean` - Staging enabled

### Inventory Management

- `getInventoryKey(item: InventoryItemPayload)` - Get inventory key
- `applyInventoryDelta(sessionId, rawItem, delta, options?)` - Apply inventory delta
- `buildInventoryRemovalRequests(payload?)` - Build removal requests
- `applyRemovedItemsToSessionInventory(sessionId, removals)` - Apply removals
- `persistInventory(sessionId, itemsInput)` - Persist inventory
- `logInventoryDiff(playerId, previous, next)` - Log inventory changes

### Inventory Properties

- `playerInventories: Map<string, InventoryItemPayload[]>` - Player inventories

### Progression System

- `getProgressionProfile(sessionId: string)` - Get progression profile
- `setProgressionProfile(sessionId, profile, options?)` - Set progression profile
- `applyProgressionToPlayer(sessionId, options?)` - Apply progression to player
- `persistProgression(sessionId, profileInput?)` - Persist progression
- `withProgressionWriteLock(playerId, task)` - Lock for progression writes
- `getUnlockedTiersFromPlayer(sessionId: string)` - Get unlocked tiers

### Progression Properties

- `playerProgression: Map<string, ProgressionProfile>` - Player progression
- `progressionWriteQueues: Map<string, Promise<void>>` - Write queues

### Equipment System

- `getHandWeaponEntriesForPlayer(player: PlayerSchema)` - Get hand weapons
- `resolveCurrentHandWeaponIndex(player, weapons)` - Resolve active weapon index
- `selectActiveWeaponByIndex(player, weapons, index)` - Select active weapon
- `handleWeaponCycle(client: Client)` - Handle weapon cycling
- `handleSetActiveWeapon(client: Client, data?)` - Handle weapon selection
- `equipmentCanModify(playerId: string)` - Check if equipment can modify
- `equipmentBroadcastUpdate(payload: EquipmentBroadcastPayload)` - Broadcast equipment update

### Equipment Properties

- `playerEquipmentSnapshots: Map<string, string[]>` - Equipment snapshots

### Kill Streak System

- `ensureKillStreakForPlayer(sessionId, player, options?)` - Ensure kill streak profile
- `sendKillStreakProfileToClient(sessionId, profileInput?)` - Send profile to client
- `sendKillStreakResetToClient(sessionId, reason?)` - Send reset to client
- `resetKillStreakForSession(sessionId, options?)` - Reset kill streak
- `resetKillStreakForAllPlayers(options?)` - Reset all kill streaks
- `awardKillStreakUnitsToPlayer(sessionId, unitDelta, context)` - Award kill streak units
- `updateKillStreakDecay(now: number)` - Update kill streak decay (called in gameTick)

### Kill Streak Properties

- `killStreakBySession: Map<string, KillStreakProfile>` - Kill streak profiles

### XP & Leveling

- `awardXpToPlayer(sessionId: string, xpAmount: number, source?)` - Award XP
- `awardXpForEnemyDefeat(enemy, enemyId, attackType, killerId?)` - Award XP for enemy defeat
- `recordXpGain(sessionId, amount, resultingLevel)` - Record XP gain
- `recordLevelSnapshot(sessionId, level)` - Record level snapshot
- `getGroupXpMultiplier(partySize: number)` - Get group XP multiplier
- `getDifficultyXpMultiplier()` - Get difficulty XP multiplier

### Score System

- `ensurePlayerScoreState(playerId: string)` - Ensure score state
- `resetScoreTrackingForRun()` - Reset score tracking
- `scheduleScoreSync(sessionId: string)` - Schedule score sync
- `queueScoreDelta(sessionId: string, amount: number)` - Queue score delta
- `setPlayerScoreEligibilityByPlayerId(playerId, eligible)` - Set eligibility
- `markPlayerScoreIneligible(sessionId: string)` - Mark ineligible
- `flushPendingScores()` - Flush pending scores
- `cloneRuntimeStats(sessionId: string)` - Clone runtime stats
- `computeRunScoreForPlayer(playerId, stats?)` - Compute run score
- `persistPlayerRunScore(options)` - Persist run score

### Score Properties

- `playerScoreStateByPlayerId: Map<string, PlayerRuntimeScoreState>` - Score states
- `pendingScoreDeltas: Map<string, number>` - Pending deltas
- `persistedScorePlayerIds: Set<string>` - Persisted scores

### Game Metrics & Stats

- `recordKill(sessionId: string)` - Record kill
- `recordPlayerDeathStat(sessionId: string)` - Record death
- `recordCoinsCollected(sessionId: string, amount: number)` - Record coins
- `recordUsdcEarned(sessionId: string, amountBaseUnits: number)` - Record USDC
- `logEconomyTransaction(options)` - Log economy transaction
- `flushGamePlayerStats(sessionId, options?)` - Flush game player stats
- `persistGameMetrics(options?)` - Persist game metrics
- `syncGameMetricsImmediate()` - Sync metrics immediately
- `recordPostKillMetrics()` - Record post-kill metrics
- `syncGameMetrics()` - Sync game metrics
- `recordEnemyKill(enemy, enemyId, attackType, killerSessionId?, scoreAwardedBySession?)` - Record enemy kill
- `registerEnemyDrop(options)` - Register enemy drop

### Game Metrics Properties

- `gamePlayerStats: Map<string, GamePlayerRuntimeStats>` - Game player stats
- `playerDeathsThisRun: Set<string>` - Player deaths
- `playersDiedThisRunByPlayerId: Set<string>` - Players died this run
- `recentEnemyKillIds: Map<string, {...}>` - Recent enemy kills
- `entityLootDistributions: Map<string, {...}>` - Loot distributions

### High Stakes System

- `clearDailyQuestPayoutGuarantees()` - Clear payout guarantees
- `getDailyQuestBossBonus(playerId: string)` - Get boss bonus
- `applyHighStakesAttunementsForRun(targetPlayerId?, autoAttune?)` - Apply attunements
- `clearHighStakesForPlayer(playerId: string)` - Clear for player
- `clearHighStakesForRun()` - Clear for run
- `handleHighStakesBossKill(killerSessionId?, bossX?, bossY?)` - Handle boss kill
- `payStoredDailyQuestRewards(playerId, sessionId)` - Pay rewards

### High Stakes Properties

- `highStakesPlayerIds: Set<string>` - High stakes players
- `highStakesDateByPlayerId: Map<string, string>` - High stakes dates
- `highStakesBossBonusByPlayerId: Map<string, {usdc, ghst}>` - Boss bonuses
- `highStakesBossAllocationsByPlayerId: Map<string, {...}>` - Boss allocations
- `highStakesOperations: Map<string, Promise<void>>` - Operations

### Player Death & Health

- `handlePlayerDeath(sessionId: string, cause?: string)` - Handle player death
- `tryAutoHeal(player: PlayerSchema)` - Try auto heal
- `tryAutoRestoreMana(player: PlayerSchema)` - Try auto restore mana
- `handleHealPlayer(client: Client, data: {healAmount})` - Handle heal
- `handleUseManaPotion(client: Client)` - Handle mana potion
- `handleUseHealthPotion(client: Client)` - Handle health potion

### Enemy Death (Shared Interface)

- `handleEnemyDeath(enemy, enemyId, attackType?, killerId?)` - Handle enemy death (shared interface)

### NPC System

- `spawnNPCs()` - Spawn NPCs
- `spawnNPCsNearAnchor(anchor: {x, y})` - Spawn NPCs near anchor
- `handleNPCInteraction(client: Client, data: {npcId, dialogueId})` - Handle NPC interaction
- `handleNpcPurchase(client: Client, rawData: {npcId, itemId})` - Handle NPC purchase
- `getCurrencyQuantity(inventory?, currencyName)` - Get currency quantity
- `findCurrencyInventoryItem(inventory?, currencyName)` - Find currency item
- `isGoldCurrencyItem(item?, currencyName?)` - Check if gold currency
- `normalizeCurrencyType(value)` - Normalize currency type
- `currencyNamesMatch(existingName?, targetName?)` - Match currency names
- `normalizeCurrencyName(value?)` - Normalize currency name
- `mapShopItemToResult(shopItem, quantity)` - Map shop item to result
- `getDefaultItemColor(type: string)` - Get default item color

### NPC Properties

- `npcPurchaseCooldowns: Map<string, number>` - Purchase cooldowns

### Chest System

- `handleOpenChest(client: Client, data: {chestId})` - Handle chest open
- `allocateChestUsdcLoot(options)` - Allocate USDC loot
- `allocateChestGhstLoot(options)` - Allocate GHST loot

### Resource Harvesting

- `performResourceHarvest(playerId, resourceId, resourceType)` - Perform harvest

### Staging System (Shared)

- `initializeStagingEnvironment()` - Initialize staging (delegates to StagingRoom)
- `scheduleStagingAutoClose(deadlineMs: number)` - Schedule auto-close (delegates)
- `clearStagingAutoCloseTimer()` - Clear timer (delegates)
- `trackEntryFeeCharge(playerId, amountCents, chargedAtIso, refundable)` - Track fee (delegates)
- `markEntryFeesNonRefundable()` - Mark non-refundable (delegates)
- `setPhase(nextPhase, options?)` - Set room phase
- `refundEntryFee(playerId, reason, extraMetadata?)` - Refund fee (delegates)
- `scheduleLateJoinCutoff(deadlineMs: number)` - Schedule late join (delegates)
- `clearLateJoinTimer()` - Clear late join timer (delegates)
- `startStagingCountdown(client: Client)` - Start countdown (delegates)
- `handleStagingPortalInteraction(client: Client, data: {portalId})` - Handle staging portal (delegates)
- `beginDungeonRun(starterSessionId?)` - Begin dungeon run (delegates)

### Staging Properties

- `entryFeeLedger: Map<string, {...}>` - Entry fee ledger
- `stagingChunkLayoutData: Array<{x, y, chunkName}>` - Staging chunk layout
- `stagingSpawnPoints: Array<{x, y}>` - Staging spawn points

### Floor Management

- `markFloorReached(floorIndex: number)` - Mark floor reached
- `getFloorReached()` - Get floor reached
- `handleFloorAdvanced(nextFloor: number)` - Handle floor advanced

### Game Record & Registration

- `createGameRecord(options?)` - Create game record
- `registerGamePlayer(sessionId, playerId, profile, player)` - Register game player
- `finalizeGameStatus(status, metadata?)` - Finalize game status
- `updateMetadata(extra?)` - Update metadata

### Messaging & Communication

- `setupMessageHandlers()` - Setup all message handlers
- `handleEmote(client: Client, input: EmoteInput)` - Handle emote
- `handleChat(client: Client, message: {text})` - Handle chat
- `broadcastSnapshot()` - Broadcast snapshot
- `emitMatchEvent(eventName, payload?)` - Emit match event
- `sendKillCountUpdate(sessionId, kills)` - Send kill count update

### Item Management

- `handleDestroyItem(client: Client, payload)` - Handle destroy item
- `handleDropItem(client: Client, payload)` - Handle drop item
- `handleProgressionSync(client: Client, data)` - Handle progression sync

### Spell System (Shared)

- Message handler for `'spell_autocast'` (in setupMessageHandlers)

### Utility Methods

- `getCurrentClientCount()` - Get current client count
- `generateRoomCode()` - Generate room code
- `loadChunkSetsForRuntime()` - Load chunk sets
- `logGameEvent(event, message, extra?)` - Log game event

### Performance & Monitoring

- `setupGameLoop()` - Setup game loop
- `recordTickSample(ms: number)` - Record tick sample
- `startPerfSampler()` - Start performance sampler

### Performance Properties

- `tickSamples: number[]` - Tick samples
- `perfInterval: NodeJS.Timeout | null` - Performance interval
- `lastCpuUsage: NodeJS.CpuUsage | null` - Last CPU usage
- `lastCpuTimeMs: number` - Last CPU time

---

## REFACTORING STRATEGY

### Phase 1: Create SharedGame.ts

1. Extract all shared methods and properties
2. Create stateless functions taking `room: GameRoom` as first parameter
3. Export shared types and interfaces
4. Keep backward compatibility by maintaining method signatures in GameRoom

### Phase 2: Create IdleMode.ts

1. Extract all idle-specific methods
2. Create stateless functions following same pattern
3. Export idle-specific types if needed

### Phase 3: Update GameRoom.ts

1. Import functions from new modules
2. Replace method implementations with calls to module functions
3. Pass `this` as first parameter to maintain context
4. Keep public API unchanged for backward compatibility

### Phase 4: Testing

1. Verify idle mode works correctly
2. Verify shared functionality works for idle mode
3. Check for any circular dependencies

---

# page.tsx Refactoring Checklist (Client)

This section categorizes the components, hooks, and logic within `apps/client/src/app/page.tsx` to guide its refactoring into modular components.

## IDLE MODE SPECIFIC (Client)

### State & Hooks

- `useIdleGame` hook usage
- `idleGameState` constant
- `lastKnownIdleStateRef`
- `idleRunStatus` & `idlePlayerHp` constants

### Effects

- `useEffect` monitoring `idleRunStatus` (setting `runEndedNormallyRef`)
- `useEffect` syncing `lastKnownIdleStateRef` with `idleGameState`

### Logic in Handlers

- `room.onStateChange` - Idle run end detection block
- `room.onLeave` - Idle run end detection & data capture block

### UI Rendering

- `IdleDungeonScreen` component rendering

---

## SHARED FUNCTIONALITY (Client)

### Core Session & Connection

- `useSession` hook
- `useRoomManagement` hook
- `ColyseusClient` instantiation and connection logic (`handleStartGame`)
- `handleDisconnect` / `performDisconnect`
- `activeRoom` state
- `currentRoomId`, `hostSessionId`, `clientSessionId` state sync

### Lobby System

- `Lobby` component rendering
- `handleCharacterSelect`
- `handleDifficultySelect`
- `handleUnlockCharacter`
- `handleNavigateToTopUp`
- `loadLeveragePreference` / `saveLeveragePreference`
- `loadAutoAscendFloorPreference` / `saveAutoAscendFloorPreference`

### Web3 & Auth

- `WalletConnectControl` rendering
- `useEntryCost` hook

### Utilities

- `getServerUrlForRegion`
- `formatWalletLabel`
- `handleShowToast` / `ToastNotification` system

---

## REFACTORING STRATEGY (Client)

### Phase 1: Extract Shared Logic

1. **GameController Hook**: Extract connection, session, and room state management into `useGameController.ts`.
2. **LobbyController Hook**: Extract lobby-specific logic (character select, preferences, entry cost) into `useLobbyController.ts`.

### Phase 2: Create IdleGameContainer

1. Create `IdleGameContainer.tsx`.
2. Move `useIdleGame`, `IdleDungeonScreen`, and idle-specific effects (`onStateChange`, `onLeave` idle logic) into this container.
3. Pass necessary props (activeRoom, session info) from parent.

### Phase 3: Simplify page.tsx

1. `page.tsx` becomes a high-level router/switcher.
2. It conditionally renders `<Lobby />` or `<IdleGameContainer />` based on `gameStarted`.
3. Significantly reduces file size and complexity.
