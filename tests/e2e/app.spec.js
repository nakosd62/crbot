// tests/e2e/app.spec.js
import { test, expect } from '@playwright/test';

test.describe('CRBot E2E User Flows', () => {
  
  test.beforeEach(async ({ page }) => {
    // Intercept config route
    await page.route('/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          database_name: 'testdb',
          username: 'testuser',
          default_database_url: 'postgresql://postgres:pass@localhost:23456/testdb'
        })
      });
    });

    // Intercept translation route
    await page.route('/api/translate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          sql: 'SELECT id, name FROM users;',
          model: 'gemini-2.5-flash',
          total_tokens: 35
        })
      });
    });

    // Intercept execution route
    await page.route('/api/execute', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          rowCount: 2,
          results: [{
            columns: ['id', 'name'],
            rows: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ]
          }]
        })
      });
    });

    // Load home page before each test
    await page.goto('/');
  });

  test('should load application title and main UI components', async ({ page }) => {
    await expect(page).toHaveTitle(/CRBot/i);
    await expect(page.locator('#aiPrompt')).toBeVisible();
    await expect(page.locator('#translateBtn')).toBeVisible();
    await expect(page.locator('#runBtn')).toBeVisible();
  });

  test('should translate natural language prompt into SQL', async ({ page }) => {
    // Type user prompt
    await page.locator('#aiPrompt').fill('Show all users');
    
    // Click translate button
    await page.locator('#translateBtn').click();

    // Verify SQL output is populated (CodeMirror editor container)
    const editor = page.locator('.CodeMirror');
    await expect(editor).toBeVisible();
  });

  test('should execute SQL and display table results', async ({ page }) => {
    // Trigger execute
    await page.locator('#executeBtn').click();

    // Verify rows populated in results table
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('text=Alice')).toBeVisible();
    await expect(page.locator('text=Bob')).toBeVisible();
  });

});