import fs from 'node:fs';
import path from 'node:path';

const playerRunsPath = path.resolve(__dirname, '../app/me/runs/runs-client.tsx');
const adminRunsPath = path.resolve(
  __dirname,
  '../app/me/admin/runs/admin-runs-client.tsx'
);

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('run history score display', () => {
  it('shows competition final score in /me/runs when available', () => {
    const source = readSource(playerRunsPath);
    expect(source).toMatch(
      /formatNumber\(\s*run\.dailyRuns\?\.runScore\s*\?\?\s*run\.score\s*\)/
    );
  });

  it('shows competition final score in /me/admin/runs when available', () => {
    const source = readSource(adminRunsPath);
    expect(source).toMatch(
      /formatNumber\(\s*run\.dailyRuns\?\.runScore\s*\?\?\s*run\.score\s*\)/
    );
  });

  it('wires leverage breakdown triggers into both run history tables', () => {
    const playerSource = readSource(playerRunsPath);
    const adminSource = readSource(adminRunsPath);

    expect(playerSource).toContain('LeverageBreakdownButton');
    expect(playerSource).toContain('legacyLeverage={run.legacyLeverage}');
    expect(playerSource).toContain('tradeRunLeverage={run.tradeRunLeverage}');
    expect(playerSource).toContain('tradeRunToken={run.tradeRunToken}');
    expect(playerSource).toContain(
      'tradeRunDirection={run.tradeRunDirection}'
    );

    expect(adminSource).toContain('LeverageBreakdownButton');
    expect(adminSource).toContain('legacyLeverage={run.legacyLeverage}');
    expect(adminSource).toContain('tradeRunLeverage={run.tradeRunLeverage}');
    expect(adminSource).toContain('tradeRunToken={run.tradeRunToken}');
    expect(adminSource).toContain(
      'tradeRunDirection={run.tradeRunDirection}'
    );
  });
});
