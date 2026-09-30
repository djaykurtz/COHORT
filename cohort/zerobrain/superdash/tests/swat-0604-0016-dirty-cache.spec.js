// @ts-check
// SWAT-20260604-0016: Playwright dirty-cache acceptance gate (v1, localStorage SWR layer)
//
// Purpose: prove that the dashboard's stale-while-revalidate (SWR) contract is
// wired correctly so that a poisoned client-side cache cannot indefinitely
// hide fresh deploys/data from OPERATOR's browser. This is the prevention
// layer for the 17-time "shipped but invisible" failure family.
//
// v1 scope (this file): localStorage SWR cache layer (api-resilience.js).
// Deferred to v2/v3:
//   - IndexedDB cache layer (cairn-cache.js)
//   - Service Worker cache (sw.js — currently disabled on plain HTTP per
//     QUATTRO arch note, so SW path is dormant; revisit when SW re-enabled)
//
// Wiring: tagged @swat-0604-0016 (NOT @smoke — too slow for the 5s smoke
// gate; intended as a separate npm script test:dirty-cache invoked on
// PRs that touch superdash-v2 or as a nightly fail-closed gate).
//
// Refs: SWAT-20260604-0016 body, SWAT-20260604-0017 (sibling deploy-gap fix),
// js/api-resilience.js (the SWR layer being exercised), KB cairn-ui-sync-contract.

const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8430/';
const CACHE_PREFIX = 'zb_cache_';
const META_PREFIX = 'zb_meta_';

// A sentinel node_id that should NEVER appear in a fresh /api/fleet response.
// Stamped with the test timestamp so parallel-runner shards don't collide.
function makeSentinelNodeId() {
  return 'STALE-SENTINEL-' + Date.now();
}

// Seed a stale-but-meta-valid SWR cache entry BEFORE the page scripts run.
// addInitScript runs in the document context after navigation but before
// any other scripts — perfect for poisoning localStorage pre-boot.
async function seedStaleFleetCache(page, sentinelNodeId) {
  await page.addInitScript(({ sentinel, cachePrefix, metaPrefix }) => {
    const stalePayload = {
      nodes: [{
        node_id: sentinel,
        status: 'idle',
        role: 'analyst',
        last_seen: new Date().toISOString(),
      }],
      _injected_by: 'swat-0604-0016-dirty-cache-spec',
    };
    try {
      localStorage.setItem(cachePrefix + '/api/fleet', JSON.stringify(stalePayload));
      // Seed meta with t in the deep past so isStale() trips on first read.
      // /api/fleet TTL is 30s; back-date 1 hour to be unambiguously stale.
      localStorage.setItem(metaPrefix + '/api/fleet', JSON.stringify({
        t: Date.now() - (60 * 60 * 1000),
        ttl: 30000,
      }));
    } catch (e) {
      // localStorage may be quota-limited in some test envs; soft-fail.
      console.warn('[swat-0604-0016] seed failed:', e);
    }
  }, { sentinel: sentinelNodeId, cachePrefix: CACHE_PREFIX, metaPrefix: META_PREFIX });
}

test.describe('SWAT-20260604-0016 dirty-cache acceptance gate', () => {

  test('@swat-0604-0016 localStorage SWR: stale fleet cache is overwritten by a fresh fetch (write-back contract)', async ({ page }) => {
    const sentinel = makeSentinelNodeId();

    await seedStaleFleetCache(page, sentinel);
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');

    // Confirm the seed actually landed and is readable in-page (debug aid;
    // also catches the case where addInitScript silently failed).
    const seedRead = await page.evaluate((key) => {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }, CACHE_PREFIX + '/api/fleet');
    expect(seedRead, 'addInitScript should have seeded zb_cache_/api/fleet').not.toBeNull();
    expect(seedRead || '').toContain(sentinel);

    // Explicitly trigger the wrapped fetch from page context. This isolates
    // the SWR layer's write-back contract from whether any specific panel
    // happens to poll /api/fleet on load (panel-poll wiring is a separate
    // concern; tested via @smoke surfaces). We only assert: when /api/fleet
    // is fetched via the resilience-wrapped API, the response REPLACES the
    // stale cache.
    //
    // Returns true if the SWR layer is reachable; false if API global is
    // not yet bound (early-boot timing) so we can fail loudly with context.
    const fetchTriggered = await page.evaluate(async () => {
      // Wait briefly for boot to bind the wrapped API.get.
      for (let i = 0; i < 40; i++) {
        if (typeof API !== 'undefined' && API && typeof API.get === 'function') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (typeof API === 'undefined' || !API || typeof API.get !== 'function') {
        return false;
      }
      try {
        await API.get('/api/fleet');
        return true;
      } catch (e) {
        return 'fetch_error:' + (e && e.message ? e.message : String(e));
      }
    });
    expect(fetchTriggered, 'API.get (wrapped by api-resilience) should be reachable').toBe(true);

    // After the explicit fetch resolves, the cache must no longer contain
    // the sentinel. Brief poll (write-back is sync inside writeCache but
    // SWR may stage it after the promise resolves; 5s ceiling is generous).
    await expect.poll(async () => {
      return await page.evaluate((key) => {
        try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
      }, CACHE_PREFIX + '/api/fleet');
    }, {
      message: 'stale sentinel should be evicted from localStorage cache after explicit API.get (SWR write-back contract)',
      timeout: 5000,
      intervals: [250, 500, 1000],
    }).not.toContain(sentinel);
  });

  test('@swat-0604-0016 localStorage SWR: cache meta TTL is honored (no infinite-life stale)', async ({ page }) => {
    // Guard against accidental TTL bypass: if a stale meta is far in the
    // past (beyond TTL), the SWR layer must treat the cache as cold and
    // refetch immediately rather than serving expired data. This is a
    // structural invariant test, not a render-correctness test.
    const sentinel = makeSentinelNodeId();
    await page.addInitScript(({ sentinel, cachePrefix, metaPrefix }) => {
      try {
        localStorage.setItem(cachePrefix + '/api/fleet', JSON.stringify({
          nodes: [{ node_id: sentinel }],
          _injected_by: 'swat-0604-0016-expired-meta',
        }));
        localStorage.setItem(metaPrefix + '/api/fleet', JSON.stringify({
          t: Date.now() - (24 * 60 * 60 * 1000), // 24h old, well past 30s TTL
          ttl: 30000,
        }));
      } catch (e) {}
    }, { sentinel, cachePrefix: CACHE_PREFIX, metaPrefix: META_PREFIX });

    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');

    // With an expired meta, the SWR layer SHOULD treat this as cold-cache
    // and fetch fresh on first call — sentinel should be gone quickly.
    await expect.poll(async () => {
      return await page.evaluate((key) => {
        try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
      }, CACHE_PREFIX + '/api/fleet');
    }, {
      message: 'expired-meta cache should be cold-refetched (sentinel evicted) within 10s',
      timeout: 10000,
      intervals: [500, 1000],
    }).not.toContain(sentinel);
  });

});
