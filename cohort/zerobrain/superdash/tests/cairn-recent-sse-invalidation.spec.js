// @ts-check
// P1 OPERATOR escalation 2026-06-06 (17th-repeat ACTIVE RFCs panel staleness).
// Asserts that an SSE cairn event (rfc_ratified) triggers a network refetch
// of /api/cairn/filter within 2s, instead of waiting for the 15s poll tick.
// Without this guarantee, the front-page #cairn-recent panel can stay stale
// for up to ~60s after backend cairn_ship. Fix lives in js/cairn-cache.js
// Layer 6 + js/sse.js _pollInterval=10000.
//
// Test strategy: load dashboard, observe network for /api/cairn/filter, then
// dispatch a synthetic SSE event via page.evaluate() and assert a refetch
// arrives within 2s (debounce is 500ms; FleetState.refresh adds ms overhead).

const { test, expect } = require('@playwright/test');

const DASHBOARD_URL = 'http://localhost:8430/';
const CAIRN_FILTER_ENDPOINT = '/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30';

test.describe('CairnRecent SSE-triggered refresh (P1 staleness fix)', () => {

  test('@smoke SSE cairn event forces /api/cairn/filter refetch within 2s', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await page.waitForLoadState('domcontentloaded');
    // Let initial subscribe + first fetch settle.
    await page.waitForTimeout(1500);

    // Count cairn-filter requests AFTER the initial subscribe-fetch settles.
    let refetchCount = 0;
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.pathname + u.search === CAIRN_FILTER_ENDPOINT) refetchCount++;
    });

    // Simulate SSE delivery of a cairn event. cairn-cache.js hooks
    // SSE.handleEvent and routes matching events through Layer 6's debounced
    // FleetState.refresh of CAIRN_RECENT_ENDPOINTS.
    await page.evaluate(() => {
      // @ts-ignore -- runtime objects only present in page context
      window.SSE.handleEvent({ event_type: 'rfc_ratified', rfc_id: 'RFC999', id: 999999 });
    });

    // Debounce is 500ms; allow generous slack.
    await page.waitForTimeout(2000);

    expect(refetchCount).toBeGreaterThanOrEqual(1);
  });

  test('@smoke SSE poll interval is tightened to 10s (was 45s)', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await page.waitForLoadState('domcontentloaded');
    const interval = await page.evaluate(() => {
      // @ts-ignore
      return (typeof window.SSE !== 'undefined' && window.SSE._pollInterval) || -1;
    });
    expect(interval).toBeGreaterThan(0);
    expect(interval).toBeLessThanOrEqual(15000);
  });

});
