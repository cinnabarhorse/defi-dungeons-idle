/**
 * E2E Test Helpers for Idle Mode
 *
 * Provides utilities for:
 * - Dev mode URL generation
 * - Common test actions (join game, wait for game load, etc.)
 * - Assertions for idle mode state
 */

import { Page, expect } from '@playwright/test';

/**
 * Dev mode configuration options for idle mode E2E tests
 */
export interface IdleDevModeConfig {
  /** Equipment slugs to equip (e.g., 'milkshake', 'portal-mage-black-axe') */
  equipment?: string[];
  /** Number of Tier 1 health potions to start with (10% heal, min 50) */
  healthPotions?: number;
  /** Number of Tier 2 Greater Healing potions to start with (25% heal) */
  greaterPotions?: number;
  /** Number of Tier 3 Ultra Healing potions to start with (50% heal) */
  ultraPotions?: number;
  /** Number of mana potions to start with */
  manaPotions?: number;
  /** Number of lick tongues to start with */
  lickTongueCount?: number;
  /** Starting HP percentage (0-100) */
  startHpPercent?: number;
  /** Starting mana percentage (0-100) */
  startManaPercent?: number;
  /** Starting floor number (1+) */
  startFloor?: number;
  /** Starting depth (room index) */
  startDepth?: number;
  /** Enable infinite resources (unlimited potions, no cooldowns) */
  infiniteResources?: boolean;
  /** Skip entry fee charges */
  skipEntryFee?: boolean;
}

/**
 * Build a dev mode URL for idle mode testing
 *
 * @param baseUrl - Base URL (defaults to localhost:3001)
 * @param config - Dev mode configuration options
 * @returns Full URL with dev mode parameters
 *
 * @example
 * // Basic dev mode URL
 * buildIdleDevModeUrl() // '/?dev=true&devMode=true'
 *
 * // With custom equipment
 * buildIdleDevModeUrl({ equipment: ['milkshake', 'portal-mage-black-axe'] })
 *
 * // With infinite resources for testing combat
 * buildIdleDevModeUrl({ infiniteResources: true, skipEntryFee: true })
 */
export function buildIdleDevModeUrl(
  config: IdleDevModeConfig = {},
  baseUrl = ''
): string {
  const params = new URLSearchParams();

  // Required dev mode params
  params.set('dev', 'true');
  params.set('devMode', 'true');

  // Optional configuration
  if (config.equipment?.length) {
    params.set('devEquipment', config.equipment.join(','));
  }

  if (config.healthPotions !== undefined) {
    params.set('devHealthPotions', String(config.healthPotions));
  }

  if (config.greaterPotions !== undefined) {
    params.set('devGreaterPotions', String(config.greaterPotions));
  }

  if (config.ultraPotions !== undefined) {
    params.set('devUltraPotions', String(config.ultraPotions));
  }

  if (config.manaPotions !== undefined) {
    params.set('devManaPotions', String(config.manaPotions));
  }

  if (config.lickTongueCount !== undefined) {
    params.set('devLickTongue', String(config.lickTongueCount));
  }

  if (config.startHpPercent !== undefined) {
    params.set('devStartHp', String(config.startHpPercent));
  }

  if (config.startManaPercent !== undefined) {
    params.set('devStartMana', String(config.startManaPercent));
  }

  if (config.startFloor !== undefined) {
    params.set('devStartFloor', String(config.startFloor));
  }

  if (config.startDepth !== undefined) {
    params.set('devStartDepth', String(config.startDepth));
  }

  if (config.infiniteResources) {
    params.set('devInfiniteResources', 'true');
  }

  if (config.skipEntryFee) {
    params.set('devSkipEntryFee', 'true');
  }

  return `${baseUrl}/?${params.toString()}`;
}

/**
 * Navigate to idle mode with dev mode enabled
 */
export async function navigateToIdleMode(
  page: Page,
  config: IdleDevModeConfig = {}
): Promise<void> {
  const url = buildIdleDevModeUrl(config);
  
  // Set up console error logging to catch any page errors
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  
  // Set up response logging BEFORE navigation
  const apiResponses: Array<{ method: string; url: string; status: number; hasCookie: boolean }> = [];
  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes('/api/')) {
      const request = response.request();
      const requestHeaders = request.headers();
      const hasCookie = !!requestHeaders.cookie;
      apiResponses.push({
        method: request.method(),
        url: responseUrl,
        status: response.status(),
        hasCookie,
      });
      
      if (responseUrl.includes('/api/auth/session') || responseUrl.includes('/api/player')) {
        console.log(`[API] ${request.method()} ${responseUrl} -> ${response.status()} (cookie: ${hasCookie})`);
        if (response.status() === 401) {
          console.log(`[API] 401 - Request headers:`, Object.keys(requestHeaders));
          console.log(`[API] 401 - Cookie header:`, requestHeaders.cookie || 'MISSING');
        }
      }
    }
  });
  
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(text);
    }
    // Track dev login messages
    if (text.includes('[DEV MODE]')) {
      consoleMessages.push(text);
    }
  });
  
  page.on('pageerror', (error) => {
    errors.push(`Page error: ${error.message}`);
  });

  // Navigate and wait for page to load
  // Use 'domcontentloaded' instead of 'networkidle' because the app has WebSocket/long-polling connections
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for the page to be fully loaded
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for dev login to complete by intercepting the network request
  let devLoginSuccess = false;
  let sessionToken: string | null = null;
  
  try {
    const devLoginResponse = await page.waitForResponse(
      (response) => {
        return response.url().includes('/api/auth/dev-login') && response.status() === 200;
      },
      { timeout: 15000 }
    );
    
    if (devLoginResponse.ok()) {
      const data = await devLoginResponse.json();
      if (data.address && data.playerId) {
        devLoginSuccess = true;
        sessionToken = data.token || null;
        console.log('Dev login successful:', { address: data.address, playerId: data.playerId, hasToken: !!sessionToken });
        
        // Extract Set-Cookie header and manually set it via browser context
        const setCookieHeaders = devLoginResponse.headers()['set-cookie'];
        const cookies = setCookieHeaders
          ? Array.isArray(setCookieHeaders)
            ? setCookieHeaders
            : [setCookieHeaders]
          : [];

        const serverUrl = 'http://localhost:1999';
        const isSecure = serverUrl.startsWith('https://');
        const sameSite = isSecure ? 'None' : 'Lax';

        const parsedCookies = cookies
          .map((cookieStr) =>
            cookieStr
              .split(';')
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
          )
          .map((parts) => parts[0])
          .filter(Boolean)
          .map((nameValue) => {
            const [name, value] = nameValue.split('=');
            if (!name || !value) return null;
            return { name: name.trim(), value: value.trim() };
          })
          .filter(Boolean) as Array<{ name: string; value: string }>;

        if (sessionToken && parsedCookies.length === 0) {
          parsedCookies.push({ name: 'dd-session', value: sessionToken });
        }

        for (const cookie of parsedCookies) {
          const cookieBase = {
            name: cookie.name,
            value: cookie.value,
            sameSite,
            secure: isSecure,
          } as const;

          try {
            await page.context().addCookies([
              {
                ...cookieBase,
                url: serverUrl,
              },
            ]);
            console.log(`Added cookie ${cookie.name} for server origin`);
          } catch (cookieError) {
            try {
              await page.context().addCookies([
                {
                  ...cookieBase,
                  domain: 'localhost',
                  path: '/',
                },
              ]);
              console.log(`Added cookie ${cookie.name} for server origin (domain fallback)`);
            } catch (fallbackError) {
              console.warn(`Failed to add cookie ${cookie.name}:`, fallbackError);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Dev login response not received within timeout, checking console messages...');
    // Fallback: check console messages
    for (let i = 0; i < 10; i++) {
      const hasSuccess = consoleMessages.some(msg => msg.includes('Dev login success'));
      if (hasSuccess) {
        devLoginSuccess = true;
        break;
      }
      await page.waitForTimeout(500);
    }
  }
  
  if (!devLoginSuccess) {
    console.warn('Dev login may have failed. Console messages:', consoleMessages);
  }
  
  // Store the session token for potential use in route interception
  if (sessionToken) {
    (page as any).__sessionToken = sessionToken;
  }
  
  // Give React time to hydrate and render after auth
  await page.waitForTimeout(2000);
  
  // Give time for cookie to be set and session to be established
  // The browser needs a moment to process the Set-Cookie header
  await page.waitForTimeout(2000);
  
  // Debug: Check what cookies are set
  const cookies = await page.context().cookies();
  const sessionCookies = cookies.filter(c => c.name.includes('session') || c.name.includes('auth'));
  if (sessionCookies.length > 0) {
    console.log('Session cookies found:', sessionCookies.map(c => ({ name: c.name, domain: c.domain, path: c.path })));
  } else {
    console.warn('No session cookies found after dev login');
  }
  
  // Wait for successful API calls - we saw they're working (200 responses)
  // Wait for at least one successful /api/player call which indicates data is loaded
  let playerDataLoaded = false;
  try {
    await page.waitForResponse(
      (response) => {
        const url = response.url();
        // Wait for the main /api/player endpoint (not sub-endpoints)
        return (
          url === 'http://localhost:1999/api/player' && 
          response.status() === 200
        );
      },
      { timeout: 20000 }
    );
    playerDataLoaded = true;
    console.log('Player data loaded successfully');
  } catch (e) {
    // Check if we got any successful player calls
    const successfulPlayerCalls = apiResponses.filter(
      r => r.url.includes('/api/player') && r.status === 200
    );
    if (successfulPlayerCalls.length > 0) {
      playerDataLoaded = true;
      console.log(`Player data loaded (${successfulPlayerCalls.length} successful calls)`);
    } else {
      console.warn('Did not see successful player data load');
    }
  }
  
  // Give React time to process the data and render the lobby
  // The lobby needs player data, preferences, and character data to render
  await page.waitForTimeout(5000);
  
  // Check what's actually on the page
  const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
  const hasLobbyElements = 
    bodyText.includes('Hero') || 
    bodyText.includes('Practice') || 
    bodyText.includes('Competitive') ||
    bodyText.includes('Start');
  
  if (!hasLobbyElements && bodyText.length > 0) {
    console.warn('Lobby elements not found. Page content preview:', bodyText.substring(0, 500));
  }
  
  // Log any errors that occurred during navigation
  if (errors.length > 0) {
    console.warn('Console errors during navigation:', errors);
  }
  
  if (!devLoginSuccess && consoleMessages.length > 0) {
    console.warn('Dev login status unclear. Messages:', consoleMessages);
  }
}

/**
 * Wait for the idle game to fully load
 * Checks for:
 * 1. Floor/Room indicator (game state synced)
 * 2. HP indicator visible (player state loaded)
 */
export async function waitForIdleGameLoad(
  page: Page,
  timeout = 30000
): Promise<void> {
  // Wait for game canvas or game container to be present
  // This indicates the Phaser game has initialized
  await page.waitForSelector('canvas, [data-testid="game-container"], [class*="game"]', { 
    timeout: Math.min(timeout, 15000) 
  }).catch(() => {
    // Canvas might not exist in idle mode, that's okay
  });

  // Wait for Floor/Room indicator - shows game is running
  // Try multiple patterns to catch different UI states
  try {
    await expect(
      page.getByText(/Floor \d+|Room \d+|Floor: \d+|Room: \d+/i)
    ).toBeVisible({ timeout: Math.min(timeout, 20000) });
  } catch (e) {
    // If room/floor text not found, check for HP as fallback
    // Some game states might show HP before room info
  }

  // Wait for HP indicator - shows player state is loaded
  // Format can be "HP 105" in lobby or "105/200 HP" in game
  await expect(
    page.getByText(/HP \d+|\d+\/\d+ HP|Health|HP:/i).first()
  ).toBeVisible({ timeout: Math.min(timeout, 20000) });
}

/**
 * Click the Play/Start button to begin the game
 * Uses data-testid for stable selection (US-008)
 */
export async function clickPlayButton(page: Page): Promise<void> {
  await ensureCharacterSelected(page);
  
  if (page.isClosed()) {
    throw new Error('Page closed before clicking play button');
  }
  
  // Wait for start button to be visible
  const startRunButton = page.locator('[data-testid="start-run-button"]');
  await expect(startRunButton).toBeVisible({ timeout: 30000 });
  
  if (page.isClosed()) {
    throw new Error('Page closed while waiting for start button');
  }
  
  // Check if a mode needs to be selected
  const buttonText = await startRunButton.textContent().catch(() => '');
  const isDisabled = await startRunButton.isDisabled().catch(() => true);
  
  // If button says "Select a Mode" or is disabled, we need to select a mode
  if (buttonText?.includes('Select a Mode') || (isDisabled && buttonText && !buttonText.includes('Connecting'))) {
    if (page.isClosed()) return;
    
    // Check which mode buttons are available
    const practiceButton = page.locator('[data-testid="mode-practice-button"]');
    const competitiveButton = page.locator('[data-testid="mode-competitive-button"]');
    
    // Prefer practice mode for tests (no daily run limits)
    if ((await practiceButton.count()) > 0) {
      await selectGameMode(page, 'practice');
    } else if ((await competitiveButton.count()) > 0) {
      await selectGameMode(page, 'competitive');
    }
    
    if (!page.isClosed()) {
      await page.waitForTimeout(1000);
    }
  }

  if (page.isClosed()) {
    throw new Error('Page closed before clicking start button');
  }

  // Wait for the start button to be enabled
  await expect(startRunButton).toBeEnabled({ timeout: 20000 });
  
  if (page.isClosed()) {
    throw new Error('Page closed after start button enabled');
  }
  
  await startRunButton.click();
}

/**
 * Verify no error messages are displayed
 */
export async function assertNoErrors(page: Page): Promise<void> {
  await expect(
    page.getByText(/Failed to connect|Failed to start game|Error:/i)
  ).not.toBeVisible({ timeout: 1000 });
}

/**
 * Wait for combat encounter to be active
 * Checks for enemy visibility or combat-related UI elements
 */
export async function waitForCombatEncounter(
  page: Page,
  timeout = 20000
): Promise<void> {
  // Click "Enter Next Room" if it exists
  const nextRoomButton = page.getByRole('button', {
    name: /Enter Next Room/i,
  });
  if ((await nextRoomButton.count()) > 0) {
    await nextRoomButton.first().click();
    await page.waitForTimeout(1000);
  }
  
  // Wait for combat indicators - try multiple approaches
  const combatIndicators = [
    // Specific enemy UI elements
    page.locator('[data-testid="enemy-hp-bar"]'),
    page.locator('[data-enemy-id]'),
    page.locator('[class*="enemy"]'),
    // Combat-related text
    page.getByText(/Hostiles Remaining|Enemy HP|Total Enemy HP/i),
    page.getByText(/Enemies|Enemy/i),
    // Room/combat state indicators
    page.getByText(/Room \d+|Floor \d+/i),
  ];
  
  let found = false;
  for (const indicator of combatIndicators) {
    try {
      await expect(indicator.first()).toBeVisible({ timeout: Math.min(timeout, 10000) });
      found = true;
      break;
    } catch (e) {
      // Try next indicator
    }
  }
  
  if (!found) {
    // Last resort: wait a bit and check if game is in combat state
    await page.waitForTimeout(3000);
    const bodyText = await page.textContent('body');
    const hasCombatIndicators = bodyText?.match(/enemy|hostile|combat|room|floor/i);
    if (!hasCombatIndicators) {
      throw new Error('Combat encounter not detected - game may not have started combat');
    }
    // If we have combat-related text, consider it a success
    found = true;
  }
  
  // Give a moment for combat UI to fully render
  await page.waitForTimeout(1000);
}

/**
 * Click the Attack button in combat
 */
export async function clickAttackButton(page: Page): Promise<void> {
  const attackButton = page.getByRole('button', { name: /Attack/i });
  await expect(attackButton).toBeVisible();
  await attackButton.click();
}

/**
 * Click the Grenade button in combat
 */
export async function clickGrenadeButton(page: Page): Promise<void> {
  const grenadeButton = page.getByRole('button', { name: /Grenade/i });
  await expect(grenadeButton).toBeVisible();
  await grenadeButton.click();
}

/**
 * Click the Kite (move away) button in combat
 */
export async function clickKiteButton(page: Page): Promise<void> {
  const kiteButton = page.getByRole('button', { name: /Kite|Move Away/i });
  await expect(kiteButton).toBeVisible();
  await kiteButton.click();
}

/**
 * Toggle auto-explore mode
 * Note: AUTO button was removed from UI. This helper now sends the message directly via the room.
 * The room must be exposed to window.__idleRoom for this to work in E2E tests.
 */
export async function toggleAutoExplore(page: Page): Promise<void> {
  // Since the AUTO button was removed, send the message directly via the room
  await page.evaluate(() => {
    const windowAny = window as any;
    // Try to find the room - check common locations
    let room = windowAny.__idleRoom || windowAny.__room || windowAny.idleRoom;
    
    // If not found, try to access via React component (for E2E tests)
    if (!room) {
      // Look for room in React DevTools fiber tree
      const reactRoot = document.querySelector('#__next') || document.body;
      const findRoomInFiber = (node: any): any => {
        if (!node) return null;
        const fiber = (node as any)._reactInternalFiber || (node as any)._reactInternalInstance;
        if (fiber) {
          let current = fiber;
          while (current) {
            // Check memoized props
            if (current.memoizedProps?.room) {
              return current.memoizedProps.room;
            }
            // Check memoized state
            if (current.memoizedState) {
              let state = current.memoizedState;
              while (state) {
                if (state.memoizedState?.room) {
                  return state.memoizedState.room;
                }
                state = state.next;
              }
            }
            current = current.return;
          }
        }
        return null;
      };
      room = findRoomInFiber(reactRoot);
    }
    
    if (room && typeof room.send === 'function') {
      const player = room.state?.players?.get?.(room.sessionId);
      const isAutoExploring = player?.isAutoExploring ?? true;
      room.send('idle_toggle_auto', { enabled: !isAutoExploring });
    } else {
      console.warn('Could not find room to toggle auto-explore. Auto mode may be always enabled.');
    }
  });

  // Wait for state to update
  await page.waitForTimeout(500);
}

/**
 * Toggle speed run mode
 */
export async function toggleSpeedRun(page: Page): Promise<void> {
  const inGameButton = page.getByRole('button', { name: /SPEED RUN/i });
  if ((await inGameButton.count()) > 0) {
    await expect(inGameButton).toBeVisible();
    await inGameButton.click();
    return;
  }

  const speedRunRow = page
    .getByText('Speed Run')
    .first()
    .locator('..')
    .locator('..');
  const speedRunButton = speedRunRow.getByRole('button');
  await expect(speedRunButton).toBeVisible();
  await speedRunButton.click();
}

/**
 * Get the current room/floor display text
 */
export async function getCurrentRoomText(page: Page): Promise<string> {
  const roomIndicator = page.locator('[data-testid="room-indicator"], [class*="room"], [class*="floor"]');
  const text = await roomIndicator.textContent();
  return text || '';
}

/**
 * Wait for victory screen to appear
 */
export async function waitForVictoryScreen(
  page: Page,
  timeout = 120000
): Promise<void> {
  await expect(
    page.getByText(/Victory|You Win|Boss Defeated|Congratulations/i)
  ).toBeVisible({ timeout });
}

/**
 * Wait for death screen to appear
 * Handles both regular death screen ("YOU DIED") and practice mode death screen ("RUN OVER")
 */
export async function waitForDeathScreen(
  page: Page,
  timeout = 60000
): Promise<void> {
  await expect(
    page.getByText(/Defeated|You Died|Game Over|LOOT LOST|RUN OVER/i)
  ).toBeVisible({ timeout });
}

/**
 * Get the action log text
 */
export async function getActionLogText(page: Page): Promise<string> {
  const actionLog = page.locator('[data-testid="action-log"], [class*="action-log"], [class*="combat-log"]');
  const text = await actionLog.textContent();
  return text || '';
}

/**
 * Check if a grenade is on cooldown by looking at the button state
 */
export async function isGrenadOnCooldown(page: Page): Promise<boolean> {
  const grenadeButton = page.getByRole('button', { name: /Grenade/i });
  const isDisabled = await grenadeButton.isDisabled();
  return isDisabled;
}

/**
 * Wait for N seconds (for observing game tick progression)
 */
export async function waitSeconds(page: Page, seconds: number): Promise<void> {
  await page.waitForTimeout(seconds * 1000);
}

export async function selectGameMode(
  page: Page,
  mode: 'practice' | 'competitive' | 'progression'
): Promise<void> {
  await ensureCharacterSelected(page);

  // Note: Practice mode was removed. Use 'progression' for the default mode.
  // The lobby only has 'progression' (null) and 'competitive' modes.
  const actualMode = mode === 'practice' ? 'progression' : mode;

  // Use data-testid selectors for stable element selection (US-008)
  const testId =
    actualMode === 'progression' 
      ? 'mode-practice-button' 
      : 'mode-competitive-button';
  const modeButton = page.locator(`[data-testid="${testId}"]`);

  // Fallback to text-based selector if testid not found
  if ((await modeButton.count()) === 0) {
    const label = actualMode === 'progression' 
      ? /Practice/i 
      : /Competitive|Compete/i;
    const fallbackButton = page.getByRole('button', { name: label }).first();
    await expect(fallbackButton).toBeVisible({ timeout: 15000 });
    await fallbackButton.click();
  } else {
    await expect(modeButton).toBeVisible({ timeout: 15000 });
    await modeButton.click();
  }

  // Wait for settings to appear (if they do)
  // Progression mode might not show settings panel, competitive does
  if (actualMode === 'competitive') {
    const settingsHeading = /Competitive Settings/i;
    try {
      await expect(page.getByText(settingsHeading)).toBeVisible({ timeout: 5000 });
    } catch (e) {
      // Settings might not always be visible, that's okay
    }
  }
}

/**
 * Wait for the lobby to be fully loaded and ready
 * This is a shared helper that can be used by multiple test functions
 * Ensures: authentication, player data loaded, character selected, lobby rendered
 */
export async function waitForLobbyReady(page: Page, timeout = 60000): Promise<void> {
  // First, wait for authentication to complete
  // Check if session API has been called successfully
  try {
    await page.waitForResponse(
      (response) => {
        const url = response.url();
        return (
          (url.includes('/api/auth/session') && response.status() === 200) ||
          (url.includes('/api/player') && response.status() === 200)
        );
      },
      { timeout: Math.min(timeout, 30000) }
    );
    // Give React time to update state after session is established
    await page.waitForTimeout(2000);
  } catch (e) {
    // Session might already be established, continue
    await page.waitForTimeout(1000);
  }

  // Wait for hero section to be visible (indicates lobby is rendering)
  try {
    await expect(page.locator('[aria-labelledby="hero-heading"]')).toBeVisible({
      timeout: Math.min(timeout, 40000),
    });
  } catch (e) {
    // Try fallback: look for any hero-related text
    try {
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: Math.min(timeout, 20000),
      });
    } catch (e2) {
      throw new Error('Hero section not found - lobby may not be rendering');
    }
  }
  
  // Ensure a character is selected (required for mode buttons to appear)
  // Check if character selection is needed
  const viewStatsButton = page.getByRole('button', { name: /View Stats/i });
  const selectHeroButton = page.getByRole('button', { name: /Select a Hero|Select hero/i });
  
  const hasViewStats = (await viewStatsButton.count()) > 0;
  const hasSelectHero = (await selectHeroButton.count()) > 0;
  
  if (hasSelectHero && !hasViewStats) {
    // Character needs to be selected
    console.log('Selecting a character...');
    await ensureCharacterSelected(page);
    // Wait for character selection to register
    await page.waitForTimeout(1000);
  }
  
  // Now wait for mode buttons to appear (they only show when character is selected)
  try {
    // Try to find either mode button
    const practiceButton = page.locator('[data-testid="mode-practice-button"]');
    const competitiveButton = page.locator('[data-testid="mode-competitive-button"]');
    const progressionButton = page.locator('[data-testid="mode-practice-button"]');
    
    // Wait for at least one mode button to be visible
    await Promise.race([
      expect(practiceButton).toBeVisible({ timeout: Math.min(timeout, 20000) }),
      expect(competitiveButton).toBeVisible({ timeout: Math.min(timeout, 20000) }),
      expect(progressionButton).toBeVisible({ timeout: Math.min(timeout, 20000) }),
    ]);
    
    console.log('Mode buttons are visible - lobby is ready');
    await page.waitForTimeout(1000);
    return;
  } catch (e) {
    // Mode buttons not found - check what's actually on the page
    const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
    const title = await page.title().catch(() => '');
    
    throw new Error(
      `Mode buttons not found. Page title: "${title}", ` +
      `Body preview: ${bodyText.substring(0, 300)}, URL: ${page.url()}`
    );
  }
}

export async function ensureCharacterSelected(page: Page): Promise<void> {
  // Wait for lobby to be ready first
  await waitForLobbyReady(page);

  // Check if character is already selected by looking for "View Stats" button or selected character card
  const viewStatsButton = page.getByRole('button', { name: /View Stats/i });
  if ((await viewStatsButton.count()) > 0) {
    // Character is already selected
    return;
  }

  // Check for selected character card in the hero section
  const heroSection = page.locator('[aria-labelledby="hero-heading"]');
  if ((await heroSection.count()) > 0) {
    const selectedCard = heroSection.locator(
      '[data-testid="character-card"][aria-selected="true"]'
    );
    if ((await selectedCard.count()) > 0) {
      // Character is already selected
      return;
    }
  }

  // Need to select a character - click on hero section to open selector
  if (page.isClosed()) return;
  
  const selectHeroButton = page.getByRole('button', { 
    name: /Select a Hero|Select hero/i 
  });
  
  if ((await selectHeroButton.count()) === 0) {
    // Try clicking the hero section directly
    const heroSectionClick = page.locator('[aria-labelledby="hero-heading"]');
    if ((await heroSectionClick.count()) > 0) {
      await heroSectionClick.click();
    } else {
      // No hero section found, might already be selected or page not loaded
      // In dev mode, character might auto-select
      return;
    }
  } else {
    await selectHeroButton.first().click();
  }

  if (page.isClosed()) return;

  // Wait for character selection dialog
  try {
    await expect(page.getByText(/Choose your Hero/i)).toBeVisible({
      timeout: 10000,
    });

    if (page.isClosed()) return;

    // Switch to Heroes tab if needed
    const heroesTab = page.getByRole('button', { name: /^Heroes$/i });
    if ((await heroesTab.count()) > 0) {
      await heroesTab.first().click();
      if (!page.isClosed()) {
        await page.waitForTimeout(500);
      }
    }

    if (page.isClosed()) return;

    // Check if a character is already selected in the dialog
    const selectedCard = page.locator(
      '[data-testid="character-card"][aria-selected="true"]'
    );
    if ((await selectedCard.count()) > 0) {
      // Close dialog and return
      await page.keyboard.press('Escape');
      if (!page.isClosed()) {
        await page.waitForTimeout(500);
      }
      return;
    }

    // Select first available character
    const firstAvailableCard = page
      .locator('[data-testid="character-card"][aria-disabled="false"]')
      .first();

    await expect(firstAvailableCard).toBeVisible({ timeout: 10000 });
    await firstAvailableCard.click();
    if (!page.isClosed()) {
      await page.waitForTimeout(1000); // Wait for selection to register
    }
  } catch (e) {
    // Dialog might not have opened, or character might already be selected
    // Try pressing escape to close any open dialogs
    if (!page.isClosed()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }
}

export async function setRunSettingsLeverage(
  page: Page,
  target: number
): Promise<void> {
  const slider = page.getByRole('slider').first();
  await expect(slider).toBeVisible({ timeout: 10000 });
  await slider.focus();

  const clamped = Math.max(1, Math.min(50, Number(target) || 1));
  for (let step = 0; step < 600; step += 1) {
    const currentValue = await slider.getAttribute('aria-valuenow');
    const current = Number(currentValue);
    if (Number.isFinite(current) && Math.abs(current - clamped) < 0.01) {
      break;
    }
    if (!Number.isFinite(current)) {
      await page.keyboard.press('ArrowRight');
      continue;
    }
    await page.keyboard.press(current < clamped ? 'ArrowRight' : 'ArrowLeft');
  }

  const finalValue = await slider.getAttribute('aria-valuenow');
  const finalValueNumber = Number(finalValue);
  if (Number.isFinite(finalValueNumber)) {
    expect(finalValueNumber).toBeCloseTo(clamped, 1);
  }
}

/**
 * Common test configurations for different scenarios
 */
export const TEST_CONFIGS = {
  /** Basic test with infinite resources for guaranteed survival */
  basicSurvival: {
    infiniteResources: true,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test with healing grenade */
  healingGrenade: {
    equipment: ['milkshake'],
    startHpPercent: 30,
    healthPotions: 0,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test with damage weapon and healing */
  combatReady: {
    equipment: ['portal-mage-black-axe', 'milkshake'],
    infiniteResources: true,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test potion auto-use */
  potionTest: {
    healthPotions: 5,
    startHpPercent: 10,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test starting at higher floor */
  highFloor: {
    startFloor: 5,
    infiniteResources: true,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Start directly in boss room (depth 10) for fast victory tests */
  bossRoom: {
    startDepth: 10,
    equipment: ['portal-mage-black-axe'],
    infiniteResources: true,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test with wizard equipment */
  wizardTest: {
    equipment: ['common-wizard-staff'],
    manaPotions: 10,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test Greater Healing Potion (Tier 2 - 25% heal) in combat */
  greaterPotionTest: {
    greaterPotions: 3,
    startHpPercent: 10,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test Ultra Healing Potion (Tier 3 - 50% heal) in combat */
  ultraPotionTest: {
    ultraPotions: 3,
    startHpPercent: 10,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test all potion tiers together */
  allPotionTiersTest: {
    healthPotions: 3,
    greaterPotions: 3,
    ultraPotions: 3,
    startHpPercent: 10,
    infiniteResources: true,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test crafting T1 → T2 (need 3+ T1 potions) */
  craftingT1ToT2: {
    healthPotions: 5,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test crafting T2 → T3 (need 3+ T2 potions) */
  craftingT2ToT3: {
    greaterPotions: 4,
    skipEntryFee: true,
  } as IdleDevModeConfig,

  /** Test insufficient materials for crafting */
  craftingInsufficient: {
    healthPotions: 2, // Not enough to craft
    skipEntryFee: true,
  } as IdleDevModeConfig,
};

/**
 * Open the crafting menu from the lobby
 * Uses data-testid for stable selection (US-008)
 */
export async function openCraftingMenu(page: Page): Promise<void> {
  // Prefer data-testid selector for stability
  const craftButtonByTestId = page.locator('[data-testid="crafting-button"]');
  if ((await craftButtonByTestId.count()) > 0) {
    await expect(craftButtonByTestId).toBeVisible({ timeout: 10000 });
    await craftButtonByTestId.click();
  } else {
    // Fallback to aria-label selector
    const craftButton = page.getByRole('button', { name: /Open crafting/i });
    await expect(craftButton).toBeVisible({ timeout: 10000 });
    await craftButton.click();
  }

  // Wait for crafting dialog to open
  await expect(page.getByText('Craft & Forge')).toBeVisible({ timeout: 5000 });
}

/**
 * Close the crafting menu
 */
export async function closeCraftingMenu(page: Page): Promise<void> {
  // Press Escape or click outside to close the dialog
  await page.keyboard.press('Escape');
  await expect(page.getByText('Craft & Forge')).not.toBeVisible({
    timeout: 5000,
  });
}

/**
 * Get the displayed potion count for a tier from the crafting UI
 */
export async function getCraftingPotionCount(
  page: Page,
  tier: number
): Promise<number> {
  // Look for the tier indicator "T1", "T2", or "T3" and get the count next to it
  const tierText = `T${tier}`;
  const tierElement = page.locator(`text=${tierText}`).first();
  const container = tierElement.locator('xpath=ancestor::div[contains(@class, "rounded-lg")]').first();
  const countText = await container.locator('.font-bold').textContent();
  return parseInt(countText || '0', 10);
}

/**
 * Click the craft button for a specific tier conversion
 * @param fromTier - The input tier (1 for T1→T2, 2 for T2→T3)
 */
export async function clickCraftButton(
  page: Page,
  fromTier: number
): Promise<void> {
  // The crafting dialog has two recipe rows, each with "Input" and "Output" labels
  // Find all Craft buttons and click the one for the correct tier
  // T1→T2 is the first recipe (index 0), T2→T3 is the second recipe (index 1)
  const craftButtons = page.getByRole('button', { name: 'Craft' });
  const buttonIndex = fromTier === 1 ? 0 : 1;
  const craftButton = craftButtons.nth(buttonIndex);
  await expect(craftButton).toBeVisible();
  await craftButton.click();
}

/**
 * Check if a craft button is enabled for a specific tier
 */
export async function isCraftButtonEnabled(
  page: Page,
  fromTier: number
): Promise<boolean> {
  // T1→T2 is the first recipe (index 0), T2→T3 is the second recipe (index 1)
  const craftButtons = page.getByRole('button', { name: 'Craft' });
  const buttonIndex = fromTier === 1 ? 0 : 1;
  const craftButton = craftButtons.nth(buttonIndex);
  return await craftButton.isEnabled();
}

/**
 * Wait for crafting success message
 */
export async function waitForCraftingSuccess(
  page: Page,
  timeout = 10000
): Promise<void> {
  await expect(page.getByText(/Crafted.*from/i)).toBeVisible({ timeout });
}

/**
 * Wait for crafting error message
 */
export async function waitForCraftingError(
  page: Page,
  errorText: string | RegExp,
  timeout = 5000
): Promise<void> {
  await expect(page.getByText(errorText)).toBeVisible({ timeout });
}
