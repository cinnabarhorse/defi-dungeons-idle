import { test, expect } from '@playwright/test';

test.describe('Stats page', () => {
  test('keeps the category bar pinned while scrolling', async ({ page }) => {
    await page.goto('/stats', { waitUntil: 'domcontentloaded' });

    const tablist = page.getByRole('tablist', { name: 'Stats categories' });
    await expect(tablist).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(tablist).toBeVisible();

    const after = await tablist.boundingBox();
    expect(after).not.toBeNull();
    expect(after?.y ?? 0).toBeGreaterThanOrEqual(24);
    expect(after?.y ?? 999).toBeLessThanOrEqual(56);
  });

  test('switches between stats categories', async ({ page }) => {
    await page.goto('/stats', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByText('Trade runs per day')).toBeVisible();
    await expect(page.getByText('Trade Run token mix per day')).toBeVisible();
    await expect(page.getByText('Trade Run direction mix per day')).toBeVisible();
    await expect(page.getByText('Trade Run leverage heatmap')).toBeVisible();
    await expect(page.getByText('Gold earned per day')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Spending' }).click();
    await expect(page.getByRole('tab', { name: 'Spending' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByText('Items repaired per day')).toBeVisible();
    await expect(page.getByText('Gold spent on repairs per day')).toBeVisible();

    await page.getByRole('tab', { name: 'Economy' }).click();
    await expect(page.getByRole('tab', { name: 'Economy' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByText('Gold earned per day')).toBeVisible();
    await expect(page.getByText('Withdrawals per day')).toBeVisible();
  });
});
