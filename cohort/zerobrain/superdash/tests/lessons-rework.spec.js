// @ts-check
const { test, expect } = require('@playwright/test');

const SUPERDASH_URL = 'http://localhost:8430/';

test.describe('Lessons Learned Section -- superdash-lessons-rework', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(SUPERDASH_URL);
    // Navigate to Lessons tab
    await page.click('button[data-tab="corrections"]');
    // Wait for panel to render
    await page.waitForSelector('.corrections-panel', { timeout: 10000 });
  });

  test('1. Tool Failures loads as default tab with 5-day data', async ({ page }) => {
    // Tool Failures section should be visible immediately (not inside collapsed section)
    const tfSection = page.locator('.tf-section');
    await expect(tfSection).toBeVisible();

    // Verify the "Live Feed" tab is active by default
    const activeFeedTab = page.locator('.tf-tab.active');
    await expect(activeFeedTab).toHaveText('Live Feed');

    // Verify the fetch used days=5 by intercepting the API request
    // Switch away from Lessons tab, then back to trigger a fresh load
    await page.locator('[data-tab="guestbook"]').click();
    const requestPromise = page.waitForRequest(r => r.url().includes('tool-failures'));
    await page.locator('[data-tab="corrections"]').click();
    const req = await requestPromise;
    expect(req.url()).toContain('days=5');
    expect(req.url()).toContain('days=5');
  });

  test('2. Tab switching works between Tool Failures tabs', async ({ page }) => {
    // Click "Top Failures" tab
    await page.click('.tf-tab:has-text("Top Failures")');
    await expect(page.locator('.tf-agg')).toBeVisible();
    await expect(page.locator('.tf-live')).toBeHidden();

    // Click "Per Node" tab
    await page.click('.tf-tab:has-text("Per Node")');
    await expect(page.locator('.tf-per-node')).toBeVisible();
    await expect(page.locator('.tf-agg')).toBeHidden();

    // Click back to "Live Feed"
    await page.click('.tf-tab:has-text("Live Feed")');
    await expect(page.locator('.tf-live')).toBeVisible();
    await expect(page.locator('.tf-per-node')).toBeHidden();
  });

  test('3. Corrections/lessons section is collapsed by default and toggles', async ({ page }) => {
    // Collapsible header should be visible
    const header = page.locator('.corrections-collapsible-header');
    await expect(header).toBeVisible();

    // Body should NOT be visible (collapsed by default)
    const body = page.locator('.corrections-collapsible-body');
    await expect(body).toHaveCount(0);

    // Toggle arrow should show collapsed state
    const toggle = page.locator('.corrections-collapse-toggle');
    await expect(toggle).toHaveText('▶');

    // Click to expand
    await header.click();
    await expect(page.locator('.corrections-collapsible-body')).toBeVisible();

    // Toggle arrow should now show expanded
    await expect(page.locator('.corrections-collapse-toggle')).toHaveText('▼');

    // Click to collapse again
    await page.locator('.corrections-collapsible-header').click();
    await expect(page.locator('.corrections-collapsible-body')).toHaveCount(0);
  });

  test('4. Data renders -- no empty panels or broken elements', async ({ page }) => {
    // Tool failures section must render (either data or empty-state message)
    const tfSection = page.locator('.tf-section');
    await expect(tfSection).toBeVisible();

    // Must have either feed items OR an empty-state message -- not a blank panel
    const feedItems = page.locator('.tf-feed-item');
    const emptyMsg = page.locator('.tf-empty');
    const itemCount = await feedItems.count();
    const emptyCount = await emptyMsg.count();
    expect(itemCount + emptyCount).toBeGreaterThan(0);

    // Tab buttons must be present and clickable
    const tabs = page.locator('.tf-tab');
    await expect(tabs).toHaveCount(3);

    // Collapsible header must render with title text
    const collTitle = page.locator('.corrections-collapsible-title');
    await expect(collTitle).toHaveText('Behavioral Lessons & Corrections');
  });

  test('5. 30s auto-refresh preserves tab state and collapse state', async ({ page }) => {
    // Switch to "Per Node" tab
    await page.click('.tf-tab:has-text("Per Node")');
    await expect(page.locator('.tf-per-node')).toBeVisible();

    // Expand the corrections section
    await page.click('.corrections-collapsible-header');
    await expect(page.locator('.corrections-collapsible-body')).toBeVisible();

    // Wait for auto-refresh (poll interval is 30s, wait 35s)
    await page.waitForTimeout(35000);

    // After refresh: "Per Node" tab should still be active
    const perNodeView = page.locator('.tf-per-node');
    await expect(perNodeView).toBeVisible();

    // Corrections section should still be expanded
    await expect(page.locator('.corrections-collapsible-body')).toBeVisible();
  });

  test('4. Critical lessons surface renders at top of body', async ({ page }) => {
    // Expand the lessons collapsible
    await page.click('.corrections-collapsible-header');
    await page.waitForSelector('.corrections-body', { timeout: 5000 });

    // Critical surface should be present at top of body (before per-node groups)
    const surface = page.locator('.corrections-critical-surface');
    await expect(surface).toBeVisible();

    // Surface title shows count
    const title = page.locator('.critical-surface-title');
    await expect(title).toContainText(/Critical/i);
    await expect(title).toContainText(/\(\d+\)/);

    // Each row has a node, title, and age cell
    const rows = page.locator('.critical-row');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      const firstRow = rows.first();
      await expect(firstRow.locator('.critical-node')).not.toBeEmpty();
      await expect(firstRow.locator('.critical-title')).not.toBeEmpty();
    }
  });

  test('5. Archived lessons hidden by default; toggle reveals them', async ({ page }) => {
    await page.click('.corrections-collapsible-header');
    await page.waitForSelector('.corrections-archived-toggle', { timeout: 5000 });

    // Toggle button shows "Show archived (N)" and aria-pressed=false
    const toggle = page.locator('.corrections-archived-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toContainText(/Show archived/);

    // Zero archived cards visible by default
    const archivedBefore = await page.locator('.lesson-card.status-archived').count();
    expect(archivedBefore).toBe(0);

    // Click toggle -> archived cards appear, label flips to "Hide archived"
    await toggle.click();
    await page.waitForTimeout(500);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toContainText(/Hide archived/);
    const archivedAfter = await page.locator('.lesson-card.status-archived').count();
    expect(archivedAfter).toBeGreaterThan(0);

    // Click again to collapse back
    await toggle.click();
    await page.waitForTimeout(500);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const archivedReset = await page.locator('.lesson-card.status-archived').count();
    expect(archivedReset).toBe(0);
  });

  test('6. Per-node header shows hidden-archived count chip when archived hidden', async ({ page }) => {
    await page.click('.corrections-collapsible-header');
    await page.waitForSelector('.corrections-body', { timeout: 5000 });

    // At least one node-header should display a "(hidden)" count chip in default state
    const hiddenChips = page.locator('.count-archived-hidden');
    const chipCount = await hiddenChips.count();
    expect(chipCount).toBeGreaterThan(0);

    // After flipping toggle to show archived, hidden chips disappear; visible chips appear
    await page.click('.corrections-archived-toggle');
    await page.waitForTimeout(500);
    await expect(page.locator('.count-archived-hidden')).toHaveCount(0);
    const visibleChips = await page.locator('.count-archived').count();
    expect(visibleChips).toBeGreaterThan(0);
  });
});
