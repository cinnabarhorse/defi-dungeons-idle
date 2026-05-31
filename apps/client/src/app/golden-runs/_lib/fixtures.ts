import * as fs from 'fs';
import * as path from 'path';

export interface FullRunSummary {
  runs: number;
  victories: number;
  deaths: number;
  avgTicks: number;
  maxTicks: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

export interface FullRunEntry {
  characterId: string;
  level: number;
  leverage: number;
  difficulty: string;
  seed: number;
  statAllocation: {
    energy: number;
    aggression: number;
    spookiness: number;
    brainSize: number;
  };
  ticksRun: number;
  durationMs: number;
  runStatus: string;
  endedReason: string;
  depth: number;
  floor: number;
  score: number;
}

export interface FullRunFixture {
  generatedAt: string;
  targetFloor: number;
  runs: Record<string, FullRunEntry>;
  summary: FullRunSummary;
}

const TARGET_FLOORS = [3, 10, 20];

export function getTargetFloors(): number[] {
  return TARGET_FLOORS.slice();
}

function resolveFixturesDir(): string {
  const candidates = [
    path.join(process.cwd(), '__fixtures__'),
    path.join(process.cwd(), '..', '__fixtures__'),
    path.join(process.cwd(), '..', '..', '__fixtures__'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function resolveGoldenRunsArchiveDir(): string {
  return path.join(resolveFixturesDir(), 'golden-runs');
}

export function listGoldenRunDates(): string[] {
  const archiveDir = resolveGoldenRunsArchiveDir();
  if (!fs.existsSync(archiveDir)) return [];
  return fs
    .readdirSync(archiveDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function resolveFixturePath(targetFloor: number, date?: string): string | null {
  const resolvedDate = date ?? listGoldenRunDates()[0];
  if (!resolvedDate) return null;
  return path.join(
    resolveGoldenRunsArchiveDir(),
    resolvedDate,
    `idle-full-runs-floor-${targetFloor}.fixture.json`
  );
}

export function loadFullRunFixture(
  targetFloor: number,
  date?: string
): FullRunFixture | null {
  const fixturePath = resolveFixturePath(targetFloor, date);
  if (!fixturePath) return null;
  if (!fs.existsSync(fixturePath)) return null;
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw) as FullRunFixture;
}
