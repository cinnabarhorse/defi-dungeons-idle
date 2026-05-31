import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

import { getWorkspaceRoot } from '../../../../../../../data/lib/mapFileIO';

export type AuthoringFileKey =
  | 'room-base'
  | 'connector-base'
  | 'custom-bodies'
  | 'room-blueprints'
  | 'connector-blueprints';

export type AuthoringFileKeyWithStamps = AuthoringFileKey | 'port-stamps';

const RELATIVE_FILE_MAP: Record<AuthoringFileKeyWithStamps, string> = {
  'room-base': path.join('data', 'maps', 'bodies', 'room-base.ts'),
  'connector-base': path.join('data', 'maps', 'bodies', 'connector-base.ts'),
  'custom-bodies': path.join('data', 'maps', 'bodies', 'custom', 'index.ts'),
  'room-blueprints': path.join(
    'data',
    'maps',
    'blueprints',
    'room-blueprints.ts'
  ),
  'connector-blueprints': path.join(
    'data',
    'maps',
    'blueprints',
    'connector-blueprints.ts'
  ),
  'port-stamps': path.join('data', 'maps', 'stamps', 'port-stamps.ts'),
};

export const MUTABLE_FILE_KEYS: readonly AuthoringFileKey[] = [
  'room-base',
  'connector-base',
  'custom-bodies',
  'room-blueprints',
  'connector-blueprints',
] as const;

const BACKUP_DIR = path.join('data', 'maps', '.backups');

const formatTimestamp = (date: Date): string => {
  const pad = (value: number, length = 2) =>
    value.toString().padStart(length, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
};

export const resolveAuthoringAbsolutePath = (
  key: AuthoringFileKeyWithStamps
): string => {
  const relative = RELATIVE_FILE_MAP[key];
  if (!relative) {
    throw new Error(`Unsupported authoring file key: ${key}`);
  }
  const root = getWorkspaceRoot();
  return path.resolve(root, relative);
};

export const getRelativePath = (key: AuthoringFileKeyWithStamps): string => {
  const relative = RELATIVE_FILE_MAP[key];
  if (!relative) {
    throw new Error(`Unsupported authoring file key: ${key}`);
  }
  return relative;
};

export const statAuthoringFile = async (key: AuthoringFileKeyWithStamps) => {
  const filePath = resolveAuthoringAbsolutePath(key);
  return fs.stat(filePath);
};

export const readAuthoringFile = async (key: AuthoringFileKeyWithStamps) => {
  const filePath = resolveAuthoringAbsolutePath(key);
  return fs.readFile(filePath, 'utf8');
};

export const ensureBackupDirectory = async (): Promise<string> => {
  const root = getWorkspaceRoot();
  const backupsPath = path.resolve(root, BACKUP_DIR);
  await fs.mkdir(backupsPath, { recursive: true });
  return backupsPath;
};

const createBackup = async (
  key: AuthoringFileKeyWithStamps,
  sourcePath: string
): Promise<void> => {
  if (!existsSync(sourcePath)) {
    return;
  }
  const backupsDir = await ensureBackupDirectory();
  const timestamp = formatTimestamp(new Date());
  const backupName = `${key}.${timestamp}.ts`;
  const backupPath = path.join(backupsDir, backupName);
  await fs.copyFile(sourcePath, backupPath);
};

const writeFileAtomically = async (
  targetPath: string,
  contents: string
): Promise<void> => {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const suffix = randomBytes(6).toString('hex');
  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${suffix}.tmp`
  );

  try {
    await fs.writeFile(tempPath, contents, 'utf8');
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw error;
  }
};

export const writeAuthoringFile = async (
  key: AuthoringFileKey,
  contents: string
): Promise<void> => {
  const filePath = resolveAuthoringAbsolutePath(key);
  await createBackup(key, filePath);
  await writeFileAtomically(filePath, contents);
};

export const writeAuthoringFileFromCustomPath = async (
  key: AuthoringFileKeyWithStamps,
  contents: string,
  absolutePath: string
): Promise<void> => {
  await createBackup(key, absolutePath);
  await writeFileAtomically(absolutePath, contents);
};
