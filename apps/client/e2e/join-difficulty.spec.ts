import { test, expect } from '@playwright/test';

// Utility to seed localStorage before the page loads
async function seedLocalStorageForTier(
  page: any,
  lickTongues: number,
  selectedTier?: string
) {
  await page.addInitScript(
    ({
      lickTongues,
      selectedTier,
    }: {
      lickTongues: number;
      selectedTier?: string;
    }) => {
      try {
        const inventory =
          lickTongues > 0
            ? [
                {
                  id: 'lick_tongue_seed',
                  name: 'Lick Tongue',
                  type: 'material',
                  quantity: lickTongues,
                  color: '#ff00ff',
                },
              ]
            : [];
        localStorage.setItem(
          'gotchiverse-inventory',
          JSON.stringify(inventory)
        );

        const progress = localStorage.getItem(
          'gotchiverse-difficulty-progress'
        );
        const base = progress
          ? JSON.parse(progress)
          : {
              unlockedTiers: ['normal_1'],
              selectedTier: 'normal_1',
              lickTongueCount: 0,
              lastUpdated: Date.now(),
            };
        const unlocked = new Set<string>(['normal_1']);
        if (selectedTier) {
          unlocked.add(selectedTier);
        }

        const final = {
          ...base,
          unlockedTiers: Array.from(unlocked),
          lickTongueCount: lickTongues,
          selectedTier:
            selectedTier && unlocked.has(selectedTier)
              ? selectedTier
              : base.selectedTier,
          lastUpdated: Date.now(),
        };
        localStorage.setItem(
          'gotchiverse-difficulty-progress',
          JSON.stringify(final)
        );
      } catch {}
    },
    { lickTongues, selectedTier }
  );
}

async function openLobbyAndStart(page: any) {
  const startRunButton = page.getByTestId('start-run-button');
  if ((await startRunButton.count()) > 0) {
    await expect(startRunButton).toBeVisible();
    await expect(startRunButton).toBeEnabled({ timeout: 10000 });
    await startRunButton.click();
    return;
  }

  // There can be two Play Now buttons; click the primary CTA (last match)
  const joinButton = page
    .getByRole('button', {
      name: /Play Now|Create & Join Room|Enter Treasure Room/i,
    })
    .last();
  await expect(joinButton).toBeVisible();
  await joinButton.click();
}

async function assertJoinedWithoutErrors(page: any) {
  // HUD shows RTT text when connected; allow time for scene to initialize
  await expect(page.getByText(/RTT:/i)).toBeVisible({ timeout: 30_000 });
  // No error banner rendered (narrowed to avoid generic 'error' hits)
  await expect(
    page.getByText(/Failed to connect|Failed to start game/i)
  ).not.toBeVisible({ timeout: 1000 });
  // The HUD shows "Room: <id>" once joined
  await expect(page.getByText(/Room:/i)).toBeVisible({ timeout: 30_000 });
}

test.describe('Join rooms at different difficulty levels', () => {
  test('Normal 1 (default) joins without errors', async ({ page }) => {
    await seedLocalStorageForTier(page, 0, 'normal_1');
    await page.goto('/');
    await openLobbyAndStart(page);
    await assertJoinedWithoutErrors(page);
  });

  test('Nightmare 1 joins without errors (unlocked via lick tongues)', async ({
    page,
  }) => {
    // Unlock up to nightmare_1
    await seedLocalStorageForTier(page, 50, 'nightmare_1');
    await page.goto('/');

    // Open Difficulty selector and choose Nightmare 1 to be explicit
    await page.getByTestId('difficulty-selector-button').click();
    await page.getByTestId('difficulty-tier-nightmare_1').click();

    await openLobbyAndStart(page);
    await assertJoinedWithoutErrors(page);
  });

  test('Hell 1 joins without errors (unlocked via lick tongues)', async ({
    page,
  }) => {
    // Unlock up to hell_1
    await seedLocalStorageForTier(page, 275, 'hell_1');
    await page.goto('/');

    // Open Difficulty selector and choose Hell 1
    await page.getByTestId('difficulty-selector-button').click();
    await page.getByTestId('difficulty-tier-hell_1').click();

    await openLobbyAndStart(page);
    await assertJoinedWithoutErrors(page);
  });
});
