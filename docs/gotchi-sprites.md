### Gotchi sprite integration (draft)

Purpose: Generate and load Aavegotchi spritesheets for the connected wallet, then surface them in the client selector for play.

---

Flow overview

- Connect wallet in client.
- Server fetches owned Aavegotchis → normalize to generator input.
- Generate spritesheets via gotchi-generator (cache per gotchi id).
- Serve sprites at a stable URL; client preloads and lists in `CharacterSelector`.
- Player selects a gotchi → start game with that spritesheet.

---

Data contracts

- Input Gotchi (generator):
  - id: number
  - collateral: string (e.g. "aDAI")
  - attributes: Array<{ trait_type: string; value: string }>
- We already produce this shape in `scripts/fetchOwnedAavegotchis.ts`.

Sprites output

- Per gotchi id → PNG spritesheet path: `/spritesheets/<id>.png`
- Optional: metadata JSON `/spritesheets/<id>.json` for extra hints (e.g. frame size) if needed.

---

Server responsibilities

- Endpoint: `POST /api/gotchis/:wallet/generate` → kicks off generation for connected wallet.
- Endpoint: `GET /api/gotchis/:wallet` → returns list of gotchi ids + sprite URLs.
- Caching:
  - Skip regeneration if file exists and input hash unchanged.
  - Invalidate when wearables/traits change (hash mismatch).
- Config:
  - `GOTCHI_TRAITS_BASE_PATH` → directory that contains `Trait Files/`.
  - `GOTCHI_SPRITES_OUTPUT` → output directory (publicly served).

---

Client responsibilities

- After wallet connect, call `POST /api/gotchis/:wallet/generate`.
- Poll `GET /api/gotchis/:wallet` until ready.
- Preload returned sprites into `CharacterSelector`.
- On selection, persist chosen gotchi id in URL state (nuqs) and start game.

---

Open questions

- Where should sprites be hosted in prod? (server public dir, CDN, or object storage)

We'll probably host them in a CDN. But for now, can we just save them to the user's local storage and load from there as a blob or something?

- Do we want background generation (queue) for large wallets? (batch)

Not right now.

- Confirm frame size/order that the game expects; do we need extra metadata?

You can see an example in @Coderdan.png.

- Any rate limits or auth for generation endpoints?

Not right now.

---

Next steps

- Confirm config paths and hosting approach.
- Implement server endpoints + caching.

---

Storage strategy (interim: browser-only, no CDN)

- We will store generated PNG sprites locally in the browser using IndexedDB (best for binary Blobs). Avoid localStorage for images (size limits and base64 overhead).
- Keying: `gotchi:<id>:<contentHash>` so updated traits invalidate old entries automatically.
- Retrieval: Read Blob from IDB, create an object URL via `URL.createObjectURL(blob)` for image/game usage; revoke when no longer needed.
- Fallback: If not found in IDB, fetch from server once (e.g. `/spritesheets/<id>.png`), store, then use.

Minimal client helper (sketch)

```ts
// apps/client/src/lib/gotchi-sprites-cache.ts
import { get, set, del, keys } from 'idb-keyval';

export interface GotchiSpriteMeta {
  id: number;
  hash: string;
  url: string;
}

function makeKey(id: number, hash: string) {
  return `gotchi:${id}:${hash}`;
}

export async function getSpriteObjectUrl(
  meta: GotchiSpriteMeta
): Promise<string> {
  const key = makeKey(meta.id, meta.hash);
  let blob = await get<Blob>(key);
  if (!blob) {
    const res = await fetch(`${meta.url}`);
    if (!res.ok) throw new Error(`Failed to fetch sprite ${meta.id}`);
    blob = await res.blob();
    await set(key, blob);
  }
  return URL.createObjectURL(blob);
}

export async function purgeStaleSprites(
  validMetas: GotchiSpriteMeta[]
): Promise<void> {
  const valid = new Set(validMetas.map((m) => makeKey(m.id, m.hash)));
  const allKeys = await keys();
  await Promise.all(
    allKeys
      .filter(
        (k) => typeof k === 'string' && (k as string).startsWith('gotchi:')
      )
      .filter((k) => !valid.has(k as string))
      .map((k) => del(k as string))
  );
}
```

Notes

- The server should include a content hash for each sprite in its listing (e.g., SHA-256 of PNG) to drive cache keys.
- No service worker required for this approach; optional upgrade later is Cache Storage + SW for transparent offline.
- Wire client calls in `Web3Provider`/`CharacterSelector`.
