import { test, expect } from '@playwright/test';
import {
  navigateToIdleMode,
  waitForLobbyReady,
  clickPlayButton,
  waitForIdleGameLoad,
  TEST_CONFIGS,
} from './helpers/idle-helpers';

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

test.describe('Victory chest teaser (no stake)', () => {
  test('shows teaser chest and cannot be opened', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateToIdleMode(page, TEST_CONFIGS.basicSurvival);
    await waitForLobbyReady(page, 60_000);

    await clickPlayButton(page);
    await waitForIdleGameLoad(page);

    await sendRoomMessage(page, 'debug_idle_force_victory_chest_teaser');

    const revealStep = page.locator('[data-testid="endflow-step-reward-reveal"]');
    await expect(revealStep).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('[data-testid="endflow-chest-teaser"]')).toBeVisible();

    await expect(page.locator('[data-testid="endflow-open-chest-button"]')).toHaveCount(0);

    await expect(page.locator('[data-testid="endflow-stake-now"]')).toBeVisible();
    await expect(page.locator('[data-testid="endflow-refresh-chest"]')).toBeVisible();

    await page.locator('[data-testid="endflow-teaser-continue"]').click();
    const summaryStep = page.locator('[data-testid="endflow-step-summary"]');
    await expect(summaryStep).toBeVisible({ timeout: 30_000 });
  });
});
