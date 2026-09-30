/* Superdash v2 -- FleetState (shared data layer singleton)
 *
 * RFC-FDDB12: Centralizes ALL API data fetching for superdash panels.
 * - Single poll loop per endpoint (not N timers from N panels)
 * - Subscriber-driven polling: polling starts when first subscriber joins
 * - Deduplicates concurrent requests to the same endpoint
 * - Stale-while-revalidate: returns cached data instantly, refreshes in background
 * - TTL-based dedup with differentiated intervals (high-churn vs low-churn)
 * - Per-endpoint error tracking with global connectivity derivation
 * - Page Visibility API: pauses polling when tab is hidden
 * - Config-driven endpoint registry
 * - refreshAll() for on-demand sync
 *
 * Backward compat: var DataStore = FleetState (alias for existing consumers)
 */

var FleetState = {
  _cache: {},       // endpoint -> { data, fetchedAt, promise, error, errorCount }
  _listeners: {},   // endpoint -> [callback, ...]
  _polls: {},       // endpoint -> { timer, intervalMs, maxAge }
  _paused: false,   // true when tab is hidden

  // ═══ ENDPOINT REGISTRY ═══
  // Panels call subscribe() with any endpoint. If the endpoint is registered
  // here, its TTL/interval settings are used automatically. Unregistered
  // endpoints use defaults (15s maxAge, no auto-poll).
  // SWAT-candidate finding I (superdash resource-efficiency pass, 2026-08,
  // corrected framing per scratch 08130830ZBPRIME-superdash-finding-i-corrected-):
  // this is a deliberate L1(memory)/L2(localStorage)/L3(Service-Worker-cache)
  // layered cache stack -- FleetState (L1, this file) calls API.get(), which
  // APICache below (api-resilience.js, L2) wraps with a localStorage cache,
  // which itself flows through sw.js's fetch-interception cache (L3, offline
  // fallback). The layering is intentional and should NOT be collapsed to a
  // single cache. However, L2's TTL_MAP previously held LONGER lifetimes than
  // L1's maxAgeMs for several shared endpoints (e.g. /api/tasks: L1=15000 vs
  // L2=60000) -- meaning L1 could consider its copy stale and ask L2 to
  // refresh, only for L2 to silently serve an up-to-4x-staler cached response
  // instead of hitting the network, defeating L1's own freshness intent for a
  // fraction of refreshes. L2's TTLs have been aligned to L1's maxAgeMs (see
  // api-resilience.js TTL_MAP) so L2 never outlives L1's freshness window for
  // any endpoint both layers know about.
  ENDPOINTS: {
    '/api/fleet':                          { maxAgeMs: 15000, pollIntervalMs: 15000, critical: true },
    '/api/health':                         { maxAgeMs: 15000, pollIntervalMs: 15000, critical: true },
    '/api/dashboard/heartbeats':           { maxAgeMs: 15000, pollIntervalMs: 15000, critical: true },
    '/api/tasks?include_completed=false':  { maxAgeMs: 15000, pollIntervalMs: 15000, critical: false },
    '/api/molt/status':                    { maxAgeMs: 30000, pollIntervalMs: 30000, critical: false },
    '/api/workload':                       { maxAgeMs: 30000, pollIntervalMs: 30000, critical: false },
    '/api/cairn/trail':                    { maxAgeMs: 5000,  pollIntervalMs: 15000, critical: false },
    '/api/cairn/kb?limit=500':             { maxAgeMs: 30000, pollIntervalMs: 60000, critical: false },
    '/api/cairn/scratch':                  { maxAgeMs: 10000, pollIntervalMs: 30000, critical: false },
    '/api/molt/history':                   { maxAgeMs: 60000, pollIntervalMs: 60000, critical: false },
    '/api/opa/active':                     { maxAgeMs: 30000, pollIntervalMs: 30000, critical: false },
    '/api/opa/audit?limit=10':             { maxAgeMs: 30000, pollIntervalMs: 30000, critical: false },
    '/api/cairn/recent':                   { maxAgeMs: 5000,  pollIntervalMs: 15000, critical: false },
    '/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30': { maxAgeMs: 5000, pollIntervalMs: 15000, critical: false },
    '/api/tasks?include_completed=true':   { maxAgeMs: 15000, pollIntervalMs: 15000, critical: false },
    '/api/messages/recent?limit=100':      { maxAgeMs: 30000, pollIntervalMs: 30000, critical: false },
    '/api/boomerangs':                     { maxAgeMs: 15000, pollIntervalMs: 15000, critical: false },
    '/api/review-pipeline':                { maxAgeMs: 15000, pollIntervalMs: 15000, critical: false }
  },

  // ═══ PAGE VISIBILITY ═══
  // Page Visibility is handled by PerfGuard (loads after this file).
  // FleetState exposes _pause/_resume for PerfGuard to call.
  init: function() {
    console.log('[FleetState] Initialized -- subscriber-driven polling, pause/resume via PerfGuard');
  },

  _pause: function() {
    if (this._paused) return;
    this._paused = true;
    var self = this;
    Object.keys(this._polls).forEach(function(ep) {
      if (self._polls[ep].timer) {
        clearInterval(self._polls[ep].timer);
        self._polls[ep].timer = null;
      }
    });
    console.log('[FleetState] Paused -- tab hidden');
  },

  _resume: function() {
    if (!this._paused) return;
    this._paused = false;
    var self = this;
    Object.keys(this._polls).forEach(function(ep) {
      var poll = self._polls[ep];
      if (!poll.timer) {
        poll.timer = setInterval(function() {
          self.get(ep, { maxAge: poll.maxAge });
        }, poll.intervalMs);
        // Immediate refresh on resume
        self.get(ep, { force: true });
      }
    });
    console.log('[FleetState] Resumed -- tab visible, refreshing active endpoints');
  },

  // ═══ CONNECTIVITY ═══

  /** Per-endpoint error info. Returns { error, errorCount } or null. */
  endpointStatus: function(endpoint) {
    var c = this._cache[endpoint];
    if (!c) return null;
    return { error: c.error, errorCount: c.errorCount || 0, fetchedAt: c.fetchedAt };
  },

  /** Global connectivity: true if all critical endpoints succeeded recently. */
  get connected() {
    var self = this;
    var criticals = Object.keys(this.ENDPOINTS).filter(function(ep) {
      return self.ENDPOINTS[ep].critical;
    });
    if (criticals.length === 0) return true;
    // OPERATOR P1 fix 2026-06-06 (UXIA): tri-state semantics. "No cache yet"
    // (initial load, fetch in-flight) is NOT broken -- it's loading. Previously
    // returned false for any endpoint without cached data, which caused a red
    // "Cannot reach coordinator API / 0/3 critical endpoints failing" banner
    // to flash on every page load before the first fetch returned. An endpoint
    // is only considered "broken" after >=3 consecutive errors.
    return criticals.every(function(ep) {
      var c = self._cache[ep];
      if (!c) return true;                  // never fetched -> assume ok (loading)
      return (c.errorCount || 0) < 3;       // broken only after 3+ failures
    });
  },

  /** Consecutive error count across all critical endpoints. */
  get criticalErrorCount() {
    var self = this;
    var total = 0;
    Object.keys(this.ENDPOINTS).forEach(function(ep) {
      if (self.ENDPOINTS[ep].critical && self._cache[ep]) {
        total += (self._cache[ep].errorCount || 0);
      }
    });
    return total;
  },

  // ═══ DATA FETCHING ═══

  /**
   * Fetch data from an endpoint with caching + dedup.
   * @param {string} endpoint - API path (e.g., '/api/fleet')
   * @param {object} opts - { maxAge: ms, force: bool }
   * @returns {Promise<any>} parsed response data
   */
  async get(endpoint, opts) {
    opts = opts || {};
    var reg = this.ENDPOINTS[endpoint];
    var maxAge = opts.maxAge || (reg ? reg.maxAgeMs : 15000);
    var force = opts.force || false;
    var cached = this._cache[endpoint];

    // Return fresh cache if available
    if (!force && cached && cached.data && (Date.now() - cached.fetchedAt) < maxAge) {
      return cached.data;
    }

    // Dedup: if a request is already in flight, piggyback on it
    if (cached && cached.promise) {
      return cached.promise;
    }

    // Fetch fresh data
    var self = this;
    var promise = API.get(endpoint).then(function(data) {
      self._cache[endpoint] = {
        data: data,
        fetchedAt: Date.now(),
        promise: null,
        error: null,
        errorCount: 0
      };
      self._notify(endpoint, data);
      return data;
    }).catch(function(err) {
      var prev = self._cache[endpoint];
      var count = (prev ? (prev.errorCount || 0) : 0) + 1;
      self._cache[endpoint] = {
        data: prev ? prev.data : null,
        fetchedAt: prev ? prev.fetchedAt : 0,
        promise: null,
        error: err,
        errorCount: count
      };
      self._notify(endpoint, prev ? prev.data : null);
      return prev ? prev.data : null;
    });

    // Store in-flight promise for dedup
    if (!this._cache[endpoint]) {
      this._cache[endpoint] = { data: null, fetchedAt: 0, promise: promise, error: null, errorCount: 0 };
    } else {
      this._cache[endpoint].promise = promise;
    }

    return promise;
  },

  /**
   * POST action and invalidate related cache entries.
   */
  async post(endpoint, body, invalidate) {
    var result = await API.post(endpoint, body);
    if (invalidate && invalidate.length) {
      var self = this;
      invalidate.forEach(function(ep) {
        if (self._cache[ep]) {
          self._cache[ep].fetchedAt = 0;
        }
      });
    }
    return result;
  },

  // ═══ SUBSCRIBE (with auto-poll) ═══

  /**
   * Subscribe to data changes on an endpoint.
   * If the endpoint is in ENDPOINTS registry, auto-starts polling on first subscriber.
   * Callback receives (data, endpoint) on every fetch completion.
   * Returns unsubscribe function.
   */
  subscribe: function(endpoint, callback) {
    if (!this._listeners[endpoint]) {
      this._listeners[endpoint] = [];
    }
    this._listeners[endpoint].push(callback);

    // Auto-start polling if registered and not already polling
    if (!this._polls[endpoint]) {
      var reg = this.ENDPOINTS[endpoint];
      if (reg) {
        this.startPolling(endpoint, reg.pollIntervalMs, reg.maxAgeMs);
      }
    }

    // Immediately call with cached data if available
    var cached = this._cache[endpoint];
    if (cached && cached.data) {
      try { callback(cached.data, endpoint); } catch (e) { console.warn('[FleetState] subscriber error:', e); }
    }

    // Return unsubscribe function that stops polling if no subscribers remain
    var self = this;
    var listeners = this._listeners[endpoint];
    return function() {
      var idx = listeners.indexOf(callback);
      if (idx >= 0) listeners.splice(idx, 1);
      // Stop polling if no subscribers left
      if (listeners.length === 0 && self._polls[endpoint]) {
        self.stopPolling(endpoint);
      }
    };
  },

  // ═══ POLLING ═══

  /**
   * Start polling an endpoint at a fixed interval.
   * Only one poll per endpoint -- subsequent calls update the interval.
   */
  startPolling: function(endpoint, intervalMs, maxAge) {
    this.stopPolling(endpoint);
    var self = this;
    maxAge = maxAge || intervalMs;
    var timer = null;
    if (!this._paused) {
      timer = setInterval(function() {
        self.get(endpoint, { maxAge: maxAge });
      }, intervalMs);
    }
    this._polls[endpoint] = {
      intervalMs: intervalMs,
      maxAge: maxAge,
      timer: timer
    };
    // Initial fetch (even when paused, do one fetch to populate cache)
    this.get(endpoint, { maxAge: maxAge });
  },

  /**
   * Stop polling an endpoint.
   */
  stopPolling: function(endpoint) {
    if (this._polls[endpoint]) {
      if (this._polls[endpoint].timer) {
        clearInterval(this._polls[endpoint].timer);
      }
      delete this._polls[endpoint];
    }
  },

  // ═══ CACHE HELPERS ═══

  /** Get cached data without fetching. Returns null if not cached. */
  cached: function(endpoint) {
    var c = this._cache[endpoint];
    return c ? c.data : null;
  },

  /** Get cache age in ms. Returns Infinity if not cached. */
  age: function(endpoint) {
    var c = this._cache[endpoint];
    return c && c.fetchedAt ? (Date.now() - c.fetchedAt) : Infinity;
  },

  /** True if cached data is older than its registered maxAge (or default 15s). */
  isStale: function(endpoint) {
    var reg = this.ENDPOINTS[endpoint];
    var maxAge = reg ? reg.maxAgeMs : 15000;
    return this.age(endpoint) > maxAge;
  },

  /** Invalidate (force stale) one or more endpoints. */
  invalidate: function(endpoints) {
    var self = this;
    if (typeof endpoints === 'string') endpoints = [endpoints];
    endpoints.forEach(function(ep) {
      if (self._cache[ep]) self._cache[ep].fetchedAt = 0;
    });
  },

  // ═══ REFRESH ═══

  /** Force-fetch a single endpoint and notify subscribers. */
  refresh: function(endpoint) {
    return this.get(endpoint, { force: true });
  },

  /**
   * Force-fetch ALL actively-polled endpoints. Returns structured results.
   * Use for "Refresh Now" button (wired in Phase 3).
   */
  refreshAll: function() {
    var self = this;
    var endpoints = Object.keys(this._polls);
    if (endpoints.length === 0) {
      // Fall back to all registered endpoints
      endpoints = Object.keys(this.ENDPOINTS);
    }
    var promises = endpoints.map(function(ep) {
      return self.get(ep, { force: true }).then(function(data) {
        return { endpoint: ep, ok: true, data: data, error: null };
      }).catch(function(err) {
        return { endpoint: ep, ok: false, data: null, error: err };
      });
    });
    return Promise.all(promises);
  },

  // ═══ DIAGNOSTICS ═══

  /** Summary of all cached endpoints for debugging. */
  status: function() {
    var self = this;
    var result = {};
    Object.keys(this._cache).forEach(function(ep) {
      var c = self._cache[ep];
      result[ep] = {
        hasData: !!c.data,
        ageMs: c.fetchedAt ? (Date.now() - c.fetchedAt) : null,
        error: c.error ? String(c.error) : null,
        errorCount: c.errorCount || 0,
        polling: !!self._polls[ep],
        subscribers: (self._listeners[ep] || []).length,
        stale: self.isStale(ep)
      };
    });
    return result;
  },

  // Internal: notify subscribers
  _notify: function(endpoint, data) {
    var listeners = this._listeners[endpoint] || [];
    listeners.forEach(function(cb) {
      try { cb(data, endpoint); } catch (e) { console.warn('[FleetState] subscriber error:', e); }
    });
  }
};

// Backward compat alias for existing consumers (cairn-panel, guestbook, taskboard)
var DataStore = FleetState;

// Initialize Page Visibility listener
FleetState.init();
