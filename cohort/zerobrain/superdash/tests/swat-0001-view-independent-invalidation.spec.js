// @ts-check
// SWAT-20260604-0001 -- view-independent invalidation regression test.
//
// Asserts that an SSE cairn event clears in-component memoization
// (Cairn.kbData, Cairn.scratchData, Cairn.trailData, Cairn.forumCache,
// Cairn._kbCurrentArticle, CairnPanel._data) regardless of which view is
// currently active. The pre-fix code clamped these caches on the same
// view-state predicate as the DOM re-render, so a user looking at a
// non-Cairn tab would see stale data when navigating back. n=17.
//
// Parameterized across doc_types so the same scenario covers
// rfc/wave/solidplan, kb, and scratch invalidation paths.

const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8430/';

// Pre-fix repro: pre-populate every in-component memoization, fire a cairn
// event while the user is on a DIFFERENT tab, assert all caches are cleared.
const CASES = [
  {
    name: 'cairn rfc event clears trail+forum+panel memoization',
    event: { event_type: 'solidplan_attached', rfc_id: 'RFC-TEST-001' },
    seed: {
      'Cairn.trailData': { columns: { seed: [], rfc: [{ rfc_id: 'STALE' }] } },
      'Cairn.forumCache.RFC-TEST-001': { rfc_id: 'RFC-TEST-001', title: 'stale' },
      'Cairn.forumCache.RFC-OTHER': { rfc_id: 'RFC-OTHER', title: 'kept' },
      'CairnPanel._data': { results: [{ id: 'STALE' }] },
    },
    expectCleared: ['Cairn.trailData', 'Cairn.forumCache.RFC-TEST-001', 'CairnPanel._data'],
    expectKept: ['Cairn.forumCache.RFC-OTHER'],
  },
  {
    name: 'cairn rfc event without rfc_id broadly drops forumCache',
    event: { event_type: 'rfc_renamed' },
    seed: {
      'Cairn.trailData': { columns: { seed: [] } },
      'Cairn.forumCache.RFC-A': { rfc_id: 'RFC-A' },
      'Cairn.forumCache.RFC-B': { rfc_id: 'RFC-B' },
    },
    expectCleared: ['Cairn.trailData', 'Cairn.forumCache.RFC-A', 'Cairn.forumCache.RFC-B'],
    expectKept: [],
  },
  {
    name: 'kb event clears kbData + matching _kbCurrentArticle',
    event: { event_type: 'kb_published', slug: 'test-slug' },
    seed: {
      'Cairn.kbData': { results: [{ slug: 'test-slug' }] },
      'Cairn._kbCurrentArticle': { slug: 'test-slug', content: 'stale' },
    },
    expectCleared: ['Cairn.kbData', 'Cairn._kbCurrentArticle'],
    expectKept: [],
  },
  {
    name: 'kb event preserves _kbCurrentArticle for different slug',
    event: { event_type: 'kb_published', slug: 'other-slug' },
    seed: {
      'Cairn.kbData': { results: [] },
      'Cairn._kbCurrentArticle': { slug: 'test-slug', content: 'still-relevant' },
    },
    expectCleared: ['Cairn.kbData'],
    expectKept: ['Cairn._kbCurrentArticle'],
  },
  {
    name: 'scratch event clears scratchData',
    event: { event_type: 'scratch_created' },
    seed: {
      'Cairn.scratchData': { entries: [{ scratch_id: 'STALE' }] },
    },
    expectCleared: ['Cairn.scratchData'],
    expectKept: [],
  },
];

test.describe('SWAT-20260604-0001 view-independent invalidation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');
    // Wait for SSE hookSSE() to have wrapped SSE.handleEvent. The hook retries
    // every 500ms up to 20x, so 11s is the upper bound. Verify the wrap by
    // looking for the closure-captured `_origHandleEvent` reference in the
    // function source -- pre-wrap SSE.handleEvent is the original from sse.js
    // and does NOT contain that symbol.
    await page.waitForFunction(
      () => typeof SSE !== 'undefined' && SSE.handleEvent &&
            /_origHandleEvent/.test(SSE.handleEvent.toString()),
      { timeout: 12000 }
    );
  });

  for (const c of CASES) {
    test(`@smoke ${c.name}`, async ({ page }) => {
      const result = await page.evaluate(({ seed, event, expectCleared, expectKept }) => {
        // Ensure global Cairn/CairnPanel exist so the helpers can null fields without TDZ
        if (typeof Cairn === 'undefined') window.Cairn = {};
        if (typeof CairnPanel === 'undefined') window.CairnPanel = {};

        function setPath(path, value) {
          const parts = path.split('.');
          let cur = window;
          for (let i = 0; i < parts.length - 1; i++) {
            if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {};
            cur = cur[parts[i]];
          }
          cur[parts[parts.length - 1]] = value;
        }
        function getPath(path) {
          const parts = path.split('.');
          let cur = window;
          for (let i = 0; i < parts.length; i++) {
            if (cur === undefined || cur === null) return undefined;
            cur = cur[parts[i]];
          }
          return cur;
        }

        // Seed the in-component memoization
        Object.keys(seed).forEach((p) => setPath(p, seed[p]));

        // Force a non-Cairn view-state to exercise the view-INDEPENDENT property.
        // The pre-fix code would have skipped clearing because none of (drawer-open,
        // board-active, currentTab='cairn-panel') is true here.
        if (typeof App !== 'undefined') App.currentTab = 'notifications';
        if (typeof Cairn !== 'undefined') {
          Cairn.open = false;
          Cairn.activeTab = 'notifications';
          Cairn.view = null;
        }

        // Fire the synthetic SSE event
        SSE.handleEvent(event);

        // Assert
        const cleared = expectCleared.map((p) => {
          const v = getPath(p);
          return { path: p, cleared: v === null || v === undefined };
        });
        const kept = expectKept.map((p) => {
          const v = getPath(p);
          return { path: p, kept: v !== null && v !== undefined };
        });
        return { cleared, kept };
      }, c);

      for (const r of result.cleared) {
        expect(r.cleared, `expected ${r.path} to be cleared`).toBe(true);
      }
      for (const r of result.kept) {
        expect(r.kept, `expected ${r.path} to be kept`).toBe(true);
      }
    });
  }
});
