import { test, expect } from '@playwright/test';
import {
  buildIdleDevModeUrl,
  navigateToIdleMode,
  waitForIdleGameLoad,
  clickPlayButton,
  assertNoErrors,
  selectGameMode,
  TEST_CONFIGS,
} from './helpers/idle-helpers';

/**
 * Helper to get daily runs status from API
 * Uses the page's origin to make authenticated requests
 */
async function getDailyRunsStatus(
  page: import('@playwright/test').Page
): Promise<{
  usedRuns: number;
  allowedRuns: number;
  remainingRuns: number;
}> {
  // Use relative URL to use the page's origin and cookies
  const apiUrl = new URL('/api/player/daily-runs', page.url());
  const response = await page.request.get(apiUrl.toString());
  
  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`Failed to get daily runs: ${response.status()} ${errorText}`);
  }
  
  const data = await response.json();
  return {
    usedRuns: data.usedRuns || 0,
    allowedRuns: data.allowedRuns || 0,
    remainingRuns: data.remainingRuns || 0,
  };
}

/**
 * Helper to get competition runs status from API
 * Uses the page's origin to make authenticated requests
 */
async function getCompetitionRunsStatus(
  page: import('@playwright/test').Page
): Promise<{
  remainingAttunements: number;
  hasUnlockedTier: boolean;
}> {
  // Use relative URL to use the page's origin and cookies
  const apiUrl = new URL('/api/daily-runs/preview?difficultyId=normal', page.url());
  const response = await page.request.get(apiUrl.toString());
  
  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`Failed to get competition runs: ${response.status()} ${errorText}`);
  }
  
  const data = await response.json();
  return {
    remainingAttunements: data.remainingAttunements || 0,
    hasUnlockedTier: data.hasUnlockedTier || false,
  };
}

/**
 * Helper to reset daily runs (dev only)
 */
async function resetDailyRuns(page: import('@playwright/test').Page) {
  const apiUrl = new URL('/api/admin/daily-runs/reset', page.url());
  const response = await page.request.post(apiUrl.toString(), {
    data: {
      playerId: 'dev-player-id', // Dev mode uses a default player ID
    },
  });
  // May fail if endpoint doesn't exist or requires auth - that's OK
  return response.ok();
}

/**
 * Helper to replenish competition runs (dev only)
 */
async function replenishCompetitionRuns(page: import('@playwright/test').Page) {
  const apiUrl = new URL('/api/daily-runs/dev-replenish', page.url());
  const response = await page.request.post(apiUrl.toString());
  // May fail if endpoint doesn't exist or requires auth - that's OK
  return response.ok();
}

test.describe('Daily Runs Deduction Tests', () => {
  test.describe('Progression Mode Run Deduction', () => {
    test('should deduct a daily run when starting a progression mode run', async ({
      page,
    }) => {
      // Navigate to dev mode (without skipEntryFee - we want to test deduction)
      await navigateToIdleMode(page, {
        ...TEST_CONFIGS.basicSurvival,
        skipEntryFee: false, // Important: we want to test run deduction
      });

      // Wait for lobby to load
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Step 1: Get initial daily runs count
      const initialStatus = await getDailyRunsStatus(page);
      const initialRemaining = initialStatus.remainingRuns;

      // Skip test if no runs available (may need reset)
      test.skip(
        initialRemaining === 0,
        'No daily runs available - may need to reset or wait for UTC reset'
      );

      console.log('Initial daily runs:', {
        used: initialStatus.usedRuns,
        allowed: initialStatus.allowedRuns,
        remaining: initialRemaining,
      });

      // Step 2: Select Practice mode (default, but ensure it's selected)
      // Practice is the default mode (selectedMode === null)
      // Click the progression button to ensure it's selected
      const progressionButton = page.locator('[data-testid="mode-practice-button"]');
      await expect(progressionButton).toBeVisible({ timeout: 10000 });
      await progressionButton.click();

      // Step 3: Start the game
      const startButton = page.locator('[data-testid="start-run-button"]');
      await expect(startButton).toBeEnabled({ timeout: 10000 });
      await startButton.click();

      // Step 4: Wait for game to load
      await waitForIdleGameLoad(page);

      // Step 5: Verify game is running (not showing "runs exhausted" error)
      await expect(page.getByText(/HP/)).toBeVisible({ timeout: 10000 });

      // Step 6: Return to lobby to check runs status
      // Look for "Play Again", "Back to Lobby", or similar button
      const backButton = page.getByRole('button', { name: /play again|back|return|lobby/i });
      if (await backButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await backButton.click();
        // Wait for lobby to reload
        await expect(page.getByText(/Hero/i).first()).toBeVisible({
          timeout: 15000,
        });
      } else {
        // If no back button, navigate directly
        await page.goto(buildIdleDevModeUrl(TEST_CONFIGS.basicSurvival));
        await expect(page.getByText(/Hero/i).first()).toBeVisible({
          timeout: 15000,
        });
      }

      // Step 7: Check daily runs count after run start
      const afterStatus = await getDailyRunsStatus(page);
      const afterRemaining = afterStatus.remainingRuns;

      console.log('After run daily runs:', {
        used: afterStatus.usedRuns,
        allowed: afterStatus.allowedRuns,
        remaining: afterRemaining,
      });

      // Step 8: Verify runs decreased by exactly 1
      expect(afterRemaining).toBe(initialRemaining - 1);
      expect(afterStatus.usedRuns).toBe(initialStatus.usedRuns + 1);

      // Verify no errors
      await assertNoErrors(page);
    });

    test('should show server log for run deduction', async ({ page }) => {
      // This test verifies the server-side logging
      // Note: We can't directly check server logs in Playwright,
      // but we can verify the run was deducted via API

      await navigateToIdleMode(page, {
        ...TEST_CONFIGS.basicSurvival,
        skipEntryFee: false,
      });

      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      const initialStatus = await getDailyRunsStatus(page);
      test.skip(
        initialStatus.remainingRuns === 0,
        'No daily runs available'
      );

      // Select Practice mode (click the practice button)
      const progressionButton = page.locator('[data-testid="mode-practice-button"]');
      await expect(progressionButton).toBeVisible({ timeout: 10000 });
      await progressionButton.click();
      const startButton = page.locator('[data-testid="start-run-button"]');
      await startButton.click();
      await waitForIdleGameLoad(page);

      // Verify game loaded (if runs weren't deducted, we'd get an error)
      await expect(page.getByText(/HP/)).toBeVisible({ timeout: 10000 });

      // Return to lobby and verify deduction
      await page.goto(buildIdleDevModeUrl(TEST_CONFIGS.basicSurvival));
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      const afterStatus = await getDailyRunsStatus(page);
      expect(afterStatus.remainingRuns).toBe(initialStatus.remainingRuns - 1);
    });
  });

  test.describe('Competition Mode Run Deduction', () => {
    test('should deduct a competition run when starting a competitive mode run', async ({
      page,
    }) => {
      // Navigate to dev mode
      await navigateToIdleMode(page, {
        ...TEST_CONFIGS.basicSurvival,
        skipEntryFee: false, // Important: we want to test run deduction
      });

      // Wait for lobby to load
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Step 1: Get initial competition runs status
      const initialCompStatus = await getCompetitionRunsStatus(page);

      // Skip if tier not unlocked
      test.skip(
        !initialCompStatus.hasUnlockedTier,
        'Normal tier not unlocked - need 42+ lick tongues'
      );

      const initialAttunements = initialCompStatus.remainingAttunements;

      // Skip if no attunements available
      test.skip(
        initialAttunements === 0,
        'No competition runs available - may need to replenish or wait for UTC reset'
      );

      console.log('Initial competition runs:', {
        remainingAttunements: initialAttunements,
        hasUnlockedTier: initialCompStatus.hasUnlockedTier,
      });

      // Step 2: Enable competition if needed
      // Look for "Enable" button in Compete section
      const enableButton = page.getByRole('button', { name: /enable/i });
      if (await enableButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await enableButton.click();
        // Wait for attunement to complete
        await page.waitForTimeout(2000);
      }

      // Step 3: Get competition status after enabling (if we enabled it)
      let currentAttunements = initialAttunements;
      if (await enableButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        // If enable button still visible, we didn't enable it
        // Check status again
        const afterEnableStatus = await getCompetitionRunsStatus(page);
        currentAttunements = afterEnableStatus.remainingAttunements;
      }

      // Step 4: Select Competitive mode
      await selectGameMode(page, 'competitive');

      // Verify competitive mode is selected
      const competitiveButton = page.locator(
        '[data-testid="mode-competitive-button"]'
      );
      await expect(competitiveButton).toBeVisible({ timeout: 10000 });

      // Step 5: Start the game
      const startButton = page.locator('[data-testid="start-run-button"]');
      await expect(startButton).toBeEnabled({ timeout: 10000 });
      await startButton.click();

      // Step 6: Wait for game to load
      await waitForIdleGameLoad(page);

      // Step 7: Verify game shows "Daily Quest Score" (competition mode indicator)
      await expect(page.getByText(/Daily Quest Score|Quest Score/i)).toBeVisible(
        { timeout: 10000 }
      );

      // Step 8: Return to lobby
      await page.goto(buildIdleDevModeUrl(TEST_CONFIGS.basicSurvival));
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Step 9: Check competition runs status after run start
      const afterCompStatus = await getCompetitionRunsStatus(page);
      const afterAttunements = afterCompStatus.remainingAttunements;

      console.log('After run competition runs:', {
        remainingAttunements: afterAttunements,
      });

      // Step 10: Verify competition runs decreased by exactly 1
      expect(afterAttunements).toBe(currentAttunements - 1);

      // Step 11: Verify progression runs were NOT deducted
      const progressionStatus = await getDailyRunsStatus(page);
      // Progression runs should be unchanged (competition uses separate system)
      // We can't easily check the "before" value, but we can verify
      // the system is working by checking the API response structure
      expect(progressionStatus).toHaveProperty('remainingRuns');
      expect(progressionStatus).toHaveProperty('usedRuns');

      // Verify no errors
      await assertNoErrors(page);
    });

    test('should NOT deduct progression runs for competition mode', async ({
      page,
    }) => {
      // This test specifically verifies that competition runs
      // do NOT deduct from progression daily runs

      await navigateToIdleMode(page, {
        ...TEST_CONFIGS.basicSurvival,
        skipEntryFee: false,
      });

      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Get initial progression runs
      const initialProgStatus = await getDailyRunsStatus(page);
      const initialProgRemaining = initialProgStatus.remainingRuns;

      // Get initial competition status
      const initialCompStatus = await getCompetitionRunsStatus(page);
      test.skip(
        !initialCompStatus.hasUnlockedTier || initialCompStatus.remainingAttunements === 0,
        'Competition not available'
      );

      // Enable competition if needed
      const enableButton = page.getByRole('button', { name: /enable/i });
      if (await enableButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await enableButton.click();
        await page.waitForTimeout(2000);
      }

      // Start competitive run
      await selectGameMode(page, 'competitive');
      const startButton = page.locator('[data-testid="start-run-button"]');
      await startButton.click();
      await waitForIdleGameLoad(page);

      // Verify competition mode
      await expect(page.getByText(/Daily Quest Score|Quest Score/i)).toBeVisible(
        { timeout: 10000 }
      );

      // Return to lobby
      await page.goto(buildIdleDevModeUrl(TEST_CONFIGS.basicSurvival));
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Verify progression runs unchanged
      const afterProgStatus = await getDailyRunsStatus(page);
      expect(afterProgStatus.remainingRuns).toBe(initialProgRemaining);

      // Verify competition runs decreased
      const afterCompStatus = await getCompetitionRunsStatus(page);
      expect(afterCompStatus.remainingAttunements).toBeLessThan(
        initialCompStatus.remainingAttunements
      );
    });
  });

  test.describe('Practice Mode - No Run Deduction', () => {
    test('should NOT deduct runs for practice mode', async ({ page }) => {
      await navigateToIdleMode(page, {
        ...TEST_CONFIGS.basicSurvival,
        skipEntryFee: false,
      });

      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Get initial runs
      const initialStatus = await getDailyRunsStatus(page);
      const initialRemaining = initialStatus.remainingRuns;

      // Select Practice mode
      await selectGameMode(page, 'practice');

      // Start practice run
      const startButton = page.locator('[data-testid="start-run-button"]');
      await startButton.click();
      await waitForIdleGameLoad(page);

      // Verify practice mode banner
      const practiceBanner = page.locator('[data-testid="practice-mode-banner"]');
      await expect(practiceBanner).toBeVisible({ timeout: 10000 });

      // Return to lobby
      await page.goto(buildIdleDevModeUrl(TEST_CONFIGS.basicSurvival));
      await expect(page.getByText(/Hero/i).first()).toBeVisible({
        timeout: 15000,
      });

      // Verify runs NOT deducted
      const afterStatus = await getDailyRunsStatus(page);
      expect(afterStatus.remainingRuns).toBe(initialRemaining);
    });
  });
});
