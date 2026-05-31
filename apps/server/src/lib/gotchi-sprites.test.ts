import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { resolveConfig } from './gotchi-sprites';

describe('gotchi-sprites resolveConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws if GOTCHI_PUBLIC_BASE_URL is missing/blank', () => {
    process.env.GOTCHI_PUBLIC_BASE_URL = '';
    process.env.GOTCHI_TRAITS_BASE_PATH = os.tmpdir();

    expect(() => resolveConfig()).toThrow(
      /GOTCHI_PUBLIC_BASE_URL must be configured/i
    );
  });

  it('sanitizes GOTCHI_PUBLIC_BASE_URL by trimming trailing slashes', () => {
    process.env.GOTCHI_PUBLIC_BASE_URL = 'https://example.com////';
    process.env.GOTCHI_TRAITS_BASE_PATH = os.tmpdir();

    const cfg = resolveConfig();
    expect(cfg.publicBaseUrl).toBe('https://example.com');
  });

  it('treats GOTCHI_TRAITS_BASE_PATH pointing at "Trait Files" as the leaf dir and returns its parent as basePath', async () => {
    process.env.GOTCHI_PUBLIC_BASE_URL = 'https://example.com';

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gotchi-traits-'));
    const traitFilesDir = path.join(root, 'Trait Files');
    await fs.mkdir(traitFilesDir, { recursive: true });

    process.env.GOTCHI_TRAITS_BASE_PATH = traitFilesDir;

    const cfg = resolveConfig();
    expect(cfg.basePath).toBe(root);
  });

  it('uses GOTCHI_TRAITS_BASE_PATH directly when it is not the Trait Files leaf dir', async () => {
    process.env.GOTCHI_PUBLIC_BASE_URL = 'https://example.com';

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gotchi-traits-root-'));
    process.env.GOTCHI_TRAITS_BASE_PATH = root;

    const cfg = resolveConfig();
    expect(cfg.basePath).toBe(root);
  });
});
