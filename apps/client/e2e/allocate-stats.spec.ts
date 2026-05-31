import { test, expect } from '@playwright/test';

test.describe('Allocate Stats E2E', () => {
  test('should save allocated stats to the server endpoint', async ({
    page,
  }) => {
    const mockProfile = {
      level: 10,
      totalXp: 100000,
      unspentPoints: 2,
      stats: {
        energy: 0,
        aggression: 0,
        spookiness: 0,
        brainSize: 0,
      },
      allocationHistory: [],
    };

    let allocateRequestBody: Record<string, unknown> | null = null;
    let allocateRequestUrl: string | null = null;

    await page.route('**/api/player', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: mockProfile,
          unlockedTiers: ['normal'],
          lickTongueCount: 0,
          unlockedCharacters: [],
        }),
      });
    });

    await page.route('**/api/player/progression/allocate', async (route) => {
      const request = route.request();
      allocateRequestUrl = request.url();
      allocateRequestBody = JSON.parse(request.postData() || '{}');

      const nextProfile = {
        ...mockProfile,
        unspentPoints: mockProfile.unspentPoints - 1,
        stats: {
          ...mockProfile.stats,
          energy: mockProfile.stats.energy + 1,
        },
        allocationHistory: ['energy'],
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: nextProfile }),
      });
    });

    await page.goto('/me/allocate-stats?dev=true', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: /Allocate Stats/i })
    ).toBeVisible({ timeout: 20000 });

    const energyCard = page.locator(
      'text=Attack Speed >> xpath=ancestor::div[contains(@class, "rounded-xl")]'
    );
    const allocateButton = energyCard.getByRole('button', {
      name: '+ Stat',
    });

    await expect(allocateButton).toBeEnabled();
    await allocateButton.click();

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await page.waitForResponse((response) => {
      return (
        response.url().includes('/api/player/progression/allocate') &&
        response.status() === 200
      );
    });

    expect(allocateRequestUrl).toContain('/api/player/progression/allocate');
    expect(allocateRequestBody).toMatchObject({
      stats: {
        energy: 1,
        aggression: 0,
        spookiness: 0,
        brainSize: 0,
      },
      allocationHistory: ['energy'],
    });

    await expect(saveButton).toBeDisabled();
  });
});
