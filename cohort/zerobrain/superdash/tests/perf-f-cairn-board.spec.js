// @ts-check
// Targeted regression test for SWAT-superdash-perf-F: renderDetail() textarea
// + scroll preservation across a forced live re-render. Not part of the
// shared smoke.spec.js suite (which requires live coordinator data) -- this
// test synthesizes the exact bug condition directly via Cairn.renderDetail()
// re-invocation, independent of coordinator/SSE availability.
const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8433/';

test.describe('superdash-v2 cairn-board perf-F regression', () => {
  test('@perf-f renderDetail preserves unsaved note textarea text + cursor across a forced re-render', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.Cairn !== 'undefined', { timeout: 5000 });

    const fakeRfc = {
      rfc_id: 'RFC999-perf-f-test',
      title: 'perf-F regression fixture',
      status: 'ratified',
      author_id: 'UXIA',
      operator_notes: [],
      waves: [],
      votes: {},
    };

    // First render: establishes the textarea + some scroll.
    await page.evaluate((rfc) => { window.Cairn.renderDetail(rfc); }, fakeRfc);
    await page.waitForSelector('#cairn-note-text', { timeout: 5000 });

    // Type unsaved text and focus the textarea, mid-composition.
    await page.fill('#cairn-note-text', 'unsaved commentary in progress');
    await page.focus('#cairn-note-text');
    await page.evaluate(() => {
      var el = document.getElementById('cairn-note-text');
      el.setSelectionRange(5, 5);
    });

    // Simulate a live SSE-driven re-render of the SAME rfc (the exact path
    // cairn-cache.js's Layer 5 courtesy refresh takes: Cairn.renderDetail(rfc)
    // called again while the user has this RFC open).
    await page.evaluate((rfc) => { window.Cairn.renderDetail(rfc); }, fakeRfc);

    const preserved = await page.evaluate(() => {
      var el = document.getElementById('cairn-note-text');
      return el ? el.value : null;
    });
    expect(preserved, 'unsaved note text must survive a live re-render').toBe('unsaved commentary in progress');

    expect(errors, `pageerror(s) during renderDetail cycle: ${errors.join(' | ')}`).toEqual([]);
  });

  test('@perf-f renderBoard dirty-check skips DOM rebuild when content is unchanged', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.Cairn !== 'undefined', { timeout: 5000 });

    // Seed minimal trail data so renderBoard() has something to render.
    await page.evaluate(() => {
      window.Cairn.trailData = window.Cairn.normalizeTrail({
        columns: { ideation: [], in_round: [], ratified: [] },
        seeds: [], shipped: []
      });
      window.Cairn.statusFilter = null;
      window.Cairn.renderBoard();
    });

    const bodyBefore = await page.evaluate(() => document.getElementById('cairn-body').innerHTML);

    // Mark the DOM with a sentinel attribute -- if renderBoard() does a real
    // innerHTML replace, this sentinel is destroyed; if the dirty-check
    // correctly skips the rebuild (identical trailData), the sentinel survives.
    await page.evaluate(() => {
      document.getElementById('cairn-body').setAttribute('data-perf-f-sentinel', '1');
    });

    // Re-render with IDENTICAL data -- dirty-check should skip the rebuild.
    await page.evaluate(() => { window.Cairn.renderBoard(); });

    const sentinelSurvived = await page.evaluate(() =>
      document.getElementById('cairn-body').getAttribute('data-perf-f-sentinel') === '1'
    );
    expect(sentinelSurvived, 'dirty-check should have skipped the rebuild for identical content').toBe(true);

    const bodyAfter = await page.evaluate(() => document.getElementById('cairn-body').innerHTML);
    expect(bodyAfter).toBe(bodyBefore);
  });
});
