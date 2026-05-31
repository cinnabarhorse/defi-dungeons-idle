import { test, expect } from '@playwright/test';

test.describe('Bottom tabs refresh', () => {
  test('keeps the bottom tab bar visible after refreshing a non-root route', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const origin = 'http://localhost:3001';
    const sessionPayload = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      playerId: 'test-player-id',
      token: 'test-token',
    };

    // Mock auth endpoints so this test does not require a real wallet or a DB-backed
    // dev-login flow to succeed.
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify(sessionPayload),
      });
    });

    await page.route('**/api/auth/dev-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify(sessionPayload),
      });
    });

    const bottomNav = page.locator('nav.safe-area-bottom');

    // Load a non-root route with dev=true, then remove the query param without
    // resetting client state. This mirrors navigating away from "/" in dev mode:
    // tabs are visible pre-refresh, but a hard refresh loses the dev flag.
    await page.goto('/me?dev=true', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Me$/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(bottomNav).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => {
      window.history.replaceState(null, '', '/me');
    });
    await page.waitForURL('**/me', { timeout: 10_000 });
    await expect(bottomNav).toBeVisible({ timeout: 20_000 });

    // Ensure the session is restored after reload.
    const sessionOk = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/auth/session') && resp.status() === 200,
      { timeout: 30_000 }
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await sessionOk;

    await expect(page.getByRole('heading', { name: /^Me$/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(bottomNav).toBeVisible({ timeout: 20_000 });
    await expect(bottomNav.getByRole('link', { name: 'Play' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Rank' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Me' })).toBeVisible();
  });
});
