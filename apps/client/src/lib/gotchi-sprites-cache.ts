'use client';

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
