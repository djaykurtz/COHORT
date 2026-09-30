/* ZEROBRAIN Superdash v2 -- Service Worker (4c-r4)
 *
 * Provides offline-capable superdash via:
 *   1. Precache: all static assets (HTML, CSS, JS) on install
 *   2. Network-first for static assets w/ cache fallback (freshness over speed)
 *   3. Network-first for API calls with Cache API fallback
 *   4. SSE/EventSource passthrough (never cached)
 *   5. Versioned cache with automatic cleanup on activate
 *   6. Message channel for manual cache operations from the page
 *
 * r4 change (UXIA, 2026-06-04, OPERATOR P1): static assets were cache-first.
 * That made any JS/HTML/CSS change invisible to OPERATOR until CACHE_VERSION
 * bumped + SW activated + reload. 17-repeat "shipped but invisible" pattern.
 * Now network-first w/ cache fallback -- mirrors the API strategy.
 * Cache still seeded by precache so first load is fast and offline works.
 *
 * Complements R1 (localStorage retry) and R2 (IndexedDB CAIRN cache)
 * by providing the outermost layer of resilience at the network level.
 */

var CACHE_VERSION = 'zb-superdash-portfolio-v1';
var API_CACHE = 'zb-api-v1';
// SWAT-candidate finding K (superdash resource-efficiency pass, 2026-08):
// this list had drifted to cover only 26 of the 52 scripts + 5 of the 20
// stylesheets actually referenced by index.html (machine-verified via diff
// against index.html's own <script src>/<link href> tags -- see scratch
// 08130708ZBPRIME-superdash-efficiency-findings- finding #10). A stale
// precache list silently breaks BOTH stated goals of this file's own header
// comment: "first load is fast" and "offline works" -- neither is true for
// any asset missing below until a live network fetch populates the
// network-first cache-fallback path on first visit. Regenerated below to
// mirror index.html exactly; keep this list in sync whenever a new
// <script>/<link> tag is added to index.html (ideally via a build-time
// generator in a future pass -- see finding #10's FIX note -- but manual
// sync is the safe fix today).
var PRECACHE_ASSETS = [
  './',
  './index.html',
  './marked.min.js',
  './css/base.css',
  './css/components.css',
  './css/cairn.css',
  './css/responsive.css',
  './css/messaging.css',
  './css/scratch-threads.css',
  './css/scratch-limits.css',
  './css/bus-panel.css',
  './css/recovery-panel.css',
  './css/fleet-sections.css',
  './css/merit.css',
  './css/corrections.css',
  './css/overrides.css',
  './css/chat.css',
  './css/tool-cost-panel.css',
  './css/resilience-card.css',
  './css/failure-episodes.css',
  './css/deploy-pending-banner.css',
  './css/electric-border.css',
  './css/gary-panel.css',
  './js/config.js',
  './js/api.js',
  './js/datastore.js',
  './js/components.js',
  './js/api-resilience.js',
  './js/notify.js',
  './js/notifications-panel.js',
  './js/nodes.js',
  './js/panels.js',
  './js/messages.js',
  './js/docs.js',
  './js/scripts.js',
  './js/broadcast.js',
  './js/motd.js',
  './js/messaging.js',
  './js/taskboard.js',
  './js/layout-resizer.js',
  './js/guestbook.js',
  './js/cairn-panel.js',
  './js/images.js',
  './js/files-panel.js',
  './js/cairn.js',
  './js/cairn-board.js',
  './js/cairn-scratch.js',
  './js/scratch-threads.js',
  './js/scratch-limits.js',
  './js/cairn-kb.js',
  './js/cairn-search.js',
  './js/cairn-cache.js',
  './js/approval-throughline.js',
  './js/cairn-recent.js',
  './js/bus-panel.js',
  './js/recovery-status-panel.js',
  './js/gary-panel.js',
  './js/tool-cost-panel.js',
  './js/resilience-incidents.js',
  './js/resilience-card.js',
  './js/failure-episodes.js',
  './js/fleet-sections.js',
  './js/merit.js',
  './js/boomerang.js',
  './js/tool-failures.js',
  './js/corrections.js',
  './js/deploy.js',
  './js/deploy-pending-banner.js',
  './js/feedback.js',
  './js/sse.js',
  './js/boot-loader.js',
  './js/review-pipeline.js',
  './js/app.js',
  './js/perf-guard.js',
  './js/version-stamp.js'
];


/* ── Install: precache static assets ──────────────────────── */

self.addEventListener('install', function(event) {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(cache) {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(function() {
        console.log('[SW] Precache complete');
        return self.skipWaiting();
      })
      .catch(function(err) {
        console.warn('[SW] Precache partial failure:', err.message);
        return self.skipWaiting();
      })
  );
});


/* ── Activate: clean old caches, claim clients ────────────── */

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(
          names.filter(function(name) {
            return name !== CACHE_VERSION && name !== API_CACHE;
          }).map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});


/* ── Fetch: route by request type ─────────────────────────── */

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip: non-GET, chrome-extension, SSE/EventSource streams
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.pathname === '/api/events') return;
  if (url.pathname.indexOf('/api/stream') === 0) return;

  // API calls: network-first with Cache API fallback
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(networkFirstAPI(event.request, url));
    return;
  }

  // Static assets: network-first w/ cache fallback (same-origin only)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstStatic(event.request));
    return;
  }
});


/* ── Strategy: network-first for static assets (r4) ───────── */
/* Tries network with a short timeout. On success, updates cache + returns.
 * On failure (offline/slow), falls back to cached copy. On no-cache + offline,
 * returns precached index.html for HTML requests, else 503.
 *
 * Replaces prior cache-first to fix the "shipped-but-invisible" staleness
 * problem (UXIA 2026-06-04, OPERATOR P1). Precache still seeds cache on
 * install so first load and offline use both still work.
 */

var STATIC_NET_TIMEOUT_MS = 3000;

function networkFirstStatic(request) {
  return caches.open(CACHE_VERSION).then(function(cache) {
    var netPromise = fetch(request).then(function(response) {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    });

    // Race network against a timeout; if timeout wins and cache has it, serve cache.
    var timeoutPromise = new Promise(function(resolve) {
      setTimeout(function() { resolve(null); }, STATIC_NET_TIMEOUT_MS);
    });

    return Promise.race([netPromise.catch(function() { return null; }), timeoutPromise])
      .then(function(winner) {
        if (winner) return winner;
        // Network too slow or failed within timeout -- serve cache if we have it
        return cache.match(request).then(function(cached) {
          if (cached) {
            // Let network keep going in background to refresh cache
            netPromise.catch(function() {});
            return cached;
          }
          // No cache -- wait for network (may still be in flight)
          return netPromise.catch(function() {
            if (request.headers.get('accept') &&
                request.headers.get('accept').indexOf('text/html') !== -1) {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503, statusText: 'Offline' });
          });
        });
      });
  });
}


/* ── Strategy: cache-first (LEGACY, kept for reference) ───── */
/* No longer in the fetch path. Restored if you ever want pure cache-first
 * for a specific asset class -- but be aware of the OPERATOR P1 lesson:
 * cache-first + version-bump-on-deploy is a stale-screen footgun for an
 * actively-developed dashboard.
 */

function cacheFirst(request) {
  return caches.open(CACHE_VERSION)
    .then(function(cache) {
      return cache.match(request)
        .then(function(cached) {
          if (cached) return cached;

          // Cache miss -- fetch from network and cache
          return fetch(request)
            .then(function(response) {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(function() {
              // Offline fallback for HTML
              if (request.headers.get('accept') &&
                  request.headers.get('accept').indexOf('text/html') !== -1) {
                return caches.match('./index.html');
              }
              return new Response('Offline', { status: 503, statusText: 'Offline' });
            });
        });
    });
}


/* ── Strategy: network-first for API calls ────────────────── */

var API_CACHE_MAX_ENTRIES = 40;

function networkFirstAPI(request, url) {
  // Cache key uses only the URL (ignore headers for matching)
  var cacheRequest = new Request(url.href);

  return fetch(request)
    .then(function(response) {
      if (!response || response.status !== 200) {
        return caches.open(API_CACHE).then(function(cache) {
          return cache.match(cacheRequest).then(function(cached) {
            return cached || response;
          });
        });
      }

      // Cache the successful response, then trim if needed
      var clone = response.clone();
      caches.open(API_CACHE).then(function(cache) {
        cache.put(cacheRequest, clone);
        trimAPICache(cache);
      });

      return response;
    })
    .catch(function() {
      return caches.open(API_CACHE).then(function(cache) {
        return cache.match(cacheRequest).then(function(cached) {
          if (cached) {
            console.log('[SW] Serving cached API:', url.pathname);
            return cached;
          }
          return new Response(
            JSON.stringify({ error: 'offline', cached: false }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      });
    });
}

// Evict oldest API cache entries when over the limit
function trimAPICache(cache) {
  cache.keys().then(function(keys) {
    if (keys.length <= API_CACHE_MAX_ENTRIES) return;
    var toRemove = keys.length - API_CACHE_MAX_ENTRIES;
    for (var i = 0; i < toRemove; i++) {
      cache.delete(keys[i]);
    }
  });
}


/* ── Message channel: page → SW communication ────────────── */

self.addEventListener('message', function(event) {
  var msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_CLEAR':
      // Clear all caches
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(n) { return caches.delete(n); }));
      }).then(function() {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ cleared: true });
        }
      });
      break;

    case 'CACHE_CLEAR_API':
      // Clear only API cache
      caches.delete(API_CACHE).then(function() {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ cleared: true });
        }
      });
      break;

    case 'CACHE_STATUS':
      // Report cache status
      Promise.all([
        caches.open(CACHE_VERSION).then(function(c) { return c.keys(); }),
        caches.open(API_CACHE).then(function(c) { return c.keys(); })
      ]).then(function(results) {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            static_count: results[0].length,
            api_count: results[1].length,
            version: CACHE_VERSION
          });
        }
      });
      break;

    case 'PRECACHE_UPDATE':
      // Re-fetch and update all precached assets
      caches.open(CACHE_VERSION).then(function(cache) {
        return cache.addAll(PRECACHE_ASSETS);
      }).then(function() {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ updated: true });
        }
      });
      break;
  }
});
