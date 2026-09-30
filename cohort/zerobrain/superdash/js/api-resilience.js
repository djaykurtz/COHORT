/* Superdash v2 -- API Resilience Layer (4c-r1)
 *
 * Wraps API.get/getRaw with:
 *   1. Retry with jittered exponential backoff (3 attempts)
 *   2. localStorage response cache with per-endpoint TTL
 *   3. Stale-while-revalidate: serve cache immediately, refresh in background
 *   4. Staleness badge injection when serving cached data
 *
 * Load AFTER api.js -- patches API object in-place.
 * No changes needed to any other module.
 */

var APICache = (function() {
  'use strict';

  var CACHE_PREFIX = 'zb_cache_';
  var META_PREFIX  = 'zb_meta_';

  // TTLs in milliseconds per endpoint pattern.
  // SWAT-candidate finding I (superdash resource-efficiency pass, 2026-08):
  // values below are ALIGNED to FleetState.ENDPOINTS' maxAgeMs (js/datastore.js,
  // the L1 memory-cache layer this L2 localStorage cache sits underneath) for
  // every endpoint both layers know about -- L2 must never cache longer than
  // L1's own freshness window, or L1's refresh intent gets silently defeated
  // by a staler L2 hit. Endpoints with no FleetState.ENDPOINTS counterpart
  // (cairn/search, cairn/rfc/, scripts, files/, lifecycle, deploy-status) are
  // L2-only and unaffected by this reconciliation.
  //
  // ALSO FIXED here: '/api/molt/history' (120000) was listed AFTER the more
  // generic '/api/molt' prefix (60000) below -- getTTL() does an in-order
  // indexOf(pattern)===0 scan, so the generic entry matched FIRST for any
  // '/api/molt/history*' endpoint too, making the specific entry unreachable
  // dead code. Reordered so the more specific pattern is checked first.
  var TTL_MAP = [
    { pattern: '/api/health',          ttl: 15000  },
    { pattern: '/api/molt/history',    ttl: 60000  },  // moved before generic '/api/molt' (was shadowed, dead code); matches FleetState maxAgeMs=60000
    { pattern: '/api/fleet',           ttl: 15000  },  // was 30000 -- now matches FleetState maxAgeMs=15000
    { pattern: '/api/tasks',           ttl: 15000  },  // was 60000 -- now matches FleetState maxAgeMs=15000 (both include_completed variants)
    { pattern: '/api/workload',        ttl: 30000  },  // was 60000 -- now matches FleetState maxAgeMs=30000
    { pattern: '/api/molt',            ttl: 30000  },  // was 60000 -- now matches FleetState maxAgeMs=30000 (/api/molt/status)
    { pattern: '/api/cairn/search',   ttl: 60000  },
    { pattern: '/api/cairn/rfc/',      ttl: 60000  },
    { pattern: '/api/cairn/kb',        ttl: 30000  },  // was 300000 -- now matches FleetState maxAgeMs=30000 (/api/cairn/kb?limit=500)
    { pattern: '/api/cairn/scratch',   ttl: 10000  },  // was 120000 -- now matches FleetState maxAgeMs=10000
    { pattern: '/api/messages/',       ttl: 30000  },
    { pattern: '/api/scripts',         ttl: 120000 },
    { pattern: '/api/files/',          ttl: 300000 },
    { pattern: '/api/lifecycle',       ttl: 60000  },
    { pattern: '/api/deploy-status',   ttl: 60000  }
  ];

  var DEFAULT_TTL = 30000;

  function getTTL(endpoint) {
    for (var i = 0; i < TTL_MAP.length; i++) {
      if (endpoint.indexOf(TTL_MAP[i].pattern) === 0) return TTL_MAP[i].ttl;
    }
    return DEFAULT_TTL;
  }

  function cacheKey(endpoint) {
    return CACHE_PREFIX + endpoint;
  }

  function metaKey(endpoint) {
    return META_PREFIX + endpoint;
  }

  function readCache(endpoint) {
    try {
      var raw = localStorage.getItem(cacheKey(endpoint));
      var meta = localStorage.getItem(metaKey(endpoint));
      if (!raw || !meta) return null;
      var m = JSON.parse(meta);
      return { data: JSON.parse(raw), timestamp: m.t, ttl: m.ttl };
    } catch (e) {
      return null;
    }
  }

  function writeCache(endpoint, data) {
    try {
      var ttl = getTTL(endpoint);
      localStorage.setItem(cacheKey(endpoint), JSON.stringify(data));
      localStorage.setItem(metaKey(endpoint), JSON.stringify({ t: Date.now(), ttl: ttl }));
    } catch (e) {
      // localStorage full -- evict oldest entries
      evictOldest(5);
      try {
        localStorage.setItem(cacheKey(endpoint), JSON.stringify(data));
        localStorage.setItem(metaKey(endpoint), JSON.stringify({ t: Date.now(), ttl: getTTL(endpoint) }));
      } catch (e2) {
        console.warn('[Cache] Storage full, cannot cache:', endpoint);
      }
    }
  }

  function evictOldest(count) {
    var entries = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(META_PREFIX) === 0) {
        try {
          var m = JSON.parse(localStorage.getItem(key));
          entries.push({ key: key, endpoint: key.slice(META_PREFIX.length), t: m.t });
        } catch (e) { /* skip */ }
      }
    }
    entries.sort(function(a, b) { return a.t - b.t; });
    for (var j = 0; j < Math.min(count, entries.length); j++) {
      localStorage.removeItem(cacheKey(entries[j].endpoint));
      localStorage.removeItem(metaKey(entries[j].endpoint));
    }
  }

  function isFresh(cached) {
    return cached && (Date.now() - cached.timestamp) < cached.ttl;
  }

  function isStale(cached) {
    return cached && !isFresh(cached);
  }

  function ageLabel(cached) {
    if (!cached) return '';
    var age = Math.round((Date.now() - cached.timestamp) / 1000);
    if (age < 60) return age + 's ago';
    if (age < 3600) return Math.round(age / 60) + 'm ago';
    return Math.round(age / 3600) + 'h ago';
  }

  // Retry with jittered exponential backoff
  var RETRY_DELAYS = [1000, 2000, 4000]; // base delays

  async function fetchWithRetry(url, options, maxRetries) {
    var attempts = maxRetries || 3;
    var lastErr = null;
    for (var i = 0; i < attempts; i++) {
      try {
        // Timeout: abort fetch after 10s to prevent hanging on unresponsive coordinator
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
        var fetchOpts = Object.assign({}, options, { signal: controller.signal });

        var resp = await fetch(url, fetchOpts);
        clearTimeout(timeoutId);
        if (resp.status === 503) {
          throw new Error('MAINTENANCE');
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp;
      } catch (err) {
        lastErr = err;
        if (err.message === 'MAINTENANCE') throw err;
        if (i < attempts - 1) {
          var base = RETRY_DELAYS[Math.min(i, RETRY_DELAYS.length - 1)];
          var jitter = Math.random() * base * 0.5;
          await new Promise(function(r) { setTimeout(r, base + jitter); });
        }
      }
    }
    throw lastErr;
  }

  // Staleness badge management
  var _staleBadge = null;

  function showStaleBadge(age) {
    if (!_staleBadge) {
      _staleBadge = document.createElement('div');
      _staleBadge.id = 'stale-badge';
      _staleBadge.style.cssText =
        'position:fixed;top:8px;right:120px;z-index:9999;' +
        'background:rgba(210,153,34,0.9);color:#000;padding:4px 12px;' +
        'border-radius:4px;font-size:12px;font-weight:600;' +
        'cursor:pointer;transition:opacity 0.3s;';
      _staleBadge.title = 'Click to clear cache and reload';
      _staleBadge.addEventListener('click', function() {
        APICache.clearAllCaches();
      });
      document.body.appendChild(_staleBadge);
    }
    _staleBadge.textContent = '⚡ cached data · ' + age + ' 🔄';
    _staleBadge.style.opacity = '1';
  }

  function hideStaleBadge() {
    if (_staleBadge) _staleBadge.style.opacity = '0';
  }

  // Track whether we're serving stale data
  var _servingStale = false;

  return {
    readCache: readCache,
    writeCache: writeCache,
    isFresh: isFresh,
    isStale: isStale,
    ageLabel: ageLabel,
    fetchWithRetry: fetchWithRetry,
    showStaleBadge: showStaleBadge,
    hideStaleBadge: hideStaleBadge,

    get servingStale() { return _servingStale; },
    set servingStale(v) { _servingStale = v; },

    // Cache stats for debugging
    stats: function() {
      var count = 0, bytes = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(CACHE_PREFIX) === 0) {
          count++;
          bytes += (localStorage.getItem(key) || '').length;
        }
      }
      return { entries: count, sizeKB: Math.round(bytes / 1024) };
    },

    // Nuclear option: clear all caches (localStorage, IndexedDB, SW) and reload
    clearAllCaches: function() {
      // 1. Clear localStorage API cache
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(CACHE_PREFIX) === 0) keys.push(key);
      }
      keys.forEach(function(k) { localStorage.removeItem(k); });

      // 2. Clear IndexedDB (cairn-cache)
      try { indexedDB.deleteDatabase('cairn-cache'); } catch(e) {}

      // 3. Unregister service worker and clear its caches
      if ('serviceWorker' in navigator) {
        caches.keys().then(function(names) {
          names.forEach(function(name) { caches.delete(name); });
        });
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          regs.forEach(function(r) { r.unregister(); });
        });
      }

      // 4. Hard reload after a brief delay
      setTimeout(function() { location.reload(true); }, 300);
    }
  };
})();


// ── Patch API.get with resilience ──
(function() {
  'use strict';

  var _originalGet = API.get.bind(API);
  var _originalGetRaw = API.getRaw.bind(API);

  // SWAT-20260604-0015: inverted blocklist → allowlist.
  //
  // Previous policy was fail-UNSAFE: a NO_CACHE blocklist of explicit endpoints,
  // with everything else defaulting to "cache with 30-300s TTL". Any new endpoint
  // added to the coord API silently inherited stale-while-revalidate semantics
  // until someone remembered to add it to NO_CACHE. SWAT-0013 was exactly this
  // failure (/api/cairn/rfc/forum added without NO_CACHE update → OPERATOR saw
  // stale wave/synthesis data for 60s).
  //
  // New policy is fail-SAFE: only endpoints in the CACHEABLE allowlist below
  // get cached. Everything else hits the network on every call. Adding a new
  // endpoint to the coord API → renders fresh by default; the engineer must
  // make a deliberate, documented decision to opt into caching.
  //
  // SSE-managed surfaces (/api/cairn/kb, /api/cairn/scratch, /api/cairn/rfc/,
  // /api/cairn/trail, /api/events) are intentionally absent here -- they're
  // cached by cairn-cache.js (IndexedDB) with SSE invalidation, or are
  // streaming endpoints where caching has no meaning.
  var CACHEABLE = [
    '/api/health',
    '/api/fleet',
    '/api/tasks',
    '/api/workload',
    '/api/molt',          // matches /api/molt and /api/molt/history
    '/api/cairn/search',
    '/api/messages/',
    '/api/scripts',
    '/api/files/',
    '/api/lifecycle',
    '/api/deploy-status'
  ];

  function shouldCache(endpoint) {
    for (var i = 0; i < CACHEABLE.length; i++) {
      if (endpoint.indexOf(CACHEABLE[i]) === 0) return true;
    }
    return false;
  }

  // SWAT-20260604-0015 one-shot migration: an existing OPERATOR tab may still
  // hold localStorage entries for endpoints that were cacheable under the old
  // blocklist policy but are no longer on the allowlist. Without this purge,
  // those tabs keep serving stale until each entry's TTL elapses (up to 5min).
  // SSE-managed surfaces (/api/cairn/{rfc,kb,scratch,trail}) are the highest-
  // risk class -- this same purge also retires SWAT-20260604-0013 (QUATTRO).
  try {
    var _toPurge = [];
    for (var _i = 0; _i < localStorage.length; _i++) {
      var _k = localStorage.key(_i);
      if (!_k) continue;
      var _endpoint = null;
      if (_k.indexOf('zb_cache_') === 0) _endpoint = _k.slice('zb_cache_'.length);
      else if (_k.indexOf('zb_meta_') === 0) _endpoint = _k.slice('zb_meta_'.length);
      if (_endpoint && !shouldCache(_endpoint)) _toPurge.push(_k);
    }
    for (var _j = 0; _j < _toPurge.length; _j++) localStorage.removeItem(_toPurge[_j]);
    if (_toPurge.length) {
      console.log('[API+R] SWAT-0015 invert: purged ' + _toPurge.length +
                  ' stale cache entries no longer on CACHEABLE allowlist');
    }
  } catch (_e) { /* localStorage unavailable -- non-critical */ }

  API.get = async function(endpoint) {
    if (!shouldCache(endpoint)) return _originalGet(endpoint);

    var cached = APICache.readCache(endpoint);

    // Fresh cache -- return immediately
    if (APICache.isFresh(cached)) {
      return cached.data;
    }

    // Stale cache exists -- return stale, refresh in background
    if (APICache.isStale(cached)) {
      APICache.servingStale = true;
      APICache.showStaleBadge(APICache.ageLabel(cached));

      // Background refresh (fire and forget -- badge cleared only on real network success)
      _fetchAndCache(endpoint).catch(function() { /* stale continues, badge stays */ });

      return cached.data;
    }

    // No cache -- fetch with retry
    return _fetchAndCache(endpoint);
  };

  async function _fetchAndCache(endpoint) {
    try {
      var headers = { 'Accept': 'application/json' };
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;

      var resp = await APICache.fetchWithRetry(
        CONFIG.API_BASE + endpoint,
        { headers: headers },
        3
      );
      var data = await resp.json();
      APICache.writeCache(endpoint, data);
      APICache.servingStale = false;
      APICache.hideStaleBadge();
      return data;
    } catch (err) {
      console.warn('[API+R] ' + endpoint + ' failed after retries:', err.message);

      // Last resort: return any cached data, even ancient
      var fallback = APICache.readCache(endpoint);
      if (fallback) {
        APICache.servingStale = true;
        APICache.showStaleBadge(APICache.ageLabel(fallback) + ' (offline)');
        return fallback.data;
      }
      return null;
    }
  }

  API.getRaw = async function(endpoint) {
    // getRaw returns text, not JSON -- cache as string
    if (!shouldCache(endpoint)) return _originalGetRaw(endpoint);

    var cached = APICache.readCache(endpoint);
    if (APICache.isFresh(cached)) return cached.data;

    if (APICache.isStale(cached)) {
      _fetchRawAndCache(endpoint).catch(function() {});
      return cached.data;
    }

    return _fetchRawAndCache(endpoint);
  };

  async function _fetchRawAndCache(endpoint) {
    try {
      var headers = {};
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;

      var resp = await APICache.fetchWithRetry(
        CONFIG.API_BASE + endpoint,
        { headers: headers },
        3
      );
      var text = await resp.text();
      APICache.writeCache(endpoint, text);
      return text;
    } catch (err) {
      console.warn('[API+R] raw ' + endpoint + ' failed after retries:', err.message);
      var fallback = APICache.readCache(endpoint);
      return fallback ? fallback.data : null;
    }
  }

  console.log('[API Resilience] Patched API.get + API.getRaw with retry/cache/stale-while-revalidate');
})();
