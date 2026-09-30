// @ts-check
// RFC017-P5 -- tool-cost intel-card Playwright spec (10 ACs against d3.1 contract)
//
// Provenance: UXIA, 2026-06-12 (TEMPO routing #64970 -- analyst-lane spec-author,
// endpoint impl re-routed to ZBPRIME). Tests the SHIPPED render-side widget at
// js/tool-cost-panel.js + css/tool-cost-panel.css + index.html#tool-cost-card
// against the d3.1-cosigned contract (06111516UXIA-RFC017-P5d31amendment-QUATTRO6,
// 4-axis quorum DRAGON+QUATTRO+NIMBUS+UXIA).
//
// Contract under test (d3 base 2 + d3.1 5-tier amendment):
//   GET /api/tool_costs?top=N&window_days=D -> {
//     meta: { total_tools_cataloged, tools_with_telemetry, last_ingest_at,
//             window_days, cache_age_ms, cache_ttl_ms, stale_threshold_ms },
//     items: [{ rank, tool_name, schema_tokens, p50_invocation_tokens,
//               p95_invocation_tokens, sample_count, invocations_per_day,
//               estimated_daily_spend }, ... ]
//   }
//
// Each test mocks /api/tool_costs via page.route() so the spec is endpoint-
// independent and lights up the moment ZBPRIME's wrapper lands at :8420 (no
// further test edits required to flip from mock→live).
//
// Feature-flag gate: tool-cost-panel.js requires localStorage.toolCostWidget=1
// OR window.TOOL_COST_WIDGET_ENABLED=true. Each test enables via initScript.
//
// AC coverage (10 ACs per d3 7 + d3.1 AC-P5-10):
//   AC-P5-1a card VISIBLE by default (RFC017-P5 AC18 default-ON via config.js)
//   AC-P5-1b card hidden when flag force-disabled (gate still honored)
//   AC-P5-2  expanded card shows top-N rows from /api/tool_costs
//   AC-P5-3  heatmap bar width proportional to estimated_daily_spend
//   AC-P5-4  healthy-0-sampled state (tools_with_telemetry == 0)
//   AC-P5-5  warming-up state + banner (0 < ratio < 0.20)
//   AC-P5-6  badge shows top1 daily-spend rounded to k
//   AC-P5-7  60s poll cadence (module constant _POLL_MS)
//   AC-P5-8  header tooltip shows "computed Ns ago" from cache_age_ms
//   AC-P5-9  error-state (HTTP non-200) -- red dot + banner + retry button
//   AC-P5-10 degraded-state (cache_age_ms > stale_threshold_ms) -- yellow dot,
//            banner, table STILL VISIBLE (SOFT degradation per d3.1)

const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8430/';

// ── Shared mock-payload builders ────────────────────────────────────────────
function buildNormalPayload(opts = {}) {
  const top = opts.top || 5;
  const items = [];
  for (let i = 0; i < top; i++) {
    items.push({
      rank: i + 1,
      tool_name: 'mock_tool_' + (i + 1),
      schema_tokens: 100 + i * 10,
      p50_invocation_tokens: 500 - i * 50,
      p95_invocation_tokens: 5000 - i * 500,
      sample_count: 200 - i * 20,
      invocations_per_day: 100 - i * 10,
      estimated_daily_spend: 60000 - i * 10000, // descending so rank=1 is largest
    });
  }
  return {
    meta: {
      total_tools_cataloged: opts.total ?? 142,
      tools_with_telemetry: opts.sampled ?? 38,
      last_ingest_at: '2026-06-12T11:30:00Z',
      window_days: 7,
      cache_age_ms: opts.cache_age_ms ?? 1840,
      cache_ttl_ms: opts.cache_ttl_ms ?? 60000,
      stale_threshold_ms: opts.stale_threshold_ms ?? 300000,
    },
    items,
  };
}

// Enable feature flag + install /api/tool_costs route mock for every test
async function setupMock(page, payload, status = 200) {
  await page.addInitScript(() => {
    try { localStorage.setItem('toolCostWidget', '1'); } catch (e) { /* noop */ }
    window.TOOL_COST_WIDGET_ENABLED = true;
  });
  await page.route('**/api/tool_costs**', async (route) => {
    if (status !== 200) {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'mock failure' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

// Wait for the tool-cost card to become visible AND for ToolCostPanel to
// have completed its first fetch (state-class on dot).
async function waitForRender(page) {
  await page.waitForSelector('#tool-cost-card', { timeout: 5000 });
  await page.waitForFunction(() => {
    const dot = document.getElementById('tool-cost-dot');
    if (!dot) return false;
    // Initial loading class is replaced once _render() runs post-fetch
    return !dot.classList.contains('tool-cost-dot--loading');
  }, { timeout: 5000 });
}

// ────────────────────────────────────────────────────────────────────────────
test.describe('RFC017-P5 tool-cost intel-card', () => {

  // ── AC-P5-1a (RFC017-P5 AC18: default-ON) ──
  test('AC-P5-1a: card VISIBLE by default (AC18 default-ON via config.js, no in-test flag)', async ({ page }) => {
    // Do NOT enable the flag in-test -- rely on the served config.js default
    // (window.TOOL_COST_WIDGET_ENABLED = true). Mock only the endpoint so the
    // render completes deterministically. This proves the AC18 enablement flip.
    await page.route('**/api/tool_costs**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNormalPayload({ top: 3 })),
      });
    });
    await page.goto(URL);
    await waitForRender(page);
    await expect(page.locator('#tool-cost-card')).toBeVisible();
    await expect(page.locator('#tool-cost-body table.tool-cost-table tbody tr')).toHaveCount(3);
  });

  // ── AC-P5-1b (gate still honored: force-OFF hides) ──
  test('AC-P5-1b: card hidden when flag force-disabled (gate still honored)', async ({ page }) => {
    // Override the served config.js default-ON by routing config.js to a flag-OFF
    // variant; with no localStorage opt-in, isEnabled() must return false -> hidden.
    await page.route('**/js/config.js**', async (route) => {
      const resp = await route.fetch();
      const body = (await resp.text()).replace(
        'window.TOOL_COST_WIDGET_ENABLED = true;',
        'window.TOOL_COST_WIDGET_ENABLED = false;',
      );
      await route.fulfill({ response: resp, body, contentType: 'application/javascript' });
    });
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.ToolCostPanel !== 'undefined', { timeout: 5000 });
    await page.waitForTimeout(200);
    await expect(page.locator('#tool-cost-card')).toBeHidden();
  });

  // ── AC-P5-2 ──
  test('AC-P5-2: card visible + shows top-N rows from /api/tool_costs when flag ON', async ({ page }) => {
    await setupMock(page, buildNormalPayload({ top: 5 }));
    await page.goto(URL);
    await waitForRender(page);
    const card = page.locator('#tool-cost-card');
    await expect(card).toBeVisible();
    const rows = page.locator('#tool-cost-body table.tool-cost-table tbody tr');
    await expect(rows).toHaveCount(5);
    // First row should show rank 1 + tool name + spend
    await expect(rows.nth(0).locator('.tc-rank')).toHaveText('1');
    await expect(rows.nth(0).locator('.tc-tool')).toHaveText('mock_tool_1');
  });

  // ── AC-P5-3 ──
  test('AC-P5-3: heatmap bar width proportional to estimated_daily_spend', async ({ page }) => {
    await setupMock(page, buildNormalPayload({ top: 3 }));
    await page.goto(URL);
    await waitForRender(page);
    const bars = page.locator('#tool-cost-body .tc-spend-bar');
    await expect(bars).toHaveCount(3);
    // Rank 1 spend=60000 -> 100%; rank 2 spend=50000 -> ~83%; rank 3 spend=40000 -> ~67%
    const w1 = await bars.nth(0).evaluate((el) => parseFloat(el.style.width));
    const w2 = await bars.nth(1).evaluate((el) => parseFloat(el.style.width));
    const w3 = await bars.nth(2).evaluate((el) => parseFloat(el.style.width));
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
    expect(w1).toBeGreaterThanOrEqual(95);
    expect(w1).toBeLessThanOrEqual(100);
  });

  // ── AC-P5-4 ──
  test('AC-P5-4: healthy-0-sampled state when tools_with_telemetry==0', async ({ page }) => {
    await setupMock(page, buildNormalPayload({ top: 0, sampled: 0, total: 142 }));
    await page.goto(URL);
    await waitForRender(page);
    const dot = page.locator('#tool-cost-dot');
    await expect(dot).toHaveClass(/tool-cost-dot--healthy-0/);
    // No table when 0-sampled
    await expect(page.locator('#tool-cost-body table.tool-cost-table')).toHaveCount(0);
    // Message present
    await expect(page.locator('#tool-cost-body .tool-cost-message')).toContainText(/not yet collected|activates/i);
    // Badge = "0"
    await expect(page.locator('#tool-cost-badge')).toHaveText('0');
  });

  // ── AC-P5-5 ──
  test('AC-P5-5: warming-up state + banner when 0 < ratio < 0.20', async ({ page }) => {
    // 10/142 = 0.07 -- warming-up zone
    await setupMock(page, buildNormalPayload({ top: 3, sampled: 10, total: 142 }));
    await page.goto(URL);
    await waitForRender(page);
    const dot = page.locator('#tool-cost-dot');
    await expect(dot).toHaveClass(/tool-cost-dot--warming/);
    // Banner visible + table also visible (warming shows both)
    const banner = page.locator('#tool-cost-body .tool-cost-banner--warming');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/warming up.*10\s*\/\s*142/i);
    await expect(page.locator('#tool-cost-body table.tool-cost-table tbody tr')).toHaveCount(3);
  });

  // ── AC-P5-6 ──
  test('AC-P5-6: badge shows top1 daily-spend rounded to k', async ({ page }) => {
    // top1 spend = 60000 -> "60k"
    await setupMock(page, buildNormalPayload({ top: 3 }));
    await page.goto(URL);
    await waitForRender(page);
    const badge = page.locator('#tool-cost-badge');
    await expect(badge).toHaveText(/^\d+k$/);
    // 60000 -> 60k (the _fmtK helper returns toFixed(0) for n >= 10000, no decimal)
    await expect(badge).toHaveText('60k');
  });

  // ── AC-P5-7 ──
  test('AC-P5-7: poll cadence is 60s (ToolCostPanel._POLL_MS)', async ({ page }) => {
    await setupMock(page, buildNormalPayload({ top: 1 }));
    await page.goto(URL);
    await waitForRender(page);
    const pollMs = await page.evaluate(() => window.ToolCostPanel && window.ToolCostPanel._POLL_MS);
    expect(pollMs).toBe(60000);
    // Sanity: poll timer is active
    const hasTimer = await page.evaluate(() => !!(window.ToolCostPanel && window.ToolCostPanel._pollTimer));
    expect(hasTimer).toBe(true);
  });

  // ── AC-P5-8 ──
  test('AC-P5-8: header tooltip shows "computed Ns ago" from cache_age_ms', async ({ page }) => {
    // cache_age_ms = 12340 -> "computed 12s ago"
    await setupMock(page, buildNormalPayload({ top: 1, cache_age_ms: 12340 }));
    await page.goto(URL);
    await waitForRender(page);
    const title = page.locator('#tool-cost-card .intel-card-title');
    const tip = await title.getAttribute('title');
    expect(tip).toMatch(/computed\s+12s\s+ago/i);
    expect(tip).toMatch(/cache ttl\s+60s/i);
  });

  // ── AC-P5-9 ──
  test('AC-P5-9: error-state when HTTP non-200 -- red dot + retry button + banner', async ({ page }) => {
    await setupMock(page, null, 503);
    await page.goto(URL);
    await waitForRender(page);
    const dot = page.locator('#tool-cost-dot');
    await expect(dot).toHaveClass(/tool-cost-dot--error/);
    const banner = page.locator('#tool-cost-body .tool-cost-banner--error');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/FETCH FAILED/i);
    // Retry button is clickable
    const retry = page.locator('#tool-cost-body .tool-cost-retry');
    await expect(retry).toBeVisible();
    // No table on hard-error
    await expect(page.locator('#tool-cost-body table.tool-cost-table')).toHaveCount(0);
    // Badge = "ERR"
    await expect(page.locator('#tool-cost-badge')).toHaveText('ERR');
  });

  // ── AC-P5-10 (d3.1 amendment) ──
  test('AC-P5-10: degraded-state when cache_age_ms > stale_threshold_ms -- yellow dot, banner, table STILL VISIBLE', async ({ page }) => {
    // cache_age_ms=400000 > stale_threshold_ms=300000 -- DEGRADED (SOFT)
    await setupMock(page, buildNormalPayload({
      top: 3,
      cache_age_ms: 400000,
      stale_threshold_ms: 300000,
      cache_ttl_ms: 60000,
    }));
    await page.goto(URL);
    await waitForRender(page);
    const dot = page.locator('#tool-cost-dot');
    await expect(dot).toHaveClass(/tool-cost-dot--degraded/);
    const banner = page.locator('#tool-cost-body .tool-cost-banner--degraded');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/stale.*cache age\s+400s.*threshold\s+300s/i);
    // CRITICAL d3.1 semantic: table REMAINS VISIBLE under degraded (SOFT, not HARD)
    await expect(page.locator('#tool-cost-body table.tool-cost-table tbody tr')).toHaveCount(3);
  });

});
