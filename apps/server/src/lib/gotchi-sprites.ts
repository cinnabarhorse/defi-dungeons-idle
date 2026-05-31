import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import crypto from 'crypto';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type * as GotchiGenerator from 'gotchi-generator';
import type { GeneratorGotchi } from './gotchi-normalize';
import { getSupabaseAdminClient } from './db';

const rootRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
const gotchiGenerator = rootRequire(
  'gotchi-generator'
) as typeof GotchiGenerator;
const { generateSpritesheet, getPackageBasePath } = gotchiGenerator;

export interface SpriteInfo {
  id: number;
  url: string; // public URL
  hash: string; // content hash of png
}

const DEFAULT_SUPABASE_BUCKET = 'aavegotchi-sprites';
const SUPABASE_PNG_CACHE_CONTROL = '31536000';
const SUPABASE_METADATA_CACHE_CONTROL = '0';

interface SupabaseContext {
  client: SupabaseClient;
  bucket: string;
  publicBaseUrl: string;
}

let cachedSupabaseContext: SupabaseContext | null = null;

function sanitizeBaseUrl(value: string): string {
  if (!value) return value;
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

function getSupabaseContext(): SupabaseContext {
  if (cachedSupabaseContext) return cachedSupabaseContext;
  const client = getSupabaseAdminClient();
  const bucket =
    process.env.GOTCHI_SPRITES_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET;
  const base = process.env.GOTCHI_PUBLIC_BASE_URL?.trim() || '';
  if (!base) {
    throw new Error(
      'GOTCHI_PUBLIC_BASE_URL must be configured when using the Supabase sprite backend.'
    );
  }
  cachedSupabaseContext = {
    client,
    bucket,
    publicBaseUrl: sanitizeBaseUrl(base),
  };
  return cachedSupabaseContext;
}

function resolveBasePath(): string {
  const fromEnv = process.env.GOTCHI_TRAITS_BASE_PATH;
  if (fromEnv) {
    // If env points directly to the "Trait Files" dir, use its parent
    if (fromEnv.toLowerCase().endsWith('trait files')) {
      return path.dirname(fromEnv);
    }
    return fromEnv;
  }
  const pkgRoot =
    typeof getPackageBasePath === 'function'
      ? getPackageBasePath()
      : (() => {
          try {
            const resolved = rootRequire.resolve(
              'gotchi-generator/package.json'
            );
            return path.dirname(resolved);
          } catch {
            return null;
          }
        })();
  if (pkgRoot) {
    const candidate = path.join(pkgRoot, 'Trait Files');
    if (existsSync(candidate)) return pkgRoot; // base should be the parent containing "Trait Files/"
    return pkgRoot; // best effort
  }
  throw new Error(
    'GOTCHI_TRAITS_BASE_PATH is not set and gotchi-generator assets were not found'
  );
}

function getGeneratorVersion(): string {
  try {
    const pkg = rootRequire('gotchi-generator/package.json') as {
      version?: string;
    };
    if (pkg && typeof pkg.version === 'string') {
      return pkg.version;
    }
  } catch (error) {
    console.warn('[gotchi] Unable to resolve generator version', error);
  }
  return 'unknown';
}

const GENERATOR_VERSION = getGeneratorVersion();

console.log('[gotchi] Generator version:', GENERATOR_VERSION);

// Removed legacy output-dir versioning and regeneration flags; Supabase metadata
// now governs regeneration and cache invalidation.

export function resolveConfig() {
  const basePath = resolveBasePath();
  const backend = 'supabase';
  // Use a temp directory for generation (works in all environments)
  const defaultOutputDir = path.join(
    os.tmpdir(),
    'gotchiverse',
    'spritesheets'
  );
  const resolvedBase =
    process.env.GOTCHI_PUBLIC_BASE_URL &&
    process.env.GOTCHI_PUBLIC_BASE_URL.trim().length > 0
      ? process.env.GOTCHI_PUBLIC_BASE_URL
      : null;
  if (!resolvedBase) {
    throw new Error(
      'GOTCHI_PUBLIC_BASE_URL must be configured when using the Supabase sprite backend.'
    );
  }
  const publicBaseUrl = sanitizeBaseUrl(resolvedBase);
  return { basePath, outputDir: defaultOutputDir, publicBaseUrl };
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// ensureSpritesOutputDir removed; generation uses a temp directory internally

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return sha256Buffer(buffer);
}

function hashGotchiAttributes(gotchi: GeneratorGotchi): string {
  const sortedAttributes = [...gotchi.attributes].sort((a, b) => {
    if (a.trait_type !== b.trait_type) {
      return a.trait_type.localeCompare(b.trait_type);
    }
    return a.value.localeCompare(b.value);
  });

  const normalized = {
    id: gotchi.id,
    collateral: gotchi.collateral,
    attributes: sortedAttributes,
    generatorVersion: GENERATOR_VERSION,
  };

  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function applyFrameSizeOverrides<T extends Record<string, any>>(config: T): T {
  // Allow forcing frame size via env to generate 64x64 (or other) tiles
  const size = parsePositiveInt(process.env.GOTCHI_FRAME_SIZE);
  const width = parsePositiveInt(process.env.GOTCHI_FRAME_WIDTH) ?? size;
  const height = parsePositiveInt(process.env.GOTCHI_FRAME_HEIGHT) ?? size;

  if (!width && !height) return config;
  const next = { ...config } as any;
  if (width) next.frameWidth = width;
  if (height) next.frameHeight = height;
  return next as T;
}

interface SpriteMetadata {
  attributesHash: string;
  generatorVersion: string;
  updatedAt?: string;
  pngHash?: string;
}

async function readSpriteMetadata(
  metadataPath: string
): Promise<SpriteMetadata | null> {
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<SpriteMetadata>;
    if (!parsed.attributesHash || !parsed.generatorVersion) {
      return null;
    }
    return {
      attributesHash: parsed.attributesHash,
      generatorVersion: parsed.generatorVersion,
      updatedAt: parsed.updatedAt,
      pngHash:
        typeof (parsed as any).pngHash === 'string'
          ? ((parsed as any).pngHash as string)
          : undefined,
    };
  } catch {
    return null;
  }
}

async function writeSpriteMetadata(
  metadataPath: string,
  attributesHash: string,
  pngHash?: string
): Promise<void> {
  const metadata: SpriteMetadata = {
    attributesHash,
    generatorVersion: GENERATOR_VERSION,
    updatedAt: new Date().toISOString(),
  };
  if (pngHash) {
    metadata.pngHash = pngHash;
  }
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

async function supabaseDownloadBuffer(key: string): Promise<Buffer | null> {
  const { client, bucket } = getSupabaseContext();
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[gotchi] Supabase download miss for', key, error);
    } catch {
      // Ignore warn logging failures; treat as cache miss.
    }
    return null;
  }
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (typeof (data as any).arrayBuffer === 'function') {
    const arrayBuffer = await (data as any).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new Error(
    `[gotchi] Unsupported data type received when downloading ${key} from Supabase`
  );
}

async function supabaseDownloadMetadata(
  key: string
): Promise<SpriteMetadata | null> {
  const buffer = await supabaseDownloadBuffer(key);
  if (!buffer) return null;
  try {
    const parsed = JSON.parse(buffer.toString('utf-8')) as SpriteMetadata;
    if (!parsed || !parsed.attributesHash || !parsed.generatorVersion) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn(
      `[gotchi] Failed to parse Supabase metadata for ${key}:`,
      error
    );
    return null;
  }
}

async function supabaseUpload(
  key: string,
  data: Buffer,
  contentType: string,
  cacheControl: string
): Promise<void> {
  const { client, bucket } = getSupabaseContext();
  const { error } = await client.storage.from(bucket).upload(key, data, {
    contentType,
    cacheControl,
    upsert: true,
  });
  if (error) {
    throw new Error(
      `[gotchi] Supabase upload failed for ${key}: ${error.message}`
    );
  }
}

async function shouldRegenerateSprite(
  gotchi: GeneratorGotchi,
  spritePath: string,
  metadataPath: string,
  currentAttributesHash: string
): Promise<boolean> {
  const spriteExists = await fileExists(spritePath);
  const metadataExists = await fileExists(metadataPath);

  if (!spriteExists) return true;
  if (!metadataExists) {
    console.log(
      `[gotchi] Missing metadata for ${gotchi.id}, regenerating sprite`
    );
    return true;
  }

  const storedMetadata = await readSpriteMetadata(metadataPath);
  if (!storedMetadata) return true;

  if (
    storedMetadata.attributesHash !== currentAttributesHash ||
    storedMetadata.generatorVersion !== GENERATOR_VERSION
  ) {
    if (storedMetadata.attributesHash !== currentAttributesHash) {
      console.log(
        `[gotchi] Attributes changed for ${gotchi.id} (hash: ${currentAttributesHash.slice(0, 8)})`
      );
    }
    return true;
  }

  return false;
}

// Placeholder code removed – we now hard fail on generation errors

function resolveGotchiGeneratorRoot(): string | null {
  try {
    if (typeof getPackageBasePath === 'function') {
      const base = getPackageBasePath();
      if (base) return base;
    }
  } catch {
    // Ignore errors when getting package base path
  }
  try {
    const pkgJsonPath = rootRequire.resolve('gotchi-generator/package.json');
    return path.dirname(pkgJsonPath);
  } catch {
    return null;
  }
}

async function loadConfig(basePath: string): Promise<any> {
  const explicit = process.env.GOTCHI_CONFIG_PATH;
  const candidate = explicit || path.join(basePath, 'config.json');
  try {
    if (existsSync(candidate)) {
      const raw = await fs.readFile(candidate, 'utf-8');
      return JSON.parse(raw);
    }
    const pkgRoot = resolveGotchiGeneratorRoot();
    if (pkgRoot) {
      const pkgConfig = path.join(pkgRoot, 'config.json');
      if (existsSync(pkgConfig)) {
        const raw = await fs.readFile(pkgConfig, 'utf-8');
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.warn(`[gotchi] Failed to read config at ${candidate}:`, e);
  }
  console.warn(
    '[gotchi] No config.json found; proceeding with empty config (may fail).'
  );
  return {};
}

async function generateSpriteSupabase(
  gotchi: GeneratorGotchi
): Promise<SpriteInfo> {
  const { basePath, outputDir } = resolveConfig();
  const { publicBaseUrl } = getSupabaseContext();
  await ensureDir(outputDir);

  const outPng = path.join(outputDir, `${gotchi.id}.png`);
  const pngKey = `spritesheets/${gotchi.id}.png`;
  const metadataKey = `spritesheets/${gotchi.id}.meta.json`;
  const currentAttributesHash = hashGotchiAttributes(gotchi);

  let metadata = await supabaseDownloadMetadata(metadataKey);
  let pngHash = metadata?.pngHash;
  let needsRegeneration =
    !metadata ||
    metadata.attributesHash !== currentAttributesHash ||
    metadata.generatorVersion !== GENERATOR_VERSION;

  if (!needsRegeneration && !pngHash) {
    const existing = await supabaseDownloadBuffer(pngKey);
    if (!existing) {
      needsRegeneration = true;
    } else {
      pngHash = sha256Buffer(existing);
      const updated: SpriteMetadata = {
        attributesHash: currentAttributesHash,
        generatorVersion: GENERATOR_VERSION,
        updatedAt: new Date().toISOString(),
        pngHash,
      };
      try {
        await supabaseUpload(
          metadataKey,
          Buffer.from(JSON.stringify(updated, null, 2), 'utf-8'),
          'application/json',
          SUPABASE_METADATA_CACHE_CONTROL
        );
        metadata = updated;
      } catch (error) {
        console.warn(
          `[gotchi] Failed to backfill Supabase metadata hash for ${gotchi.id}:`,
          error
        );
      }
    }
  }

  if (needsRegeneration) {
    let config = await loadConfig(basePath);
    config = applyFrameSizeOverrides(config);
    console.log('[gotchi] generate', {
      id: gotchi.id,
      basePath,
      outputDir,
      attributesHash: currentAttributesHash.slice(0, 8),
      backend: 'supabase',
    });
    await generateSpritesheet(
      gotchi as any,
      config as any,
      basePath,
      outputDir,
      false
    );
    const buffer = await fs.readFile(outPng);
    pngHash = sha256Buffer(buffer);
    await supabaseUpload(
      pngKey,
      buffer,
      'image/png',
      SUPABASE_PNG_CACHE_CONTROL
    );
    const payload: SpriteMetadata = {
      attributesHash: currentAttributesHash,
      generatorVersion: GENERATOR_VERSION,
      updatedAt: new Date().toISOString(),
      pngHash,
    };
    await supabaseUpload(
      metadataKey,
      Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
      'application/json',
      SUPABASE_METADATA_CACHE_CONTROL
    );
    metadata = payload;
    // Best-effort: remove local temp file after upload
    try {
      await fs.unlink(outPng);
    } catch {
      // Best-effort cleanup; ignore unlink failures.
    }
  }

  if (!pngHash) {
    throw new Error(
      `[gotchi] Unable to resolve spritesheet hash for ${gotchi.id} (Supabase backend)`
    );
  }

  const url = `${publicBaseUrl}/${gotchi.id}.png?v=${pngHash.slice(0, 8)}`;
  return { id: gotchi.id, url, hash: pngHash };
}

export async function getExistingSpriteInfo(
  gotchiId: number
): Promise<SpriteInfo | null> {
  try {
    const { outputDir } = resolveConfig();
    const pngKey = `spritesheets/${gotchiId}.png`;
    const metadataKey = `spritesheets/${gotchiId}.meta.json`;
    const metadata = await supabaseDownloadMetadata(metadataKey);
    if (!metadata) return null;
    let pngHash = metadata.pngHash;
    if (!pngHash) {
      const existing = await supabaseDownloadBuffer(pngKey);
      if (!existing) return null;
      pngHash = sha256Buffer(existing);
      const payload: SpriteMetadata = {
        attributesHash: metadata.attributesHash,
        generatorVersion: metadata.generatorVersion,
        updatedAt: new Date().toISOString(),
        pngHash,
      };
      try {
        await supabaseUpload(
          metadataKey,
          Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
          'application/json',
          SUPABASE_METADATA_CACHE_CONTROL
        );
      } catch (error) {
        console.warn(
          `[gotchi] Failed to update Supabase metadata for ${gotchiId}:`,
          error
        );
      }
    }
    if (!pngHash) return null;
    const { publicBaseUrl } = getSupabaseContext();
    const url = `${publicBaseUrl}/${gotchiId}.png?v=${pngHash.slice(0, 8)}`;
    return {
      id: gotchiId,
      url,
      hash: pngHash,
    };
  } catch (error) {
    console.warn(
      `[gotchi] Failed to read existing sprite info for ${gotchiId}:`,
      error
    );
    return null;
  }
}

export async function generateOne(
  gotchi: GeneratorGotchi
): Promise<SpriteInfo> {
  try {
    return await generateSpriteSupabase(gotchi);
  } catch (err) {
    console.error(`[gotchi] generation failed for ${gotchi.id}:`, err);
    throw err;
  }
}

export async function generateMany(
  gotchis: GeneratorGotchi[]
): Promise<SpriteInfo[]> {
  const out: SpriteInfo[] = [];
  for (const g of gotchis) {
    // Sequential to avoid sharp/libvips spikes; can batch later
    // eslint-disable-next-line no-await-in-loop
    const info = await generateOne(g);
    out.push(info);
  }
  return out;
}
