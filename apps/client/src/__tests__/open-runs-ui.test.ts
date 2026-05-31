import fs from 'node:fs';
import path from 'node:path';

const lobbyPath = path.resolve(__dirname, '../components/Lobby.tsx');
const idleDungeonPath = path.resolve(
  __dirname,
  '../components/idle/IdleDungeonScreen.tsx'
);
const pagePath = path.resolve(__dirname, '../app/page.tsx');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('open runs ux wiring', () => {
  it('renders lobby open-runs badge and paid extend/close controls', () => {
    const source = readSource(lobbyPath);

    expect(source).toContain('Open Runs');
    expect(source).toContain('/loot-icons/coin.svg');
    expect(source).not.toContain('Update (-{TRADE_UPDATE_FEE_GOLD}');
    expect(source).toContain('Extend (-{TRADE_EXTEND_FEE_GOLD}');
    expect(source).toContain('Close (-{TRADE_CLOSE_FEE_GOLD}');
    expect(source).toContain('numberFormatter.format(goldCoinCount)');
    expect(source).not.toContain('Update Run');
  });

  it('opens the dialog without refetching cached open runs', () => {
    const source = readSource(lobbyPath);

    expect(source).not.toContain('const handleOpenRunsDialogOpenChange');
    expect(source).toContain('onClick={() => setOpenRunsDialogOpen(true)}');
    expect(source).toContain('onOpenChange={setOpenRunsDialogOpen}');
  });

  it('revalidates open runs after returning to lobby', () => {
    const lobbySource = readSource(lobbyPath);
    const pageSource = readSource(pagePath);

    expect(lobbySource).toContain('OPEN_RUNS_REFRESH_EVENT');
    expect(lobbySource).toContain(
      'window.addEventListener(OPEN_RUNS_REFRESH_EVENT, handleOpenRunsRefresh)'
    );
    expect(pageSource).toContain('dispatchOpenRunsRefresh();');
  });

  it('renders unsettled trade position in endflow summary', () => {
    const source = readSource(idleDungeonPath);

    expect(source).toContain('daily_quest:leaderboard_update');
    expect(source).toContain('Open Prediction Position');
    expect(source).toContain('Manage in lobby Open Runs');
    expect(source).toContain('formatTradeCountdown(');
  });

  it('uses token-aware price precision for trade price displays', () => {
    const lobbySource = readSource(lobbyPath);
    const idleSource = readSource(idleDungeonPath);

    expect(lobbySource).toContain("const maxDecimals = token === 'GHST' ? 8 : 4;");
    expect(idleSource).toContain(
      "const maxDecimals = normalizedToken === 'GHST' ? 8 : 4;"
    );
  });
});
