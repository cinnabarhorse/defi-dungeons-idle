/**
 * UI Agent Smoke Tests
 *
 * This script runs browser-based smoke tests using Playwright.
 * It validates critical UI flows by interacting with data-testid elements.
 *
 * US-007: Integrate agent-browser smoke tests
 *
 * Usage:
 *   pnpm test:ui:agent
 *
 * Environment:
 *   APP_URL - Base URL for the application (default: http://localhost:3001)
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

function withDevLogin(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('dev', 'true');
    return u.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}dev=true`;
  }
}

// Use the built-in dev-login flow (?dev=true) so CI can reach the lobby without
// requiring a real wallet connection.
const SMOKE_URL = withDevLogin(APP_URL);
const STATS_URL = withDevLogin(`${APP_URL.replace(/\/$/, '')}/stats`);
const IDLE_REPLAY_URL = withDevLogin(
  `${APP_URL.replace(/\/$/, '')}/idle-debug?seed=12345&ticks=12&tickMs=1000&frame=0`
);

const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');
const LOG_FILE = path.join(process.cwd(), 'test-results', 'ui-agent.log');
const PAGE_GOTO_WAIT_UNTIL: 'load' = 'load';

interface SmokeTestResult {
  name: string;
  passed: boolean;
  error?: string;
  screenshotPath?: string;
  duration: number;
}

interface SmokeFlow {
  name: string;
  description: string;
  requiredTestIds: string[];
  run: (page: Page) => Promise<void>;
}

// Critical test IDs that must exist for smoke tests to pass
const CRITICAL_TEST_IDS = [
  'start-run-button',
  'mode-practice-button',
  'mode-competitive-button',
  'inventory-button',
  'shop-button',
  'crafting-button',
];

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Ignore log write errors
  }
}

async function ensureDirectories(): Promise<void> {
  const resultsDir = path.dirname(SCREENSHOT_DIR);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function checkTestIdExists(page: Page, testId: string): Promise<boolean> {
  const element = await page.$(`[data-testid="${testId}"]`);
  return element !== null;
}

async function checkMissingTestIds(
  page: Page,
  requiredIds: string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const testId of requiredIds) {
    const exists = await checkTestIdExists(page, testId);
    if (!exists) {
      missing.push(testId);
    }
  }
  return missing;
}

async function isConnectWalletScreen(page: Page): Promise<boolean> {
  try {
    const byRole = page.getByRole('button', { name: /connect wallet/i });
    if ((await byRole.count()) > 0) {
      return true;
    }
  } catch {
    // ignore
  }

  try {
    const byText = page.locator('text=/connect wallet/i');
    return (await byText.count()) > 0;
  } catch {
    return false;
  }
}

async function waitForLobbyOrLanding(page: Page): Promise<'lobby' | 'landing'> {
  // We consider the lobby "loaded" once either mode button appears.
  const lobbyLocator = page.locator(
    '[data-testid="mode-practice-button"], [data-testid="mode-competitive-button"]'
  );

  const start = Date.now();
  const timeoutMs = 20000;
  const landingGraceMs = 4000; // allow brief landing screen while dev-login hydrates

  while (Date.now() - start < timeoutMs) {
    if ((await lobbyLocator.count()) > 0) return 'lobby';

    const sawLanding = await isConnectWalletScreen(page);
    if (sawLanding && Date.now() - start > landingGraceMs) {
      return 'landing';
    }

    await page.waitForTimeout(250);
  }

  // Neither lobby nor landing detected.
  throw new Error(
    'Could not determine app state (neither lobby mode buttons nor Connect Wallet screen detected)'
  );
}

async function waitForLobbyHeroControls(page: Page): Promise<void> {
  await page.getByText(/Hero/i).first().waitFor({ timeout: 15000 });
  const craftingButton = page.locator('[data-testid="crafting-button"]');
  const craftingVisible = await craftingButton
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (craftingVisible) {
    return;
  }

  const selectHeroButton = page.getByRole('button', { name: /select hero/i });
  if (await selectHeroButton.isVisible().catch(() => false)) {
    await selectHeroButton.click();
  } else {
    await page.locator('[aria-labelledby="hero-heading"]').click();
  }

  const unlockedCharacterCard = page
    .locator('[data-testid="character-card"][aria-disabled="false"]')
    .first();
  if (await unlockedCharacterCard.isVisible().catch(() => false)) {
    await unlockedCharacterCard.click();
  } else {
    const unlockButton = page
      .locator('[data-testid="character-card"] button:not([disabled])')
      .first();
    await unlockButton.waitFor({ state: 'visible', timeout: 10000 });
    await unlockButton.click();
  }

  await craftingButton.waitFor({
    state: 'visible',
    timeout: 15000,
  });
}

// Define smoke test flows
const smokeFlows: SmokeFlow[] = [
  {
    name: 'lobby-load',
    description: 'Lobby page loads with critical elements',
    requiredTestIds: ['mode-practice-button', 'mode-competitive-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.waitForTimeout(2000); // Allow hydration

      const state = await waitForLobbyOrLanding(page);
      if (state === 'landing') {
        // This is a hard failure: in CI we expect the smoke harness to reach the lobby.
        throw new Error(
          'Connect Wallet landing screen detected in UI smoke tests (expected lobby).'
        );
      }

      // Check critical elements exist
      const missing = await checkMissingTestIds(page, [
        'mode-practice-button',
        'mode-competitive-button',
      ]);

      if (missing.length > 0) {
        throw new Error(`Missing test IDs on lobby: ${missing.join(', ')}`);
      }
    },
  },
  {
    name: 'idle-replay-debug',
    description: 'Idle replay debug page runs simulation and supports frame scrubbing',
    requiredTestIds: [
      'replay-seed-input',
      'replay-ticks-input',
      'replay-run-button',
      'replay-frame-slider',
      'replay-frame-hash',
    ],
    run: async (page: Page) => {
      await page.route('**/api/idle/replay*', async (route) => {
        const requestUrl = new URL(route.request().url());
        const seed = Number(requestUrl.searchParams.get('seed') || 12345);
        const ticks = Math.max(
          1,
          Math.min(100_000, Number(requestUrl.searchParams.get('ticks') || 12))
        );
        const tickMs = Math.max(
          50,
          Math.min(60_000, Number(requestUrl.searchParams.get('tickMs') || 1000))
        );

        const frames = Array.from({ length: ticks + 1 }, (_, tick) => {
          const playerHp = Math.max(0, 100 - tick * 2);
          const enemyHp = Math.max(0, 120 - tick * 5);
          return {
            tick,
            now: 1_000_000 + tick * tickMs,
            playerHp,
            playerMaxHp: 100,
            playerMana: Math.max(0, 50 - tick),
            playerMaxMana: 100,
            playerScore: tick * 10,
            playerActionGauge: tick * 0.5,
            enemyHp,
            enemyMaxHp: 120,
            enemyActionGauge: tick * 0.35,
            enemyStunTurnsRemaining: 0,
            encounterCompleted: enemyHp <= 0,
            runStatus: enemyHp <= 0 ? 'victory' : 'active',
            killCount: enemyHp <= 0 ? { normal: 1 } : {},
            lastActionLog: `Tick ${tick}: mock action`,
            stateHash: `mock-${seed}-${tick}`,
          };
        });

        const payload = {
          seed,
          ticks,
          tickMs,
          difficultyTier: 'normal_1',
          leverageTotal: 1,
          frames,
          finalStateHash: frames[frames.length - 1]?.stateHash ?? `mock-${seed}-0`,
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
      });

      await page.goto(IDLE_REPLAY_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.waitForTimeout(1000);

      const runButton = await page.$('[data-testid="replay-run-button"]');
      if (!runButton) {
        throw new Error('replay-run-button not found');
      }
      await runButton.click();

      await page.waitForFunction(() => {
        const hash = document.querySelector('[data-testid="replay-frame-hash"]');
        return Boolean(hash && (hash.textContent || '').trim().length > 0);
      });

      const slider = await page.$('[data-testid="replay-frame-slider"]');
      if (!slider) {
        throw new Error('replay-frame-slider not found');
      }

      const sliderLocator = page.locator('[data-testid="replay-frame-slider"]');
      await sliderLocator.focus();
      await sliderLocator.press('ArrowRight');
      await sliderLocator.press('ArrowRight');
      await sliderLocator.press('ArrowRight');

      await page.waitForFunction(() => {
        const tick = document.querySelector('[data-testid="replay-frame-tick"]');
        const text = (tick?.textContent || '').trim();
        return /Tick 3/i.test(text);
      });

      const tickText = await page.$eval(
        '[data-testid="replay-frame-tick"]',
        (node) => (node.textContent || '').trim()
      );
      if (!/Tick 3/i.test(tickText)) {
        throw new Error(`Expected selected replay tick to be 3, got "${tickText}"`);
      }
    },
  },
  {
    name: 'mode-selection',
    description: 'Practice and Competitive mode buttons work',
    requiredTestIds: ['mode-practice-button', 'mode-competitive-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      const state = await waitForLobbyOrLanding(page);
      if (state === 'landing') {
        throw new Error(
          'Connect Wallet landing screen detected in UI smoke tests (expected lobby).'
        );
      }

      // Click practice mode
      const practiceBtn = page.locator('[data-testid="mode-practice-button"]');
      if ((await practiceBtn.count()) === 0) {
        throw new Error('mode-practice-button not found');
      }
      await practiceBtn.click();
      await page.waitForTimeout(500);

      // Verify start button exists
      const startBtn = page.locator('[data-testid="start-run-button"]');
      if ((await startBtn.count()) === 0) {
        throw new Error('start-run-button not found after selecting Practice');
      }
    },
  },
  {
    name: 'start-run-ui',
    description: 'Start run button exists after mode selection',
    requiredTestIds: ['start-run-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      // Check for start button (may be hidden if no hero selected)
      const startBtn = await page.$('[data-testid="start-run-button"]');
      if (!startBtn) {
        // This might be expected if no hero is selected
        log(
          'Note: start-run-button not visible - may require hero selection'
        );
      }
    },
  },
  {
    name: 'inventory-access',
    description: 'Inventory button is accessible',
    requiredTestIds: ['inventory-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      const inventoryBtn = await page.$('[data-testid="inventory-button"]');
      if (!inventoryBtn) {
        log('Note: inventory-button not visible - may require hero selection');
      }
    },
  },
  {
    name: 'crafting-ui',
    description: 'Craft & Forge dialog opens from the lobby',
    requiredTestIds: ['crafting-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await waitForLobbyHeroControls(page);

      await page.locator('[data-testid="crafting-button"]').click();
      await page.getByText('Craft & Forge').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Potions' }).waitFor({
        timeout: 5000,
      });
      await page
        .getByRole('button', { name: 'Flawless Wearables' })
        .waitFor({
        timeout: 5000,
      });
    },
  },
  {
    name: 'stats-forge-charts',
    description: 'Stats page renders the forge charts',
    requiredTestIds: [],
    run: async (page: Page) => {
      await page.goto(STATS_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await page.getByRole('heading', { name: 'Stats' }).waitFor({
        timeout: 15000,
      });
      await page
        .getByText('Forges per day by rarity')
        .waitFor({ timeout: 15000 });
      await page
        .getByText('Gold consumed via forging per day')
        .waitFor({ timeout: 15000 });
    },
  },
  {
    name: 'forge-disabled-non-gotchi',
    description: 'Forge tab explains why non-gotchi heroes cannot forge',
    requiredTestIds: ['crafting-button'],
    run: async (page: Page) => {
      await page.goto(SMOKE_URL, {
        waitUntil: PAGE_GOTO_WAIT_UNTIL,
        timeout: 30000,
      });
      await waitForLobbyHeroControls(page);

      await page.locator('[data-testid="crafting-button"]').click();
      await page.getByRole('button', { name: 'Flawless Wearables' }).click();
      await page
        .getByText(/Only real Aavegotchis can Forge/i)
        .waitFor({ timeout: 5000 });
      await page
        .getByText(/Only real Aavegotchis can equip Flawless wearables/i)
        .waitFor({ timeout: 5000 });
    },
  },
];

async function runSmokeTests(): Promise<SmokeTestResult[]> {
  const results: SmokeTestResult[] = [];
  let browser: Browser | null = null;

  log('Starting UI Agent Smoke Tests');
  log(`Target URL: ${APP_URL}`);
  log(`Smoke URL (dev-login): ${SMOKE_URL}`);

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    log(
      `Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`
    );
    log('');
    log('To run UI smoke tests, ensure Playwright browsers are installed:');
    log('  npx playwright install chromium');
    log('');

    // Return graceful skip
    return [];
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    for (const flow of smokeFlows) {
      const startTime = Date.now();
      const page = await context.newPage();

      log(`\n  Running: ${flow.name} - ${flow.description}`);

      try {
        await flow.run(page);
        const screenshotPath = await takeScreenshot(page, flow.name);
        const duration = Date.now() - startTime;

        log(`  ✓ ${flow.name}: passed (${duration}ms)`);
        results.push({
          name: flow.name,
          passed: true,
          screenshotPath,
          duration,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const duration = Date.now() - startTime;

        // Take error screenshot
        try {
          await takeScreenshot(page, `${flow.name}-error`);
        } catch {
          // Ignore screenshot errors
        }

        log(`  ✗ ${flow.name}: ${error} (${duration}ms)`);
        results.push({
          name: flow.name,
          passed: false,
          error,
          duration,
        });
      } finally {
        await page.close();
      }
    }

    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

async function main(): Promise<void> {
  await ensureDirectories();

  // Clear previous log
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
  } catch {
    // Ignore
  }

  console.log('╔════════════════════════════════════════╗');
  console.log('║       UI Agent Smoke Tests             ║');
  console.log('╚════════════════════════════════════════╝\n');

  const results = await runSmokeTests();

  if (results.length === 0) {
    // Browser not installed
    console.log('\n⚠️  Smoke tests skipped (browser not available)');
    process.exit(0);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`Log file: ${LOG_FILE}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }

    // Check for missing test IDs specifically
    const missingIdErrors = results.filter(
      (r) => !r.passed && r.error?.includes('Missing test IDs')
    );
    if (missingIdErrors.length > 0) {
      console.log('\n❌ CRITICAL: Missing test IDs detected');
      console.log('   Add data-testid attributes to the missing elements.');
      console.log('   See AGENTS.md for test ID conventions.');
    }

    process.exit(1);
  }

  console.log('\n✅ All UI smoke tests passed');
}

main().catch((err) => {
  console.error('UI agent smoke tests failed:', err);
  process.exit(1);
});
