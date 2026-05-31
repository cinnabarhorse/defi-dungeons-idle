## Code Review — Inventory Destroy/Removal (19/10/2025)

### Summary

- Client had optimistic removal, but finalize calls intermittently hit 404/422, causing rollbacks. A new HTTP route was added server-side and client finalize now retries and chunks requests.
- There are a few correctness and maintainability risks: duplicated key-generation logic between components, large-request handling, and lack of post-success resync.

### Key References

Client finalize (optimistic → server finalize with retries and chunking):

```443:520:apps/client/src/hooks/useInventory.ts
  const finalizeDestroy = useCallback(
    async (pendingId: string) => {
      const pending = pendingDestroysRef.current.find(
        (entry) => entry.id === pendingId
      );
      if (!pending || pending.status !== 'pending') {
        return;
      }
      ...
        const entries = Array.isArray(payload) ? payload : [payload];
        const chunks: (typeof entries)[] = [];
        const CHUNK_SIZE = 50;
        for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
          chunks.push(entries.slice(i, i + CHUNK_SIZE));
        }
        const postChunk = async (chunk: unknown[]) => {
          const bodyJson = JSON.stringify(
            chunk.length === 1 ? chunk[0] : chunk
          );
          const maxAttempts = 3;
          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              const response = await fetch(destroyEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: bodyJson,
              });
              if (response.ok) return null;
              const data = await response.json().catch(() => null);
              const msg =
                (data && (data.message || data.error)) ||
                `Destroy failed (${response.status})`;
              if (response.status !== 404 && response.status < 500) {
                return new Error(msg);
              }
              lastError = new Error(msg);
            } catch (e) {
              lastError = e instanceof Error ? e : new Error(String(e));
            }
            if (attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 750 * attempt));
            }
          }
          return lastError ?? new Error('Unknown destroy error');
        };
        for (const chunk of chunks) {
          const err = await postChunk(chunk);
          if (err) throw err;
        }
        setPendingDestroys((prev) =>
          prev.filter((entry) => entry.id !== pendingId)
        );
      ...
    },
```

Server HTTP endpoint for removal:

```2324:2360:apps/server/src/index.ts
app.post('/api/player/inventory/remove', async (req, res) => {
  const resolved = await resolveSessionFromRequest(req);
  ...
  const requests = normalizeRemoveRequests(req.body);
  if (requests.length === 0) {
    return res.status(400).json({ error: 'Invalid destroy request' });
  }
  try {
    const removed = await executeInventoryRemoval(resolved.playerId, requests, {
      reason: 'destroy_user',
      metadata: { source: 'inventory_http' },
    });
    const records = await inventoryRepo.getInventory(resolved.playerId);
    const items = sanitizeInventoryPayloads(records.map(inventoryRecordToItem));
    return res.json({ removed, inventory: items, lickTongueCount: getLickTongueCount(items), action: 'destroy' });
  } catch (error) {
    if (error instanceof InventoryRemovalError) {
      return res.status(error.status).json({ error: error.code, message: error.message, detail: error.detail ?? null });
    }
    logError(error, req);
    return res.status(500).json({ error: 'Failed to destroy item' });
  }
});
```

Removal constraints and limits:

```150:186:apps/server/src/lib/inventory-removal.ts
  if (requests.length > MAX_REMOVE_OPERATIONS) {
    throw new InventoryRemovalError('INVENTORY_INVALID_REQUEST','Too many removal operations',422,{ max: MAX_REMOVE_OPERATIONS });
  }
  ...
  const normalizedQuantity = Math.floor(Number(request.quantity));
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new InventoryRemovalError('INVENTORY_INVALID_REQUEST','Quantity must be a positive integer',422,{ itemType, itemName, quantity: request.quantity });
  }
  if (normalizedQuantity > MAX_FUNGIBLE_REMOVE_QUANTITY) {
    throw new InventoryRemovalError('INVENTORY_INVALID_REQUEST',`Quantity exceeds per-request maximum of ${MAX_FUNGIBLE_REMOVE_QUANTITY}`,422,{ itemType, itemName, quantity: normalizedQuantity });
  }
```

### Findings (Bugs/Flakes)

- Intermittent 404 on removal endpoint: observed before and after success. Likely due to dev server restart/hot-reload race; client finalize fired during a short window before routes remounted. Client-side retry mitigates; long-term fix is to ensure the server process restarts cleanly and the client targets the correct base URL.
- 422 responses on large batches: single POST with many wearables can exceed MAX_REMOVE_OPERATIONS or hit transient DB errors. Client chunking (size 50) mitigates; alternatively increase limit or implement server-side chunking.
- Optimistic revert on transient errors: prior logic rolled back immediately on any non-OK response. Now retried and only reverts after all attempts fail.
- Key-generation duplication risk: `getInventorySelectionKey` (UI) and `getStackKey` (hook) must stay in sync for fungible stack matches. Divergence would cause client to optimistically remove the wrong stack or fail to match on server payloads.

### Maintainability/Refactor Opportunities

- Extract a shared key util for inventory keys (stack key, selection key, wearable key) used across `inventory-client.tsx` and `useInventory.ts`. This prevents drift.
- After successful finalize, optionally reconcile with the server response (`inventory` payload) to guard against any optimistic divergence or concurrent changes from Supabase events.
- Centralize request building for destroy operations in one helper (client), including chunking and retries; keep hook simpler.
- Improve server errors: include error codes in JSON consistently and ensure 404s for mounted endpoints aren’t emitted during hot-reload (gate requests until app is ready).

### Suggested Tests

- Client unit test: build destroy requests for N=1, 10, 100 wearables; verify chunking boundaries and retry behavior.
- Server integration test: POST single and array payloads; validate limits and proper decrement/removal.
- E2E: Select stacked wearables (e.g., 89 glasses), remove; assert inventory count decreases and does not reappear after Supabase refresh.

### Checklist

- [ ] Create shared inventory key helpers to remove duplication between UI and hook
- [ ] Update client finalize to reconcile from server response on success
- [ ] Log and monitor destroy route readiness at startup to catch hot-reload 404s
- [ ] Consider server-side chunking or raise MAX_REMOVE_OPERATIONS if needed
- [ ] Add structured error codes/messages to client to surface server reasons
- [ ] Add unit/integration tests for destroy flow (client/server)
