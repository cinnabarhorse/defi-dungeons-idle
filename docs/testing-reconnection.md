# Testing Player ID-Based Reconnection

This guide explains how to test the player ID-based reconnection implementation for dev hot-reload.

## Prerequisites

1. **Development environment running**:
   ```bash
   pnpm start
   ```
   This starts both client (port 3001) and server (port 1999).

2. **Browser DevTools open**:
   - Open browser console to see logs
   - Open Network tab to monitor WebSocket connections

3. **Server logs visible**:
   - Terminal showing server logs (tsx watch output)

## Test Scenario 1: Basic Reconnection Flow

### Steps:

1. **Start the game**:
   - Navigate to `http://localhost:3001`
   - Connect wallet (if required)
   - Select character and click "Play Now"
   - Wait for game to load and player to spawn

2. **Move around**:
   - Move your player to a specific location (note the coordinates)
   - Pick up some items (if available)
   - Check your HP/level/stats

3. **Trigger server restart**:
   - Make a small code change in `apps/server/src/rooms/GameRoom.ts` (e.g., add a comment)
   - Save the file
   - Watch the terminal - `tsx watch` should detect the change and restart the server

4. **Observe disconnection**:
   - Client should detect disconnect (check browser console)
   - Look for log: `💾 Stored rejoin data for player {playerId} in room {roomId}`
   - Page should NOT auto-refresh (we removed that)

5. **Manually refresh** (or wait for auto-rejoin):
   - Refresh the page (`Cmd+R` or `F5`)
   - OR wait for the auto-rejoin useEffect to trigger

6. **Verify reconnection**:
   - Check browser console for: `🔄 Dev auto-rejoin: Rejoining room {roomId}`
   - Game should reconnect automatically
   - Player should be at the SAME position as before restart
   - Player HP/stats should be preserved
   - Inventory should be intact

### Expected Server Logs:

```
🔄 Server shutting down, caching room {stateId} to disk...
💾 Room {stateId} cached to disk successfully!
💾 onCacheRoom called
   Players: 1
   SessionPlayerIds: 1
💾 Cached 1 player snapshots (keyed by playerId)
```

After restart:
```
♻️ Found cached room data from {stateId}, restoring...
  - Restored 1 playerId-to-session mappings
  - Restored 1 player snapshots
  - Restored {N} player inventories
  ...
✅ Room state restored from cache!
```

When player rejoins:
```
Player {newSessionId} joined room {roomId}
♻️ Restoring player {playerId} from cache (old session: {oldSessionId}, new session: {newSessionId})
🔄 Migrating session data from {oldSessionId} to {newSessionId} for player {playerId}
✅ Session data migration complete
✅ Restored player {playerId} at position ({x}, {y})
```

## Test Scenario 2: Multiple Players

### Steps:

1. **Start game with 2+ players**:
   - Open game in 2 different browser windows/tabs
   - Both players join the same room
   - Move to different positions

2. **Trigger server restart**:
   - Make a code change and save

3. **Both players refresh**:
   - Refresh both browser windows

4. **Verify**:
   - Both players should reconnect
   - Both should be at their previous positions
   - Both should have their stats/inventory preserved

### Expected Behavior:
- Each player gets their own snapshot keyed by their `playerId`
- Each player's session data is migrated independently
- No conflicts between players

## Test Scenario 3: Edge Cases

### 3a. Cache Expiration

1. **Start game and disconnect**
2. **Wait > 60 seconds** (cache expiration time)
3. **Refresh page**
4. **Expected**: Rejoin data should be cleared, player spawns at default position

### 3b. Server Restart Without Cache

1. **Start game**
2. **Manually delete `.dev-cache/rooms.json`** (or wait for it to be cleared)
3. **Trigger server restart**
4. **Refresh page**
5. **Expected**: Player spawns as new player (no restoration)

### 3c. Different Room After Restart

1. **Start game in Room A**
2. **Trigger server restart**
3. **Before refreshing, manually change roomId in sessionStorage**:
   ```javascript
   const data = JSON.parse(sessionStorage.getItem('dev_rejoin_data'));
   data.roomId = 'different-room-id';
   sessionStorage.setItem('dev_rejoin_data', JSON.stringify(data));
   ```
4. **Refresh page**
5. **Expected**: Should try to join different room (may fail if room doesn't exist)

### 3d. Player Not in Cache

1. **Start game**
2. **Trigger server restart**
3. **Manually clear player snapshots from cache** (edit `.dev-cache/rooms.json`)
4. **Refresh page**
5. **Expected**: Player spawns as new player (no restoration, but no errors)

## Test Scenario 4: Verify Session Migration

### Steps:

1. **Start game**
2. **Note your inventory items** (if any)
3. **Trigger server restart**
4. **Refresh and reconnect**
5. **Check inventory**:
   - Open inventory (if available)
   - Verify items are still there
   - Check that progression/stats are preserved

### What to Verify:

- ✅ Player position restored
- ✅ Player HP/mana restored
- ✅ Player level/score restored
- ✅ Inventory items preserved
- ✅ Progression stats preserved
- ✅ Kill streak preserved (if applicable)
- ✅ Equipment/wearables preserved

## Debugging Tips

### Check Cache File:

```bash
cat apps/server/.dev-cache/rooms.json
```

Look for:
- `playerSnapshots`: Should contain player data keyed by `playerId`
- `playerIdToSessionMap`: Should map `playerId` → old `sessionId`

### Check Browser sessionStorage:

Open browser console:
```javascript
// Check rejoin data
JSON.parse(sessionStorage.getItem('dev_rejoin_data'))

// Check if it exists
sessionStorage.getItem('dev_rejoin_data')
```

### Check Server State:

Add temporary logging in `onJoin()`:
```typescript
console.log('Restored snapshots:', Array.from(this.restoredPlayerSnapshots.keys()));
console.log('Player ID:', playerId);
console.log('Has snapshot:', this.restoredPlayerSnapshots.has(playerId));
```

## Common Issues

### Issue: Player spawns at default position

**Possible causes**:
- Cache not being saved (check server logs for `💾 Room cached`)
- Cache not being restored (check for `♻️ Found cached room data`)
- PlayerId mismatch (check auth data)

**Debug**:
- Check `.dev-cache/rooms.json` exists and has data
- Verify `playerId` in auth matches `playerId` in cache
- Check server logs for restoration messages

### Issue: Inventory/progression not restored

**Possible causes**:
- Session migration not working
- Maps not being migrated correctly

**Debug**:
- Check `migrateSessionData()` logs
- Verify old sessionId exists in restored maps
- Check that migration happens before cleanup

### Issue: Auto-rejoin not triggering

**Possible causes**:
- `dev_rejoin_data` not stored in sessionStorage
- useEffect dependencies missing
- `ctaDisabled` preventing rejoin

**Debug**:
- Check browser console for rejoin data storage
- Check `ctaDisabled` state
- Manually trigger: `handleStartGame()` in console

### Issue: Multiple restarts cause issues

**Possible causes**:
- Cache not being cleared after restore
- Old session mappings accumulating

**Debug**:
- Verify `clearRoomCache()` is called after restore
- Check that restored maps are cleared after migration

## Success Criteria

✅ Player position preserved across restart  
✅ Player stats (HP, mana, level) preserved  
✅ Inventory preserved  
✅ Progression preserved  
✅ No errors in console  
✅ No blocking during server shutdown  
✅ Works with multiple players  
✅ Cache expires correctly after 60 seconds  

## Manual Test Checklist

- [ ] Single player reconnection works
- [ ] Multiple players reconnection works
- [ ] Player position restored correctly
- [ ] Player stats restored correctly
- [ ] Inventory preserved
- [ ] Progression preserved
- [ ] Cache expiration works (> 60 seconds)
- [ ] No errors in console
- [ ] Server shutdown is fast (no blocking)
- [ ] Works after multiple restarts



