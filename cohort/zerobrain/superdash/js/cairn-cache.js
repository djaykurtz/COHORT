/* Superdash v2 -- CAIRN Offline Cache (4c-r2)
 *
 * IndexedDB-backed cache for CAIRN data (trail, forums, KB, scratch).
 * Provides:
 *   1. Persistent cache that survives page refreshes (unlike R1 localStorage)
 *   2. Background sync -- updates cache on every successful fetch
 *   3. Offline rendering -- serves from IndexedDB when API unreachable
 *   4. Client-side search fallback when /api/cairn/search fails
 *   5. Cache invalidation via SSE event hooks
 *
 * Load AFTER cairn.js -- patches Cairn load methods in-place.
 */

var CairnCache = (function() {
  'use strict';

  var DB_NAME = 'zb_cairn_cache';
  var DB_VERSION = 1;
  var db = null;

  var STORES = {
    trail:   'trail',    // single record: full trail response
    forums:  'forums',   // keyed by rfc_id
    kb:      'kb',       // keyed by slug
    kbList:  'kbList',   // single record: full KB list response
    scratch: 'scratch',  // single record: full scratch response
    meta:    'meta'      // timestamps per store
  };

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        Object.keys(STORES).forEach(function(k) {
          if (!d.objectStoreNames.contains(STORES[k])) {
            d.createObjectStore(STORES[k]);
          }
        });
      };
      req.onsuccess = function(e) {
        db = e.target.result;
        db.onclose = function() { db = null; };
        db.onerror = function() { db = null; };
        resolve(db);
      };
      req.onerror = function(e) { db = null; reject(e.target.error); };
    });
  }

  function put(storeName, key, value) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    }).then(function() {
      return setMeta(storeName, key);
    });
  }

  function get(storeName, key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    }).catch(function() { return null; }); // cache unavailable (private mode/quota/corrupt) -> degrade to no-cache
  }

  function getAll(storeName) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    }).catch(function() { return []; }); // cache unavailable -> degrade to empty
  }

  function setMeta(storeName, key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORES.meta, 'readwrite');
        tx.objectStore(STORES.meta).put({ t: Date.now() }, storeName + ':' + key);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { resolve(); }; // non-critical
      });
    });
  }

  function getMeta(storeName, key) {
    return open().then(function(d) {
      return new Promise(function(resolve) {
        var tx = d.transaction(STORES.meta, 'readonly');
        var req = tx.objectStore(STORES.meta).get(storeName + ':' + key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { resolve(null); };
      });
    }).catch(function() { return null; }); // open() rejected (cache layer down) -> treat as no-meta, never reject
  }

  function ageLabel(meta) {
    if (!meta) return 'unknown age';
    var age = Math.round((Date.now() - meta.t) / 1000);
    if (age < 60) return age + 's ago';
    if (age < 3600) return Math.round(age / 60) + 'm ago';
    return Math.round(age / 3600) + 'h ago';
  }

  // Client-side search across all cached CAIRN data
  function searchLocal(query) {
    var q = query.toLowerCase();
    var results = [];

    return Promise.all([
      get(STORES.trail, 'latest'),
      getAll(STORES.forums),
      get(STORES.kbList, 'latest'),
      get(STORES.scratch, 'latest')
    ]).then(function(stores) {
      var trail = stores[0], forums = stores[1], kbList = stores[2], scratch = stores[3];

      // Search trail (seeds + RFCs)
      if (trail && trail.items) {
        trail.items.forEach(function(item) {
          var text = ((item.title || '') + ' ' + (item.body || '') + ' ' + (item.problem || '')).toLowerCase();
          if (text.indexOf(q) >= 0) {
            results.push({ type: 'rfc', id: item.rfc_id || item.id, title: item.title, match: 'trail' });
          }
        });
      }

      // Search forums (responses)
      forums.forEach(function(forum) {
        if (!forum || !forum.waves) return;
        forum.waves.forEach(function(wave) {
          (wave.responses || []).forEach(function(resp) {
            if (((resp.body || '') + ' ' + (resp.author_id || '')).toLowerCase().indexOf(q) >= 0) {
              results.push({ type: 'response', id: forum.rfc_id, title: forum.title, match: 'response by ' + resp.author_id });
            }
          });
        });
      });

      // Search KB
      if (kbList && kbList.results) {
        kbList.results.forEach(function(article) {
          var text = ((article.title || '') + ' ' + (article.slug || '') + ' ' + (article.tags || '')).toLowerCase();
          if (text.indexOf(q) >= 0) {
            results.push({ type: 'kb', id: article.slug, title: article.title, match: 'kb' });
          }
        });
      }

      // Search scratch
      if (scratch && scratch.entries) {
        scratch.entries.forEach(function(entry) {
          if (((entry.content || '') + ' ' + (entry.subject || '')).toLowerCase().indexOf(q) >= 0) {
            results.push({ type: 'scratch', id: entry.scratch_id, title: entry.subject || 'scratch', match: 'scratch' });
          }
        });
      }

      return results;
    });
  }

  // Invalidate a specific cache entry (called from SSE events)
  function invalidate(storeName, key) {
    return open().then(function(d) {
      return new Promise(function(resolve) {
        var tx = d.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { resolve(); };
      });
    });
  }

  return {
    open: open,
    put: put,
    get: get,
    getAll: getAll,
    getMeta: getMeta,
    ageLabel: ageLabel,
    searchLocal: searchLocal,
    invalidate: invalidate,
    putTrail: function(data) { return put(STORES.trail, 'latest', data); },
    STORES: STORES
  };
})();


// ── Cached badge helper ──
(function() {
  var _badge = null;
  CairnCache.showCachedBadge = function(age) {
    if (!_badge) {
      _badge = document.createElement('div');
      _badge.style.cssText =
        'position:absolute;top:8px;right:8px;z-index:100;' +
        'background:rgba(210,153,34,0.85);color:#000;padding:2px 8px;' +
        'border-radius:3px;font-size:11px;font-weight:600;cursor:pointer;';
      _badge.title = 'Click to clear cache and reload';
      _badge.addEventListener('click', function() {
        if (typeof APICache !== 'undefined' && APICache.clearAllCaches) {
          APICache.clearAllCaches();
        } else {
          location.reload(true);
        }
      });
      var drawer = document.getElementById('cairn-drawer');
      if (drawer) { drawer.appendChild(_badge); }
    }
    if (_badge) { _badge.textContent = '📦 cached · ' + age + ' 🔄'; _badge.style.display = 'block'; }
  };
  CairnCache.hideCachedBadge = function() {
    if (_badge) _badge.style.display = 'none';
  };
})();


// ── Patch Cairn methods with offline cache ──
(function() {
  'use strict';

  var _origLoadBoard = Cairn.loadBoard.bind(Cairn);
  var _origLoadForum = Cairn.loadForum.bind(Cairn);
  var _origLoadScratch = Cairn.loadScratch.bind(Cairn);
  var _origLoadKb = Cairn.loadKb.bind(Cairn);
  var _origLoadKbDetail = Cairn.loadKbDetail.bind(Cairn);

  var TRAIL_TTL_MS = 2 * 60 * 1000; // 2-minute TTL
  var KB_TTL_MS = 2 * 60 * 1000;    // 2-minute TTL for KB/forums/scratch
  var _bgRefreshInFlight = false;
  var _ARCHIVED_STATUSES = { archived: 1, deferred: 1, superseded: 1, cancelled: 1, unknown: 1 };

  function _isFresh(meta) {
    return meta && (Date.now() - meta.t) < TRAIL_TTL_MS;
  }

  function _isFreshKb(meta) {
    return meta && (Date.now() - meta.t) < KB_TTL_MS;
  }

  // Strip archived/deferred/superseded items from cached trail data
  // so stale cache never shows phantom seeds on the board
  function _sanitizeTrail(data) {
    if (!data || !data.columns) return data;
    var clean = { columns: {}, counts: {}, total: 0 };
    var validCols = ['seed', 'ideation', 'rfc', 'in_round', 'ratified', 'shipped'];
    validCols.forEach(function(col) {
      var items = data.columns[col] || [];
      clean.columns[col] = items.filter(function(item) {
        var st = (item.status || '').toLowerCase();
        return !_ARCHIVED_STATUSES[st];
      });
      clean.counts[col] = clean.columns[col].length;
      clean.total += clean.columns[col].length;
    });
    return clean;
  }

  function _bgRefreshTrail() {
    if (_bgRefreshInFlight) return;
    _bgRefreshInFlight = true;
    // SWAT-20260611-0009: trail payload now embeds per-RFC `tasks: {done, total}`
    // server-side; the parallel task-index build (SWAT-0036 (b)) is retired.
    API.cairnTrail().then(function(data) {
      _bgRefreshInFlight = false;
      if (data && !data.error) {
        data = _sanitizeTrail(data);
        Cairn.trailData = data;
        CairnCache.put(CairnCache.STORES.trail, 'latest', data).catch(function() {});
        if (Cairn.view === 'board') {
          CairnCache.hideCachedBadge();
          Cairn.renderBoard();
        }
      }
    }).catch(function() { _bgRefreshInFlight = false; });
  }

  Cairn.loadBoard = async function(forceRefresh) {
    Cairn.view = 'board';

    // SWAT-20260611-0007: lazily load the canonical 9-domain set (once) so the
    // filter chips read /api/canonical-domains instead of a hard-coded label
    // list. Fire-and-forget -- never blocks/awaits the board render; on resolve
    // it re-renders so chips pick up the live labels. Endpoint-absent = no-op.
    if (typeof Cairn.ensureCanonicalDomains === 'function') { Cairn.ensureCanonicalDomains(); }

    // SWAT-20260611-0009: trail payload embeds per-RFC `tasks: {done, total}`
    // server-side (cairn.py LEFT JOIN tasks ON ref_rfc_id).
    // The SWAT-0036 (b) parallel `_buildTaskIndex` wiring is retired here and in
    // cairn.js / cairn-board.js -- render now reads `rfc.tasks` directly.

    // TTL check: serve from cache if fresh (skip network round-trip).
    // The cache layer (IndexedDB) can be unavailable: private/incognito mode,
    // storage quota exceeded, corrupted DB, or schema mismatch all cause
    // CairnCache.open() to reject. Any cache-layer failure MUST degrade to the
    // network path below -- never leave the drawer stuck on "Loading Cairn..."
    // via an unhandled promise rejection (switchTab calls loadBoard without
    // await/.catch()). See boomerang BQ-F8FEF96C / scratch 05300504UXIA.
    if (!forceRefresh) {
      try {
        var meta = await CairnCache.getMeta(CairnCache.STORES.trail, 'latest');
        if (_isFresh(meta)) {
          var cached = await CairnCache.get(CairnCache.STORES.trail, 'latest');
          if (cached) {
            Cairn.trailData = _sanitizeTrail(cached);
            CairnCache.hideCachedBadge();
            Cairn.renderBoard();
            return;
          }
        }
        // Stale cache: serve immediately, background refresh
        if (meta && !_isFresh(meta)) {
          var stale = await CairnCache.get(CairnCache.STORES.trail, 'latest');
          if (stale) {
            Cairn.trailData = _sanitizeTrail(stale);
            Cairn.renderBoard();
            CairnCache.showCachedBadge(CairnCache.ageLabel(meta) + ' · refreshing…');
            _bgRefreshTrail();
            return;
          }
        }
      } catch (e) {
        // Cache layer unavailable -- fall through to the network fetch below.
        try { console.warn('[cairn-cache] cache layer unavailable, falling back to network:', e); } catch (_) {}
      }
    }

    // No usable cache (or forced refresh): fetch from network
    Cairn.setLoading(true);
    var data = await API.cairnTrail();
    Cairn.setLoading(false);

    if (data && !data.error) {
      CairnCache.hideCachedBadge();
      Cairn.trailData = _sanitizeTrail(data);
      CairnCache.put(CairnCache.STORES.trail, 'latest', data).catch(function() {});
      Cairn.renderBoard();
      return;
    }

    // Offline fallback. Guard the cache reads too -- if IndexedDB is the reason
    // the network path was reached (broken cache + network error), an unguarded
    // await here would throw an unhandled rejection instead of rendering an error.
    var cached = null, offlineMeta = null;
    try {
      cached = await CairnCache.get(CairnCache.STORES.trail, 'latest');
      if (cached) offlineMeta = await CairnCache.getMeta(CairnCache.STORES.trail, 'latest');
    } catch (e) {
      try { console.warn('[cairn-cache] offline-fallback cache read failed:', e); } catch (_) {}
    }
    if (cached) {
      Cairn.trailData = _sanitizeTrail(cached);
      Cairn.renderBoard();
      CairnCache.showCachedBadge(CairnCache.ageLabel(offlineMeta));
    } else {
      Cairn.renderError('Failed to load trail: network error (no cached data)');
    }
  };

  Cairn.forceRefreshBoard = function() {
    // Clear both cache layers to guarantee fresh data
    try {
      localStorage.removeItem('zb_cache_/api/cairn/trail');
      localStorage.removeItem('zb_meta_/api/cairn/trail');
    } catch (e) { /* non-critical */ }
    CairnCache.invalidate(CairnCache.STORES.trail, 'latest').catch(function() {});
    Cairn.loadBoard(true);
  };

  Cairn.loadForum = async function(rfcId, opts) {
    opts = opts || {};
    // TTL check: serve from cache if fresh.
    // SSE-driven loads bypass via {forceFresh: true}; this gate protects user-initiated
    // loads only -- do NOT tighten KB_TTL_MS to "fix" live-update staleness, that's
    // the forceFresh path's job (SWAT-20260604-0001).
    if (!opts.forceFresh) {
      var meta = await CairnCache.getMeta(CairnCache.STORES.forums, rfcId);
      if (_isFreshKb(meta)) {
        var cached = await CairnCache.get(CairnCache.STORES.forums, rfcId);
        if (cached) {
          CairnCache.hideCachedBadge();
          Cairn.selectedRfc = cached;
          Cairn.forumCache[rfcId] = cached;
          Cairn.renderDetail(cached);
          return;
        }
      }
    }

    Cairn.setLoading(true);
    var data = await API.cairnForum(rfcId);
    Cairn.setLoading(false);

    if (data && !data.error) {
      CairnCache.hideCachedBadge();
      var rfc = data.rfc || data;
      rfc.rfc_id = rfc.rfc_id || rfc.id || rfcId;
      rfc.author_id = rfc.author_id || rfc.author;
      rfc.waves = data.waves || rfc.waves || [];
      rfc.votes = data.votes || rfc.votes || {};
      Cairn.forumCache[rfcId] = rfc;
      CairnCache.put(CairnCache.STORES.forums, rfcId, rfc).catch(function() {});
      Cairn.selectedRfc = rfc;
      Cairn.renderDetail(rfc);
      return;
    }

    // Capture the real API error (e.g. "RFC X not found") before falling back to cache.
    // Without this, callers saw a generic "network error" message and couldn't tell
    // a 404 from an actual network failure -- masking seed/scratch/kb misroutes from
    // search-result clicks (paired fix in js/cairn.js click handler, same commit).
    var apiError = (data && data.error) ? String(data.error) : null;

    // Offline: try in-memory cache first, then IndexedDB
    var cached = Cairn.forumCache[rfcId] || await CairnCache.get(CairnCache.STORES.forums, rfcId);
    if (cached) {
      Cairn.selectedRfc = cached;
      Cairn.renderDetail(cached);
      CairnCache.showCachedBadge(CairnCache.ageLabel(meta));
    } else {
      var msg = apiError
        ? ('Failed to load forum: ' + apiError + ' (no cached data)')
        : 'Failed to load forum: network error (no cached data)';
      Cairn.renderError(msg);
    }
  };

  Cairn.loadScratch = async function() {
    Cairn.view = 'scratch';

    // TTL check: serve from cache if fresh
    var meta = await CairnCache.getMeta(CairnCache.STORES.scratch, 'latest');
    if (_isFreshKb(meta)) {
      var cached = await CairnCache.get(CairnCache.STORES.scratch, 'latest');
      if (cached) {
        CairnCache.hideCachedBadge();
        Cairn.scratchData = cached;
        Cairn.renderScratch();
        Cairn.startScratchRefresh();
        return;
      }
    }

    Cairn.setLoading(true);
    var data = await API.cairnScratchRead();
    Cairn.setLoading(false);

    if (data && !data.error) {
      CairnCache.hideCachedBadge();
      Cairn.scratchData = data;
      CairnCache.put(CairnCache.STORES.scratch, 'latest', data).catch(function() {});
      Cairn.renderScratch();
      Cairn.startScratchRefresh();
      return;
    }

    var cached = await CairnCache.get(CairnCache.STORES.scratch, 'latest');
    if (cached) {
      Cairn.scratchData = cached;
      Cairn.renderScratch();
      CairnCache.showCachedBadge(CairnCache.ageLabel(meta));
    } else {
      Cairn.renderError('Failed to load scratch: network error (no cached data)');
    }
  };

  Cairn.loadKb = async function(tag) {
    Cairn.view = 'kb';
    Cairn.kbTagFilter = tag || null;

    // If we already have data in memory, just re-render (client-side filtering)
    if (Cairn.kbData) {
      Cairn.renderKb();
      return;
    }

    var kbKey = 'latest';

    // TTL check: serve from IndexedDB cache if fresh
    var meta = await CairnCache.getMeta(CairnCache.STORES.kbList, kbKey);
    if (_isFreshKb(meta)) {
      var cached = await CairnCache.get(CairnCache.STORES.kbList, kbKey);
      if (cached) {
        CairnCache.hideCachedBadge();
        Cairn.kbData = cached;
        Cairn.renderKb();
        return;
      }
    }

    Cairn.setLoading(true);
    var data = await API.cairnKbRead();
    Cairn.setLoading(false);

    if (data && !data.error) {
      CairnCache.hideCachedBadge();
      Cairn.kbData = data;
      CairnCache.put(CairnCache.STORES.kbList, kbKey, data).catch(function() {});
      Cairn.renderKb();
      return;
    }

    var cached = await CairnCache.get(CairnCache.STORES.kbList, kbKey);
    if (cached) {
      Cairn.kbData = cached;
      Cairn.renderKb();
      CairnCache.showCachedBadge(CairnCache.ageLabel(meta));
    } else {
      Cairn.renderError('Failed to load KB: network error (no cached data)');
    }
  };

  Cairn.loadKbDetail = async function(slug) {
    // TTL check: serve from cache if fresh
    var meta = await CairnCache.getMeta(CairnCache.STORES.kb, slug);
    if (_isFreshKb(meta)) {
      var cached = await CairnCache.get(CairnCache.STORES.kb, slug);
      if (cached) {
        CairnCache.hideCachedBadge();
        Cairn._kbEditMode = false;
        Cairn._kbCurrentArticle = cached;
        Cairn.renderKbDetail(cached);
        return;
      }
    }

    Cairn.setLoading(true);
    var data = await API.cairnKbDetail(slug);
    Cairn.setLoading(false);

    if (data && !data.error) {
      CairnCache.hideCachedBadge();
      CairnCache.put(CairnCache.STORES.kb, slug, data).catch(function() {});
      Cairn._kbEditMode = false;
      Cairn._kbCurrentArticle = data;
      Cairn.renderKbDetail(data);
      return;
    }

    var cached = await CairnCache.get(CairnCache.STORES.kb, slug);
    if (cached) {
      Cairn._kbEditMode = false;
      Cairn._kbCurrentArticle = cached;
      Cairn.renderKbDetail(cached);
      CairnCache.showCachedBadge(CairnCache.ageLabel(meta));
    } else {
      Cairn.renderError('Failed to load article: network error (no cached data)');
    }
  };

  // refreshKb: clear in-memory + IndexedDB cache, then reload from API
  Cairn.refreshKb = async function() {
    Cairn.kbData = null;
    CairnCache.put(CairnCache.STORES.kbList, 'latest', null).catch(function() {});
    return Cairn.loadKb(Cairn.kbTagFilter);
  };

  console.log('[CAIRN Cache] Patched loadBoard/loadForum/loadScratch/loadKb/loadKbDetail/refreshKb with IndexedDB offline cache');
})();


// ── Patch CAIRN search with client-side fallback ──
(function() {
  'use strict';

  var _origSearch = (typeof CairnSearch !== 'undefined' && CairnSearch.doSearch)
    ? CairnSearch.doSearch.bind(CairnSearch) : null;

  if (_origSearch) {
    CairnSearch.doSearch = async function(query) {
      // Try server-side first
      var data = await API.cairnSearch(query);
      if (data && !data.error && data.results) {
        CairnCache.hideCachedBadge();
        CairnSearch.renderResults(data.results, query);
        return;
      }

      // Fallback to client-side search over IndexedDB
      var localResults = await CairnCache.searchLocal(query);
      if (localResults.length > 0) {
        CairnCache.showCachedBadge('offline search');
        CairnSearch.renderResults(localResults, query + ' (cached)');
      } else {
        Cairn.renderError('Search failed: network error (no cached results for "' + query + '")');
      }
    };
  }

  console.log('[CAIRN Cache] Search fallback ' + (_origSearch ? 'patched' : 'skipped (CairnSearch not loaded)'));
})();


// ── SSE cache invalidation hooks ──
(function() {
  'use strict';

  // P1 OPERATOR escalation fix (UXIA 2026-06-06, 17th-repeat):
  // CairnRecent (front-page #cairn-recent intel panel, rendered by cairn-recent.js)
  // subscribes to /api/cairn/filter + /api/tasks via Components.registerPanel ->
  // FleetState.subscribe. Layer 2 below invalidates the DataStore entry but
  // FleetState.invalidate() does NOT trigger a fetch or _notify -- subscribers
  // wait up to pollIntervalMs (15s) for the next poll tick before re-rendering.
  // Layer 5 below re-renders CairnPanel (main tab) and Cairn (drawer) when
  // active, but has no equivalent path for CairnRecent.
  //
  // This shim debounces a force-refresh on the two CairnRecent endpoints.
  // FleetState.refresh() -> get(force:true) -> _notify(endpoint, data) which
  // fires the subscriber callback CairnRecent.render() registered. Compresses
  // worst-case server->panel-reflect latency from ~30s (SSE poll + FleetState
  // poll) down to ~ms after SSE delivery.
  //
  // 500ms debounce absorbs bursts of cairn events (e.g. wave_closed +
  // synthesis_published fired adjacent) into a single refresh.
  // SWAT 2026-06-08 (UXIA): cairn-recent.js subscribes to
  // `?include_completed=true` (sticky-stateful predicate requires task history).
  // Earlier shim entry used `=false` -- a URL mismatch that silently dropped
  // task-event SSE force-refreshes onto cairn-recent's task data. Include both
  // so cairn-recent (=true consumer) AND taskboard/api.js (=false consumers)
  // both get sub-second refresh on task-related cairn events.
  var CAIRN_RECENT_ENDPOINTS = [
    '/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30',
    '/api/tasks?include_completed=true',
    '/api/tasks?include_completed=false'
  ];
  var _refreshTimer = null;
  function _scheduleCairnRecentRefresh() {
    if (_refreshTimer) return; // already pending in this debounce window
    _refreshTimer = setTimeout(function() {
      _refreshTimer = null;
      if (typeof FleetState === 'undefined' || typeof FleetState.refresh !== 'function') return;
      CAIRN_RECENT_ENDPOINTS.forEach(function(ep) {
        try { FleetState.refresh(ep); } catch (e) { /* non-critical */ }
      });
    }, 500);
  }

  function hookSSE() {
    if (typeof SSE === 'undefined' || !SSE || !SSE.handleEvent) return false;
    var _origHandleEvent = SSE.handleEvent.bind(SSE);
    SSE.handleEvent = function(data) {
      _origHandleEvent(data);

      try {
        // I-ARCH fix: flipped from `data.type || data.event_type` to match the
        // canonical fallback order at sse.js:132. Coord SSE emits use event_type
        // as the primary key; the reversed order silently mis-resolved type when
        // event_type was present (caught by check-event-contract orchestrator).
        var type = data.event_type || data.type || '';

        // CAIRN OUTBOX EVENT CONTRACT (OPERATOR-directed 2026-05-30T00:04 PDT,
        // P1 dashboard-realtime-cairn-write-propagation):
        //
        // EVERY event enqueued via cairn._queue_notification() (grep
        // `@ux: outbox-write` in coordinator/cairn.py) MUST trigger a dashboard
        // refresh here. The previous narrow allowlist + 'cairn'/'rfc'/'seed'
        // substring check silently dropped wave_closed_with_synthesis and
        // wave_opened, leaving the OPERATOR's dashboard stale after every
        // wave-close. Two-layer defense below.
        //
        // ANY NEW cairn outbox event_type MUST either:
        //   (a) contain one of the substring tokens below, OR
        //   (b) be explicitly listed in CAIRN_OUTBOX_EVENTS.
        // Otherwise the dashboard will silently miss it -- never acceptable.
        //
        // RECIPROCAL: mirror any addition into js/sse.js _CAIRN_OUTBOX_EVENTS +
        // _CAIRN_SUBSTRINGS. Drift
        // between cache-layer match (this file) and user-notification match
        // (sse.js) silently breaks the cairn toast. Two-way breadcrumb
        // (DRAGON review nit).
        var CAIRN_OUTBOX_EVENTS = {
          // Wave lifecycle
          wave_opened: 1,
          wave_closed_with_synthesis: 1,
          synthesis_published: 1,
          // RFC lifecycle
          solidplan_attached: 1,
          rfc_ratified: 1,
          rfc_shipped: 1,
          rfc_archived: 1,
          rfc_status_set: 1,
          rfc_promoted: 1,
          rfc_demoted: 1,
          rfc_revised: 1,
          rfc_renamed: 1,
          // RFC authoring + meta
          rfc_created: 1,
          seed_created: 1,
          rfc_meta_set: 1,
          rfc_short_description_set: 1,
          rfc_tags_set: 1,
          // Engagement
          rfc_voted: 1,
          rfc_council_summoned: 1,
          // Seed promotion via star
          seed_starred_promoted: 1,
          // Response interactions
          response_starred: 1,
          operator_frame: 1,
        };
        var CAIRN_SUBSTRINGS = [
          'cairn', 'rfc', 'seed', 'wave', 'solidplan', 'synthesis',
          'ratified', 'ship', 'star', 'frame', 'revise', 'revision',
          'promote', 'demote', 'vote', 'voted', 'tag', 'meta',
          'category', 'title', 'response', 'spyglass',
        ];
        function _matchesCairn(t) {
          if (!t) return false;
          if (CAIRN_OUTBOX_EVENTS[t]) return true;
          for (var i = 0; i < CAIRN_SUBSTRINGS.length; i++) {
            if (t.indexOf(CAIRN_SUBSTRINGS[i]) >= 0) return true;
          }
          return false;
        }

        // Invalidate caches AND re-render any currently visible CAIRN view.
        //
        // SWAT-20260604-0001 fix (ZBPRIME 2026-06-04, DRAGON architect-bless):
        // The previous implementation clamped in-component memoization (Cairn.kbData,
        // Cairn.scratchData, Cairn.trailData, Cairn.forumCache, Cairn._kbCurrentArticle,
        // CairnPanel._data) on the same view-state predicate as the DOM re-render. That
        // made staleness a property of the *view* instead of a property of the *data*.
        // Result: OPERATOR-observed RFC387 case where solidplan attach succeeded, IndexedDB
        // cache cleared, but the in-component memoization on a *different* tab held stale
        // state -- and that stale state was served when the user navigated back. n=17.
        //
        // Belt-and-suspenders: in-component memoization is now cleared *unconditionally*
        // whenever a matching cairn/kb/scratch event fires, regardless of which view is
        // active. The DOM re-render hooks below remain as a courtesy refresh for the
        // currently-visible view; they are no longer the only thing standing between a
        // canonical-DB write and visible staleness.
        function _clearCairnMemoization(rfcIdOpt) {
          if (typeof Cairn === 'undefined') return;
          // Trail (board view) memoization.
          Cairn.trailData = null;
          // Forum memoization is keyed by rfc_id. If event names a specific rfc, drop
          // just that key (preserves other open drawers' cache for fast switch-back).
          // Otherwise drop the whole map (broad invalidation -- safer default for
          // events without an rfc_id, e.g. trail-wide changes).
          if (rfcIdOpt && Cairn.forumCache) {
            delete Cairn.forumCache[rfcIdOpt];
          } else {
            Cairn.forumCache = {};
          }
          // CairnPanel main-tab memoization (search-result list).
          if (typeof CairnPanel !== 'undefined' && CairnPanel) {
            CairnPanel._data = null;
          }
        }
        function _clearKbMemoization(slugOpt) {
          if (typeof Cairn === 'undefined') return;
          Cairn.kbData = null;
          // _kbCurrentArticle is the in-memory copy of the currently-viewed article.
          // If the event names a slug, clear only if it matches; otherwise broad clear.
          if (!slugOpt || (Cairn._kbCurrentArticle && Cairn._kbCurrentArticle.slug === slugOpt)) {
            Cairn._kbCurrentArticle = null;
          }
        }
        function _clearScratchMemoization() {
          if (typeof Cairn === 'undefined') return;
          Cairn.scratchData = null;
        }
        function _purgeLocalStoragePrefix(apiPrefix) {
          // Mirrors the kb-only purge that lived inline at the old line 732-738;
          // extended to all doc_types under SWAT-0001 belt-and-suspenders.
          try {
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (!k) continue;
              if (k.indexOf('zb_cache_' + apiPrefix) === 0) localStorage.removeItem(k);
              if (k.indexOf('zb_meta_' + apiPrefix) === 0) localStorage.removeItem(k);
            }
          } catch (e) { /* non-critical */ }
        }

        if (_matchesCairn(type)) {
          // ── Layer 1: IndexedDB CairnCache ──
          CairnCache.invalidate(CairnCache.STORES.trail, 'latest');
          if (data.rfc_id) CairnCache.invalidate(CairnCache.STORES.forums, data.rfc_id);

          // ── Layer 2: DataStore (CairnPanel search cache) ──
          // CairnPanel uses DataStore.get('/api/cairn/search?...') with its own
          // separate cache from CairnCache. Without this, the main Cairn tab
          // serves stale results for up to 20s after a backend cairn event.
          // Prefix-match (not exact URL) so this stays correct if the CairnPanel
          // search-query string changes.
          if (typeof DataStore !== 'undefined' && DataStore && DataStore._cache &&
              typeof DataStore.invalidate === 'function') {
            try {
              var _keys = Object.keys(DataStore._cache);
              var _matched = [];
              for (var _i = 0; _i < _keys.length; _i++) {
                if (_keys[_i].indexOf('/api/cairn/') === 0) {
                  _matched.push(_keys[_i]);
                }
              }
              if (_matched.length) DataStore.invalidate(_matched);
            } catch (eDs) { /* non-critical */ }
          }

          // ── Layer 3: localStorage shadow caches (belt-and-suspenders) ──
          // Was kb-only previously; extended to trail+forum keys under SWAT-0001
          // since any cairn event could shadow-write any of them.
          _purgeLocalStoragePrefix('/api/cairn/trail');
          _purgeLocalStoragePrefix('/api/cairn/recent');
          _purgeLocalStoragePrefix('/api/cairn/forum');
          _purgeLocalStoragePrefix('/api/cairn/rfc');

          // ── Layer 4: in-component memoization (view-INDEPENDENT) ──
          // The SWAT-0001 belt-and-suspenders. Runs on EVERY matching event,
          // not just when the relevant view is active.
          _clearCairnMemoization(data.rfc_id);

          // ── Layer 5: courtesy DOM re-render for currently-visible view ──
          // These no longer carry staleness-correctness on their shoulders; they
          // only save the user a manual click for the view they happen to be on.
          if (typeof Cairn !== 'undefined' && Cairn.open) {
            // Currently-open RFC drawer matches the event's rfc_id -> refetch it
            if (data.rfc_id && Cairn.selectedRfc && Cairn.selectedRfc.rfc_id === data.rfc_id && typeof Cairn.loadForum === 'function') {
              try { Cairn.loadForum(data.rfc_id, { forceFresh: true }); } catch (e1) { /* non-critical */ }
            }
            // Board LIST view active -> DEBOUNCED, NON-BLANKING, scroll-PRESERVING
            // courtesy refresh.
            // SWAT-20260628-0008 (round 1): an immediate loadBoard(true) per cairn
            // event blanked + scroll-reset the pipeline. Round 1 debounced it to
            // <=1/8s but STILL called loadBoard(true), which (a) calls setLoading()
            // -> spinner-blanks #cairn-body during the fetch (the "screen turns
            // black"), and (b) only restored #cairn-body.scrollTop -- the WRONG
            // element, since each kanban column (.cairn-col-items) scrolls
            // internally. Result under the permanent 10s SSE poll: OPERATOR's
            // Ratified column blanked + jumped to top every ~10s. Round 2 fix:
            // call Cairn.refreshBoardSilent() -- fetch-first, no setLoading blank,
            // single synchronous renderBoard() swap with per-column scrollTop
            // capture/restore. The MANUAL Force-refresh button still does the full
            // immediate loadBoard(true) (unchanged).
            if (Cairn.view === 'board' && !document.querySelector('.cairn-detail') && typeof Cairn.refreshBoardSilent === 'function') {
              if (Cairn._boardAutoRefreshTimer) clearTimeout(Cairn._boardAutoRefreshTimer);
              Cairn._boardAutoRefreshTimer = setTimeout(function () {
                Cairn._boardAutoRefreshTimer = null;
                if (Cairn.view !== 'board' || document.querySelector('.cairn-detail')) return;
                try { Cairn.refreshBoardSilent(); } catch (e2) { /* non-critical */ }
              }, 8000);
            }
          }
          if (typeof App !== 'undefined' && App.currentTab === 'cairn-panel' &&
              typeof CairnPanel !== 'undefined' && CairnPanel && typeof CairnPanel.renderPanel === 'function') {
            try { CairnPanel.renderPanel(); } catch (ePanel) { /* non-critical */ }
          }

          // ── Layer 6: front-page CairnRecent panel force-refresh ──
          // CairnRecent has no equivalent of CairnPanel.renderPanel above --
          // it relies entirely on FleetState's 15s poll for re-render. Force a
          // (debounced) refresh of its underlying endpoints so the subscriber
          // callback fires within ms of SSE delivery instead of waiting on
          // the next poll tick.
          _scheduleCairnRecentRefresh();
        }
        if (type.indexOf('kb') >= 0) {
          // ── Layers 1-3 ──
          CairnCache.invalidate(CairnCache.STORES.kbList, 'latest');
          if (data.slug) CairnCache.invalidate(CairnCache.STORES.kb, data.slug);
          _purgeLocalStoragePrefix('/api/cairn/kb');

          // ── Layer 4: in-component memoization (view-INDEPENDENT) ──
          _clearKbMemoization(data.slug);

          // ── Layer 5: courtesy re-render (KB LIST view active) ──
          // Do NOT reload the list while the user is READING a KB article
          // (.cairn-kb-detail present): a list reload yanks them out of the
          // article + resets scroll. Only refresh when the list itself is shown.
          //
          // OPERATOR-reported bug (2026-07-02): unlike the board refresh below
          // (debounced to 1/8s per SWAT-20260628-0008), this path called
          // Cairn.loadKb() IMMEDIATELY per matching SSE event with no debounce.
          // A burst of kb_* coordinator events (common during active multi-node
          // KB editing sessions) fired an immediate reload+re-render PER EVENT,
          // producing rapid repeated "cached data" badge pops + search-input
          // rebuilds. Mirror the board's debounce pattern here.
          if (typeof Cairn !== 'undefined' && Cairn.open &&
              (Cairn.activeTab === 'kb' || Cairn.view === 'kb') &&
              !document.querySelector('.cairn-kb-detail') &&
              typeof Cairn.loadKb === 'function') {
            if (Cairn._kbAutoRefreshTimer) clearTimeout(Cairn._kbAutoRefreshTimer);
            Cairn._kbAutoRefreshTimer = setTimeout(function () {
              Cairn._kbAutoRefreshTimer = null;
              if (!Cairn.open || !(Cairn.activeTab === 'kb' || Cairn.view === 'kb') ||
                  document.querySelector('.cairn-kb-detail')) return;
              try { Cairn.loadKb(Cairn.kbTagFilter); } catch (eKb) { /* non-critical */ }
            }, 8000);
          }
        }
        if (type.indexOf('scratch') >= 0) {
          // ── Layers 1-3 ──
          CairnCache.invalidate(CairnCache.STORES.scratch, 'latest');
          _purgeLocalStoragePrefix('/api/cairn/scratch');

          // ── Layer 4: in-component memoization (view-INDEPENDENT) ──
          _clearScratchMemoization();

          // ── Layer 5: courtesy re-render (scratch LIST view active) ──
          // Skip while a seed/scratch DETAIL is open (.cairn-scratch-detail-view):
          // reloading the list resets the reader's scroll + closes the entry.
          // Same debounce fix as the KB path above (OPERATOR-reported 2026-07-02).
          if (typeof Cairn !== 'undefined' && Cairn.open && (Cairn.activeTab === 'scratch' || Cairn.view === 'scratch') && !document.querySelector('.cairn-scratch-detail-view') && typeof Cairn.loadScratch === 'function') {
            if (Cairn._scratchAutoRefreshTimer) clearTimeout(Cairn._scratchAutoRefreshTimer);
            Cairn._scratchAutoRefreshTimer = setTimeout(function () {
              Cairn._scratchAutoRefreshTimer = null;
              if (!Cairn.open || !(Cairn.activeTab === 'scratch' || Cairn.view === 'scratch') ||
                  document.querySelector('.cairn-scratch-detail-view')) return;
              try { Cairn.loadScratch(); } catch (e3) { /* non-critical */ }
            }, 8000);
          }
        }
      } catch (e) { /* non-critical */ }
    };
    console.log('[CAIRN Cache] SSE invalidation + re-render hooks registered (P1 realtime fix)');
    return true;
  }

  // Try immediately, then retry after DOM is ready (SSE loads later)
  if (!hookSSE()) {
    var _retries = 0;
    var _timer = setInterval(function() {
      if (hookSSE() || ++_retries > 20) clearInterval(_timer);
    }, 500);
  }
})();
