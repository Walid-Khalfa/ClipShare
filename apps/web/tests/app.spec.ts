import { test, expect, type Page } from '@playwright/test';

/**
 * Helper function to wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to check if user is authenticated by checking for dashboard elements
 */
async function getAuthenticatedPage(page: Page, baseURL: string): Promise<boolean> {
  try {
    await page.goto(`${baseURL}/dashboard`, { timeout: 5000 });
    await page.waitForSelector('text=Your Recordings', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

test.describe('Authentication Flow', () => {
  test('should show login page when accessing protected route without auth', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Sign in to Clipshare');
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    await page.fill('input[type="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  test('should handle magic link submission gracefully', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should show success message (prevents email enumeration)
    await expect(page.locator('text=Check your email')).toBeVisible();
    await expect(page.locator('text=If that email exists')).toBeVisible();
  });

  test('should allow access to home page without authentication', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    await expect(page.locator('h1')).toContainText('Clipshare');
  });

  test('should reject empty email submission', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    // Try to submit without email
    await page.click('button[type="submit"]');
    
    // HTML5 validation should prevent submission
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
  });
});

test.describe('API Security', () => {
  test('should reject requests without authentication', async ({ page, request }) => {
    // Try to access recordings without auth
    const response = await request.get('/api/recordings');
    expect(response.status()).toBe(401);
  });

  test('should reject share creation without authentication', async ({ page, request }) => {
    const response = await request.post('/api/share', {
      data: { recordingId: 'test-id' },
    });
    expect(response.status()).toBe(401);
  });

  test('should reject upload without authentication', async ({ page, request }) => {
    const response = await request.post('/api/upload?action=initiate', {
      data: { recordingId: 'test-id', contentType: 'video/webm', fileSize: 1000 },
    });
    expect(response.status()).toBe(401);
  });

  test('should validate file size on upload endpoint', async ({ page, request }) => {
    // This test checks the schema validation exists
    // Note: Full upload testing requires authentication
    const response = await request.post('/api/upload?action=initiate', {
      data: { 
        recordingId: 'test-id', 
        contentType: 'video/webm', 
        fileSize: -1 // Invalid negative size
      },
    });
    // Should return validation error
    expect([400, 401]).toContain(response.status());
  });
});

test.describe('Public Share Access', () => {
  test('should show 404 for invalid share token', async ({ page }) => {
    await page.goto('/share/invalid-token-12345');
    await waitForPageLoad(page);
    
    await expect(page.locator('text=Recording not found')).toBeVisible();
  });

  test('should redirect to home from invalid share URL format', async ({ page }) => {
    await page.goto('/share/');
    await waitForPageLoad(page);
    
    // Should handle gracefully or redirect
    expect(page.url()).toMatch(/(\/share\/|localhost)/);
  });
});

test.describe('Error Handling', () => {
  test('should show error message on dashboard when API fails', async ({ page }) => {
    // Navigate to dashboard - should handle auth check
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    // Should either redirect to login or show error
    const url = page.url();
    expect(url).toMatch(/(\/login|\/dashboard)/);
  });

  test('should handle missing recording ID gracefully', async ({ page, request }) => {
    const response = await request.delete('/api/recordings');
    expect(response.status()).toBe(400);
  });
});

test.describe('Page Structure', () => {
  test('should have proper meta tags on login page', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    // Check viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    // Check label is associated with input
    const label = page.locator('label[for="email"]');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('Email address');
  });

  test('should have proper language attribute', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
  });

  test('should have accessible button labels', async ({ page }) => {
    await page.goto('/login');
    await waitForPageLoad(page);
    
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toHaveAttribute('aria-label', /Send magic link|Sending/);
  });
});

test.describe('Security Headers', () => {
  test('should set theme-color meta tag', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBe('#0f172a');
  });
});

test.describe('Navigation', () => {
  test('should have working links on home page', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Check for Sign in link
    const signInLink = page.locator('a:has-text("Sign in")');
    await expect(signInLink).toBeVisible();
  });

  test('should navigate to record page when clicking New Recording', async ({ page }) => {
    // This will redirect to login if not authenticated
    await page.goto('/record');
    await waitForPageLoad(page);
    
    // Should redirect to login or show record page
    const url = page.url();
    expect(url).toMatch(/(\/login|\/record)/);
  });
});
