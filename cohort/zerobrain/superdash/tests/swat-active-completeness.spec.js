const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.SUPERDASH_URL || 'http://localhost:8430/';

test.beforeEach(async ({ page }) => {
  for (const script of ['api.js', 'taskboard.js']) {
    await page.route(`**/js/${script}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: fs.readFileSync(path.join(__dirname, '..', 'js', script), 'utf8'),
      });
    });
  }
});

test('task board renders every authoritative active SWAT in the fetched stage pages', async ({ page }) => {
  await page.goto(TARGET_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => (
    window.TaskBoard &&
    Array.isArray(window.TaskBoard.swats) &&
    window.TaskBoard.swatCounts
  ));

  const state = await page.evaluate(() => ({
    rendered: window.TaskBoard.swats.length,
    authoritative:
      (window.TaskBoard.swatCounts.open || 0) +
      (window.TaskBoard.swatCounts.in_review || 0),
    ids: window.TaskBoard.swats.map((swat) => swat.swat_id),
  }));

  expect(new Set(state.ids).size).toBe(state.ids.length);
  expect(state.rendered).toBe(state.authoritative);
});

test('task board preserves last-known-good SWATs and fails loud when one stage is incomplete', async ({ page }) => {
  let failInReview = false;
  const openSwat = {
    swat_id: 'SWAT-TEST-OPEN',
    title: 'Open test SWAT',
    stage: 'open',
    severity: 'medium',
    created_at_epoch_ms: 2,
  };
  const reviewSwat = {
    swat_id: 'SWAT-TEST-REVIEW',
    title: 'Review test SWAT',
    stage: 'in_review',
    severity: 'medium',
    created_at_epoch_ms: 1,
  };

  await page.route('**/api/swats**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/swats/count') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 1 }),
      });
      return;
    }

    const stage = url.searchParams.get('stage');
    if (stage === 'in_review' && failInReview) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'mock malformed stage page' }),
      });
      return;
    }

    const swats = stage === 'open' ? [openSwat] : [reviewSwat];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ swats, count: swats.length }),
    });
  });

  await page.goto(TARGET_URL);
  await page.waitForFunction(() => (
    window.TaskBoard &&
    Array.isArray(window.TaskBoard.swats) &&
    window.TaskBoard.swats.length === 2
  ));

  failInReview = true;
  await page.evaluate(async () => {
    window.TaskBoard._swatsLoadedAt = 0;
    await window.TaskBoard.load();
    window.App.switchTab('taskboard');
  });

  await expect(page.locator('.swat-data-unavailable')).toContainText(
    'SWAT data unavailable: in_review stage incomplete. Showing last-known-good data.',
  );
  await expect(page.locator('.kanban-col.col-swats')).not.toContainText('No active SWATs');

  const state = await page.evaluate(() => ({
    ids: window.TaskBoard.swats.map((swat) => swat.swat_id),
    failedStage: window.TaskBoard.swatLoadError && window.TaskBoard.swatLoadError.stage,
  }));
  expect(state.ids).toEqual(['SWAT-TEST-OPEN', 'SWAT-TEST-REVIEW']);
  expect(state.failedStage).toBe('in_review');
});
