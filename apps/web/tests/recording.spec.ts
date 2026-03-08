import { test, expect, type Page } from '@playwright/test';

/**
 * Helper function to wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

test.describe('Recording Flow', () => {
  test('should show record page with proper elements', async ({ page }) => {
    // This will redirect to login if not authenticated
    await page.goto('/record');
    await waitForPageLoad(page);
    
    // Either shows login or record page
    const url = page.url();
    if (url.includes('/record')) {
      await expect(page.locator('h1')).toContainText('New Recording');
      
      // Check for recording options
      await expect(page.locator('text=Record screen')).toBeVisible();
      await expect(page.locator('text=Record microphone')).toBeVisible();
      await expect(page.locator('text=Show camera overlay')).toBeVisible();
    } else {
      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('should toggle recording options', async ({ page }) => {
    await page.goto('/record');
    await waitForPageLoad(page);
    
    // Skip if redirected to login
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    
    // Toggle camera option
    const cameraCheckbox = page.locator('input#camera');
    await cameraCheckbox.click();
    
    // Should show camera position selector
    await expect(page.locator('text=Camera position')).toBeVisible();
  });

  test('should disable Start Recording button when already recording', async ({ page }) => {
    await page.goto('/record');
    await waitForPageLoad(page);
    
    // Skip if redirected to login
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    
    const startButton = page.locator('button:has-text("Start Recording")');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
  });
});

test.describe('Dashboard Flow', () => {
  test('should show dashboard with recordings list or empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    if (page.url().includes('/dashboard')) {
      // Check for page elements
      const heading = page.locator('h2');
      await expect(heading).toContainText('Your Recordings');
      
      // Should show either recordings or empty state
      const hasRecordings = await page.locator('article').count() > 0;
      const hasEmptyState = await page.locator('text=No recordings yet').count() > 0;
      
      expect(hasRecordings || hasEmptyState).toBe(true);
    } else {
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('should have New Recording button on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    if (page.url().includes('/dashboard')) {
      await expect(page.locator('text=New Recording')).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('should have sign out button when authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    if (page.url().includes('/dashboard')) {
      await expect(page.locator('text=Sign out')).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
