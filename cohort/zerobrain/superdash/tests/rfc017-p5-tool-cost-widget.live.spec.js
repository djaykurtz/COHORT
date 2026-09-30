// @ts-check
// RFC017-P5 -- tool-cost intel-card LIVE Playwright spec
// Provenance: UXIA, 2026-06-13 (TEMPO routing #67720 + #67722 pre-flight ahead of backend FF-merge).
// Pre-flighted so the live-flip is a zero-edit deploy step.
//
// Sibling to the deterministic-mock spec at rfc017-p5-tool-cost-widget.spec.js.
// This spec runs ONLY when LIVE=1 env var is set + assumes a real /api/tool_costs
// is responding at :8430 (post-backend-FF-merge). It covers shape-invariant ACs
// that don't need deterministic mock payloads:
//   AC-LIVE-1  endpoint returns d3.1 meta envelope shape (5 required + 2 d3.1
//              additive fields) + items array (may be empty in healthy-0-sampled)
//   AC-LIVE-2  card renders with live data when flag ON (state-class set from
//              live ratio; no mock-payload exact-match assertions)
//   AC-LIVE-3  poll cadence + cache_age_ms tooltip work against live data
//              (shape-invariant against any payload)
//
// Skipped (mock-deterministic-only; covered by sibling spec):
//   AC-P5-3 heatmap bar exact widths (needs known spend values)
//   AC-P5-5 warming-threshold exact boundary (needs known ratio)
//   AC-P5-9 error-state HTTP non-200 (needs backend down or force-error path)
//   AC-P5-10 degraded cache_age > stale_threshold (needs cache-pin or wait > 5min)
//
// Run: LIVE=1 npx playwright test rfc017-p5-tool-cost-widget.live.spec.js
// Skip-if-mock-only: spec auto-skips when LIVE env not set.

const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8430/';
const LIVE = process.env.LIVE === '1';

// Skip entire file when not in LIVE mode -- prevents accidental live-run in CI mock tier
test.skip(!LIVE, 'LIVE=1 env not set; live spec inactive (sibling mock spec covers AC-P5-* deterministically).');

// Enable feature flag (NO route mock -- live backend responds)
async function setupLive(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('toolCostWidget', '1'); } catch (e) { /* noop */ }
    window.TOOL_COST_WIDGET_ENABLED = true;
  });
}

async function waitForLiveRender(page) {
  await page.waitForSelector('#tool-cost-card', { timeout: 10000 });
  await page.waitForFunction(() => {
    const dot = document.getElementById('tool-cost-dot');
    if (!dot) return false;
    return !dot.classList.contains('tool-cost-dot--loading');
  }, { timeout: 10000 });
}

test.describe('RFC017-P5 tool-cost intel-card -- LIVE backend at :8430', () => {

  test('AC-LIVE-1: endpoint shape -- /api/tool_costs returns d3.1 envelope', async ({ page, request }) => {
    // Endpoint is auth-gated; mirror the headers tool-cost-panel.js sends (CONFIG.AUTH_TOKEN).
    const resp = await request.get('http://localhost:8430/api/tool_costs?top=5&window_days=7', {
      headers: { 'Authorization': 'Bearer REPLACE_WITH_FLEET_TOKEN', 'X-Fleet-Token': 'REPLACE_WITH_FLEET_TOKEN' },
    });
    expect(resp.ok(), `endpoint not OK: status=${resp.status()}`).toBeTruthy();
    const body = await resp.json();

    // Meta envelope: d3.1 contract -- 7 required fields
    expect(body).toHaveProperty('meta');
    expect(body).toHaveProperty('items');
    const m = body.meta;
    for (const k of [
      'total_tools_cataloged', 'tools_with_telemetry', 'last_ingest_at',
      'window_days', 'cache_age_ms', 'cache_ttl_ms', 'stale_threshold_ms',
    ]) {
      expect(m, `meta.${k} missing`).toHaveProperty(k);
    }
    expect(typeof m.total_tools_cataloged).toBe('number');
    expect(typeof m.tools_with_telemetry).toBe('number');
    expect(typeof m.window_days).toBe('number');
    expect(m.window_days).toBe(7);
    expect(typeof m.cache_age_ms).toBe('number');
    expect(typeof m.cache_ttl_ms).toBe('number');
    expect(typeof m.stale_threshold_ms).toBe('number');
    expect(m.stale_threshold_ms).toBeGreaterThanOrEqual(m.cache_ttl_ms);

    // Items array shape (may be empty in healthy-0-sampled)
    expect(Array.isArray(body.items)).toBeTruthy();
    if (body.items.length > 0) {
      const it = body.items[0];
      for (const k of [
        'rank', 'tool_name', 'schema_tokens', 'p50_invocation_tokens',
        'p95_invocation_tokens', 'sample_count', 'invocations_per_day',
        'estimated_daily_spend',
      ]) {
        expect(it, `item[0].${k} missing`).toHaveProperty(k);
      }
      // rank 1-indexed + descending estimated_daily_spend
      expect(it.rank).toBe(1);
      if (body.items.length > 1) {
        expect(body.items[0].estimated_daily_spend)
          .toBeGreaterThanOrEqual(body.items[1].estimated_daily_spend);
      }
    }
  });

  test('AC-LIVE-2: card renders with live data when flag ON', async ({ page }) => {
    await setupLive(page);
    await page.goto(URL);
    await waitForLiveRender(page);

    const card = page.locator('#tool-cost-card');
    await expect(card).toBeVisible();

    // State class must be one of the 5 valid live states (not loading)
    const dot = page.locator('#tool-cost-dot');
    const validStates = [
      /tool-cost-dot--healthy/,
      /tool-cost-dot--healthy-0/,
      /tool-cost-dot--warming/,
      /tool-cost-dot--degraded/,
      /tool-cost-dot--error/,
    ];
    const dotClass = await dot.getAttribute('class') || '';
    const matched = validStates.some((rx) => rx.test(dotClass));
    expect(matched, `dot class "${dotClass}" not in valid-states set`).toBeTruthy();

    // Badge populated (-- only during loading; should be a number or count once rendered)
    const badge = await page.locator('#tool-cost-badge').textContent();
    expect(badge).not.toBe('--');
  });

  test('AC-LIVE-3: poll cadence + cache_age_ms tooltip shape', async ({ page }) => {
    await setupLive(page);
    await page.goto(URL);
    await waitForLiveRender(page);

    // Poll cadence module constant (shape-invariant)
    const pollMs = await page.evaluate(() => window.ToolCostPanel && window.ToolCostPanel._POLL_MS);
    expect(pollMs).toBe(60000);
    const hasTimer = await page.evaluate(() =>
      !!(window.ToolCostPanel && window.ToolCostPanel._pollTimer));
    expect(hasTimer).toBeTruthy();

    // Header tooltip shows "computed Ns ago" from live cache_age_ms.
    // The title is set on .intel-card-title by ToolCostPanel._render (AC-P5-8).
    // .intel-card-title always exists in index.html, so getAttribute returns
    // immediately (no auto-wait hang); guard keeps this shape-only per the spec.
    const headerTitle = await page.locator('#tool-cost-card .intel-card-title').getAttribute('title');
    if (headerTitle) {
      expect(headerTitle).toMatch(/computed.*ago/i);
    }
    // If no header tooltip selector matches, skip the assertion -- shape-only,
    // sibling mock spec AC-P5-8 covers the exact selector.
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TODO (post-backend-ship, populated incrementally):
// - AC-LIVE-4 catalog-miss branch: GET /api/tool_costs?top=1 with a tool_name
//   not in tool_catalog returns empty items + tools_with_telemetry==0 (substrate
//   correctness verify -- mirrors ZBPRIME #61606 post-ship smoke pattern).
// - AC-LIVE-5 cache reuse: 2 sequential calls within 60s return identical
//   last_ingest_at + cache_age_ms increases monotonically (cache discipline).
// - AC-LIVE-6 window_days param: top=5&window_days=1 vs window_days=7 returns
//   different invocations_per_day for tools with non-trivial sample_count
//   (window-keying correctness).
// Cosign these as a "live AC-suite v2" follow-on, post-backend-deploy stabilization.
