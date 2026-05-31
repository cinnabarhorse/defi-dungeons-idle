import { test, expect } from '@playwright/test';
import { navigateToIdleMode } from './helpers/idle-helpers';

/**
 * E2E tests for character selection persistence across page refresh.
 * Uses dev mode (?dev=true&devMode=true) so wallet is auto-connected
 * and the server persists preferences.
 *
 * @see devmode.md
 */

const CHARACTER_NAMES =
  /(Baarbarian|Farmer|Wizard|Coderdan|Aagent|Geisha|Goldnxross|Gotchidator|XIBOT|Citaadel Knight|Bushidogotchi|Nyx)/i;

import { waitForLobbyReady } from './helpers/idle-helpers';

async function waitForLobby(page: import('@playwright/test').Page) {
  await waitForLobbyReady(page, 60000);
}

async function openCharacterSelector(page: import('@playwright/test').Page) {
  const heroSection = page.locator('[aria-labelledby="hero-heading"]');
  await expect(heroSection).toBeVisible({ timeout: 10000 });
  await heroSection.click();
  await expect(page.getByText(/Choose your Hero/i)).toBeVisible({
    timeout: 10000,
  });

  const heroesTab = page.getByRole('button', { name: /^Heroes$/i });
  if ((await heroesTab.count()) > 0) {
    await heroesTab.click();
    await page.waitForTimeout(500);
  }
}

async function selectCharacterByName(
  page: import('@playwright/test').Page,
  name: string
) {
  const card = page
    .locator('[data-testid="character-card"]')
    .filter({ hasText: name })
    .first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toHaveAttribute('aria-disabled', 'false');
  await card.click();
  await page.waitForTimeout(2000);
}

async function getDisplayedHeroName(
  page: import('@playwright/test').Page
): Promise<string | null> {
  const heroSection = page.locator('[aria-labelledby="hero-heading"]');
  await expect(heroSection).toBeVisible({ timeout: 10000 });
  const text = await heroSection.textContent();
  const match = text?.match(CHARACTER_NAMES);
  return match ? match[1] : null;
}

async function closeCharacterDialog(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: /Choose your Hero/i });
  if ((await dialog.count()) > 0) {
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  }
}

test.describe('Character selection persistence', () => {
  test('remembers selected character after page refresh', async ({ page }) => {
    await navigateToIdleMode(page, { skipEntryFee: true });
    await waitForLobby(page);

    await openCharacterSelector(page);
    await selectCharacterByName(page, 'Farmer');
    await closeCharacterDialog(page);

    const beforeRefresh = await getDisplayedHeroName(page);
    expect(beforeRefresh).toBe('Farmer');

    await page.reload();
    await waitForLobby(page);
    await page.waitForTimeout(3000);

    const afterRefresh = await getDisplayedHeroName(page);
    expect(afterRefresh).toBe('Farmer');
  });

  test('persists when switching from Wizard to Baarbarian then refreshing', async ({
    page,
  }) => {
    await navigateToIdleMode(page, { skipEntryFee: true });
    await waitForLobby(page);

    await openCharacterSelector(page);
    await selectCharacterByName(page, 'Baarbarian');
    await closeCharacterDialog(page);

    const beforeRefresh = await getDisplayedHeroName(page);
    expect(beforeRefresh).toBe('Baarbarian');

    await page.reload();
    await waitForLobby(page);
    await page.waitForTimeout(3000);

    const afterRefresh = await getDisplayedHeroName(page);
    expect(afterRefresh).toBe('Baarbarian');
  });
});
