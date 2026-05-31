import fs from 'node:fs';
import path from 'node:path';

const lobbyPath = path.join(
  process.cwd(),
  'apps/client/src/components/Lobby.tsx'
);
const homePagePath = path.join(
  process.cwd(),
  'apps/client/src/app/page.tsx'
);

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('trade dialog controls', () => {
  it('renders Trade mechanic controls from shared trade leverage config', () => {
    const source = readSource(lobbyPath);

    expect(source).toContain(
      "const leverageCardTitle = isCompetitiveSelected ? 'Predict' : 'Leverage';"
    );
    expect(source).toContain('PRACTICE_RUN_LEVERAGE_MAX = 40');
    expect(source).toContain('TRADE_LEVERAGE_QUICK_OPTIONS.map');
    expect(source).toContain('min={TRADE_LEVERAGE_MIN}');
    expect(source).toContain('max={TRADE_LEVERAGE_MAX}');
    expect(source).toContain(
      'max={isCompetitiveSelected ? TRADE_LEVERAGE_MAX : PRACTICE_RUN_LEVERAGE_MAX}'
    );
    expect(source).toContain('Run Length:');
    expect(source).toContain('{TRADE_EXTEND_WINDOW_MINUTES}m');
    expect(source).toContain('step={1}');
    expect(source).not.toContain('step={0.1}');
    expect(source).not.toContain('{val}.0x');
    expect(source).not.toContain('[1, 2, 3, 4, 5, 10, 20, 30, 40, 50]');
    expect(source).not.toContain('max={50}');
  });

  it('normalizes persisted run and trade leverage with mode-aware bounds', () => {
    const source = readSource(homePagePath);

    expect(source).toContain('const PRACTICE_RUN_LEVERAGE_MAX = 40;');
    expect(source).toContain('function getRunLeverageMax(mode: GameMode): number {');
    expect(source).toContain('normalizeRunLeverage(Number.parseFloat(stored))');
    expect(source).toContain('normalizeRunLeverage(');
    expect(source).toContain("if (mode === null && selectedMode === 'competitive') {");
    expect(source).toContain('leverage + tradeLeverage');
    expect(source).toContain('normalizeTradeLeverage(Number.parseFloat(stored))');
    expect(source).toContain('normalizeTradeLeverage(value, TRADE_LEVERAGE_MIN)');
  });
});
