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
  await page.waitForFunction(
    () => {
      const windowAny = window as any;
      let room =
        windowAny.__idleRoom || windowAny.__room || windowAny.idleRoom;
      if (room && typeof room.send === 'function') return true;

      const reactRoot = document.querySelector('#__next') || document.body;
      const findRoomInFiber = (node: any): any => {
        if (!node) return null;
        const fiber =
          (node as any)._reactInternalFiber ||
          (node as any)._reactInternalInstance;
        if (fiber) {
          let current = fiber;
          while (current) {
            if (current.memoizedProps?.room) return current.memoizedProps.room;
            if (current.memoizedState) {
              let state = current.memoizedState;
              while (state) {
                if (state.memoizedState?.room) return state.memoizedState.room;
                state = state.next;
              }
            }
            current = current.return;
          }
        }
        return null;
      };
      room = findRoomInFiber(reactRoot);
      return Boolean(room && typeof room.send === 'function');
    },
    undefined,
    { timeout: 60000 }
  );

  await page.evaluate(
    ({ type, payload }) => {
      const windowAny = window as any;
      let room =
        windowAny.__idleRoom || windowAny.__room || windowAny.idleRoom;
      if (!room || typeof room.send !== 'function') {
        const reactRoot = document.querySelector('#__next') || document.body;
        const findRoomInFiber = (node: any): any => {
          if (!node) return null;
          const fiber =
            (node as any)._reactInternalFiber ||
            (node as any)._reactInternalInstance;
          if (fiber) {
            let current = fiber;
            while (current) {
              if (current.memoizedProps?.room) return current.memoizedProps.room;
              if (current.memoizedState) {
                let state = current.memoizedState;
                while (state) {
                  if (state.memoizedState?.room)
                    return state.memoizedState.room;
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

      if (!room || typeof room.send !== 'function') {
        throw new Error('Room not found on window for E2E');
      }

      room.send(type, payload);
    },
    { type, payload }
  );
}

test.describe('End of run flow (EOG)', () => {
  test('victory -> reward reveal -> reward result -> summary', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateToIdleMode(page, TEST_CONFIGS.basicSurvival);
    await waitForLobbyReady(page, 60_000);

    await clickPlayButton(page);
    await waitForIdleGameLoad(page);

    await sendRoomMessage(page, 'debug_idle_force_victory_chest');

    const revealStep = page.locator('[data-testid="endflow-step-reward-reveal"]');
    await expect(revealStep).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('text=Run Summary')).toHaveCount(0);
    await expect(page.locator('[data-testid="endflow-step-reward-result"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="endflow-play-again"]')).toHaveCount(0);

    const openChest = page.locator('[data-testid="endflow-open-chest-button"]');
    await expect(openChest).toBeVisible();

    await expect(page.locator('[data-testid="endflow-skip-chest-button"]')).toHaveCount(0);

    await openChest.click();

    const resultStep = page.locator('[data-testid="endflow-step-reward-result"]');
    await expect(resultStep).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="endflow-reward-cards"]')).toBeVisible();

    await expect(page.locator('[data-testid="endflow-step-summary"]')).toHaveCount(0);

    const continueBtn = page.locator('[data-testid="endflow-continue-button"]');
    await expect(continueBtn).toBeVisible();

    await expect(continueBtn).toBeEnabled();

    await continueBtn.click();

    const summaryStep = page.locator('[data-testid="endflow-step-summary"]');
    await expect(summaryStep).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('[data-testid="endflow-play-again"]')).toBeVisible();
    await expect(page.locator('[data-testid="endflow-download-action-log"]')).toBeVisible();
  });

  test('defeat skips chest flow and shows summary', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateToIdleMode(page, TEST_CONFIGS.basicSurvival);
    await waitForLobbyReady(page, 60_000);

    await clickPlayButton(page);
    await waitForIdleGameLoad(page);

    await sendRoomMessage(page, 'debug_idle_force_death');

    const summaryStep = page.locator('[data-testid="endflow-step-summary"]');
    await expect(summaryStep).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('[data-testid="endflow-step-reward-reveal"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="endflow-step-reward-result"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="endflow-open-chest-button"]')).toHaveCount(0);

    await expect(page.locator('[data-testid="endflow-play-again"]')).toBeVisible();
    await expect(page.locator('[data-testid="endflow-download-action-log"]')).toBeVisible();
  });
});
