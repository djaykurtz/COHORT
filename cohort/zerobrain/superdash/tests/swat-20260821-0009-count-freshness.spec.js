// SWAT-20260821-0009: Superdash SWAT counts didn't reconcile with a raw
// coordinator-list_swats query. Root cause: (1) the badge/counts refresh used
// the same 30s cadence as the heavier SWAT-list fetch, so a high-velocity
// filing/review burst could leave the displayed numbers stale by double
// digits at the exact moment someone compared them against a live query;
// (2) the 'fixed' (fix landed, awaiting close) stage is deliberately excluded
// from the "active" board total (see api.js getSwats' documented rationale),
// but that exclusion was silent -- nothing on the board told OPERATOR that a
// raw "84 total unclosed" query and Superdash's "49 active" figure were BOTH
// correct, just counting different things.
//
// Fix: (1) SWAT_COUNTS_MAX_AGE_MS (5s) is now a much tighter, independent
// refresh window than SWAT_MAX_AGE_MS (30s, still used for the heavier list
// fetch) for the cheap authoritative COUNT(*) calls; (2) the 'fixed' count is
// now fetched (SWAT_HYGIENE_STAGES) and surfaced explicitly on the
// top-of-board badge, not silently dropped.
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

test('SWAT_COUNTS_MAX_AGE_MS is materially tighter than the 30s list/badge cadence', async ({ page }) => {
  await page.goto(TARGET_URL);
  await page.waitForFunction(() => window.TaskBoard);
  const ages = await page.evaluate(() => ({
    listMaxAge: window.TaskBoard.SWAT_MAX_AGE_MS,
    countsMaxAge: window.TaskBoard.SWAT_COUNTS_MAX_AGE_MS,
  }));
  expect(ages.countsMaxAge).toBeLessThan(ages.listMaxAge);
  // 5s bound: cheap enough to poll frequently without adding real load (the
  // endpoint is an unbounded COUNT(*), not a page fetch), tight enough that
  // a high-velocity SWAT-filing burst can't silently drift the badge by
  // double digits before someone compares it against a live query.
  expect(ages.countsMaxAge).toBeLessThanOrEqual(5000);
});

test('fixed-stage count is fetched and surfaced on the badge, not silently dropped', async ({ page }) => {
  let sawFixedCountRequest = false;
  await page.route('**/api/swats/count**', async (route) => {
    const url = new URL(route.request().url());
    const stage = url.searchParams.get('stage') || url.searchParams.get('status');
    if (stage === 'fixed') {
      sawFixedCountRequest = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 43 }),
      });
      return;
    }
    const counts = { open: 25, in_review: 9 };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: counts[stage] || 0 }),
    });
  });
  await page.route('**/api/swats?stage=**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ swats: [], count: 0 }),
    });
  });

  await page.goto(TARGET_URL);
  await page.waitForFunction(() => (
    window.TaskBoard &&
    window.TaskBoard.swatCounts &&
    typeof window.TaskBoard.swatCounts.fixed === 'number'
  ));

  expect(sawFixedCountRequest).toBe(true);

  const badgeText = await page.evaluate(() => {
    var el = document.getElementById('main-panel-badge');
    return el ? el.textContent : null;
  });
  expect(badgeText).toContain('43 fixed');
  // The 'fixed' count must NOT be folded into the active SWAT sum -- it's an
  // additional, separately-labeled figure, not a replacement for the
  // open+in_review total.
  expect(badgeText).toMatch(/34 SWATs?/);
});

test('SWAT_COUNT_STAGES (the active-board sum) is unchanged by the fixed-stage addition', async ({ page }) => {
  await page.goto(TARGET_URL);
  await page.waitForFunction(() => window.TaskBoard);
  const stages = await page.evaluate(() => window.TaskBoard.SWAT_COUNT_STAGES.slice());
  expect(stages).toEqual(['open', 'in_review']);
  const hygieneStages = await page.evaluate(() => window.TaskBoard.SWAT_HYGIENE_STAGES.slice());
  expect(hygieneStages).toEqual(['fixed']);
});
