import { test, expect } from '@playwright/test';
import {
  navigateToIdleMode,
  waitForLobbyReady,
  clickPlayButton,
  waitForIdleGameLoad,
  TEST_CONFIGS,
} from './helpers/idle-helpers';

function createApiSpamMonitor(page: import('@playwright/test').Page) {
  let playerRequests = 0;
  let stakedBalanceRequests = 0;
  let isActive = true;

  const onRequest = (req: import('@playwright/test').Request) => {
    if (!isActive) return;
    const url = new URL(req.url());
    if (url.pathname === '/api/player') playerRequests += 1;
    if (url.pathname === '/api/player/staked-balance') stakedBalanceRequests += 1;
  };

  page.on('request', onRequest);

  return {
    reset() {
      playerRequests = 0;
      stakedBalanceRequests = 0;
    },
    getCounts() {
      return { playerRequests, stakedBalanceRequests };
    },
    stop() {
      isActive = false;
      page.off('request', onRequest);
    },
  };
}

async function sendRoomMessage(
  page: import('@playwright/test').Page,
  type: string,
  payload?: unknown
) {
  await page.evaluate(
    ({ type, payload }) => {
      const w = window as Window & {
        __idleRoom?: { send: (message: string, body?: unknown) => void };
        __room?: { send: (message: string, body?: unknown) => void };
        idleRoom?: { send: (message: string, body?: unknown) => void };
      };
      const room = w.__idleRoom ?? w.__room ?? w.idleRoom;
      if (!room || typeof room.send !== 'function') {
        throw new Error('Room not found on window for E2E');
      }
      room.send(type, payload);
    },
    { type, payload }
  );
}

test.describe('Victory Chest (competition)', () => {
  test('opens chest and is idempotent', async ({ page }) => {
    test.setTimeout(120_000);
    const apiSpam = createApiSpamMonitor(page);
    await navigateToIdleMode(page, TEST_CONFIGS.basicSurvival);
    await waitForLobbyReady(page, 60_000);

    await clickPlayButton(page);
    await waitForIdleGameLoad(page);

    await sendRoomMessage(page, 'debug_idle_force_victory_chest');

    const revealStep = page.locator('[data-testid="endflow-step-reward-reveal"]');
    await expect(revealStep).toBeVisible({ timeout: 30_000 });

    const openButton = page.locator('[data-testid="endflow-open-chest-button"]');
    await expect(openButton).toBeVisible({ timeout: 30_000 });

    apiSpam.reset();
    await openButton.click();
    await page.waitForTimeout(1500);
    const { playerRequests, stakedBalanceRequests } = apiSpam.getCounts();
    expect(playerRequests).toBeLessThanOrEqual(2);
    expect(stakedBalanceRequests).toBeLessThanOrEqual(2);

    const rewardResultStep = page.locator('[data-testid="endflow-step-reward-result"]');
    await expect(rewardResultStep).toBeVisible({ timeout: 30_000 });

    const rewardCards = page.locator('[data-testid="endflow-reward-cards"]');
    await expect(rewardCards).toBeVisible({ timeout: 30_000 });

    const firstRewardText = (await rewardCards.textContent()) ?? '';
    expect(firstRewardText.length).toBeGreaterThan(10);

    await sendRoomMessage(page, 'idle_open_victory_chest');
    await page.waitForTimeout(500);

    const secondRewardText = (await rewardCards.textContent()) ?? '';
    expect(secondRewardText).toBe(firstRewardText);

    apiSpam.stop();
  });
});

