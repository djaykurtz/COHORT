/* Superdash v2 -- Performance Guard + Auto-Maintenance
 * Prevents browser freeze by:
 * 1. Pausing ALL polling when tab is hidden (visibilitychange)
 * 2. Guarding App.refresh() against overlapping calls
 * 3. Skipping DOM rewrites when data hasn't changed (hash compare)
 * 4. Throttling SSE-triggered refreshes
 * 5. Auto-reload after MAX_UPTIME_MS of no user interaction
 * 6. Periodic cache cleanup (localStorage + SW API cache)
 * 7. Adaptive poll frequency based on SSE health
 */

var PerfGuard = {
  _hidden: false,
  _refreshInFlight: false,
  _pausedTimers: [],
  _lastFleetHash: '',
  _lastHealthHash: '',

  // Auto-maintenance state
  _bootTime: Date.now(),
  _lastUserAction: Date.now(),
  _maintenanceTimer: null,
  _cacheCleanTimer: null,
  MAX_UPTIME_MS: 4 * 60 * 60 * 1000,      // 4 hours max uptime
  IDLE_RELOAD_MS: 30 * 60 * 1000,          // reload if idle 30min AND uptime > 2h
  CACHE_CLEAN_INTERVAL: 10 * 60 * 1000,    // clean caches every 10 min
  SW_API_CACHE_MAX: 40,                     // max SW API cache entries

  init: function() {
    // Visibility change: pause/resume polling
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        PerfGuard.pause();
      } else {
        PerfGuard.resume();
      }
    });

    // Track user activity for idle detection
    var activityEvents = ['click', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(function(evt) {
      document.addEventListener(evt, function() {
        PerfGuard._lastUserAction = Date.now();
      }, { passive: true });
    });

    // Wrap App.refresh with in-flight guard
    var originalRefresh = App.refresh;
    App.refresh = async function() {
      if (PerfGuard._hidden) return;
      if (PerfGuard._refreshInFlight) {
        return;
      }
      PerfGuard._refreshInFlight = true;
      try {
        await originalRefresh.call(App);
      } finally {
        PerfGuard._refreshInFlight = false;
      }
    };

    // Increase SSE debounce from 1s to 5s to reduce cascade refreshes
    if (typeof SSE !== 'undefined') {
      var origHandleEvent = SSE.handleEvent;
      SSE.handleEvent = function(data) {
        var type = data.event_type || data.type || '';
        if (type === 'heartbeat' || type === 'keepalive') return;

        // Fire notifications (lightweight)
        origHandleEvent.call(SSE, data);

        // Override the refresh debounce -- use 5s to batch multiple rapid events
        if (SSE._refreshTimer) clearTimeout(SSE._refreshTimer);
        SSE._refreshTimer = setTimeout(function() {
          if (!PerfGuard._hidden && typeof App !== 'undefined' && App.refresh) {
            App.refresh();
          }
        }, 5000);
      };
    }

    // Start auto-maintenance watchdog (checks every 60s)
    PerfGuard._maintenanceTimer = setInterval(PerfGuard._maintenanceCheck, 60000);

    // Start periodic cache cleanup
    PerfGuard._cacheCleanTimer = setInterval(PerfGuard._cleanCaches, PerfGuard.CACHE_CLEAN_INTERVAL);
    // Initial cache clean on boot
    setTimeout(PerfGuard._cleanCaches, 5000);

    console.log('[PerfGuard] Initialized -- auto-maintenance active (max uptime ' +
      Math.round(PerfGuard.MAX_UPTIME_MS / 3600000) + 'h)');
  },

  // Auto-maintenance: reload if uptime too long and user idle
  _maintenanceCheck: function() {
    var uptime = Date.now() - PerfGuard._bootTime;
    var idle = Date.now() - PerfGuard._lastUserAction;

    // Hard limit: reload after MAX_UPTIME if tab hidden
    if (uptime > PerfGuard.MAX_UPTIME_MS && PerfGuard._hidden) {
      console.log('[PerfGuard] Max uptime reached while hidden -- reloading');
      location.reload();
      return;
    }

    // Soft limit: reload if uptime > 2h AND user idle > 30min AND tab hidden
    if (uptime > 2 * 60 * 60 * 1000 && idle > PerfGuard.IDLE_RELOAD_MS && PerfGuard._hidden) {
      console.log('[PerfGuard] Idle + stale -- reloading');
      location.reload();
      return;
    }

    // Adaptive polling: slow down polls when uptime is high
    if (uptime > 2 * 60 * 60 * 1000 && !PerfGuard._hidden) {
      PerfGuard._adaptiveSlow();
    }
  },

  // Slow down all poll timers when running long
  _adaptiveSlow: function() {
    // Double the App poll interval if not already slowed
    if (App.pollTimer && CONFIG.FLEET_POLL_INTERVAL < 120000) {
      clearInterval(App.pollTimer);
      App.pollTimer = setInterval(App.refresh, 120000);
    }
  },

  // Clean caches to prevent unbounded growth
  _cleanCaches: function() {
    // 1. Trim SW API cache
    PerfGuard._trimSWCache();

    // 2. Clean stale localStorage API cache entries (>1h old)
    PerfGuard._cleanLocalStorageCache();

    // 3. Clear performance resource timing buffer to prevent memory growth
    if (performance.clearResourceTimings) {
      performance.clearResourceTimings();
    }
  },

  _trimSWCache: function() {
    if (!('caches' in window)) return;
    caches.open('zb-api-v1').then(function(cache) {
      cache.keys().then(function(keys) {
        if (keys.length <= PerfGuard.SW_API_CACHE_MAX) return;
        // Evict oldest entries (first in = first out)
        var toEvict = keys.length - PerfGuard.SW_API_CACHE_MAX;
        console.log('[PerfGuard] Trimming SW API cache: removing ' + toEvict + ' of ' + keys.length);
        for (var i = 0; i < toEvict; i++) {
          cache.delete(keys[i]);
        }
      });
    }).catch(function() {});
  },

  _cleanLocalStorageCache: function() {
    var MAX_AGE = 60 * 60 * 1000; // 1 hour
    var staleKeys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('zb_meta_') === 0) {
        try {
          var meta = JSON.parse(localStorage.getItem(key));
          if (meta && meta.t && (Date.now() - meta.t) > MAX_AGE) {
            var endpoint = key.slice(8); // strip 'zb_meta_'
            staleKeys.push(key, 'zb_cache_' + endpoint);
          }
        } catch (e) { staleKeys.push(key); }
      }
    }
    if (staleKeys.length) {
      staleKeys.forEach(function(k) { localStorage.removeItem(k); });
      console.log('[PerfGuard] Cleaned ' + staleKeys.length + ' stale cache entries');
    }
  },

  pause: function() {
    PerfGuard._hidden = true;

    // Pause FleetState subscriber-driven polls
    if (typeof FleetState !== 'undefined') {
      FleetState._pause();
    }

    // Pause App poll timer
    if (App.pollTimer) {
      clearInterval(App.pollTimer);
      App.pollTimer = null;
    }

    // Pause FleetSections poll
    if (typeof FleetSections !== 'undefined' && FleetSections._pollTimer) {
      FleetSections.stopPolling();
    }

    // Pause SSE polling (but keep connection alive)
    if (typeof SSE !== 'undefined' && SSE._pollTimer) {
      clearInterval(SSE._pollTimer);
      SSE._pollTimer = null;
    }

    // Pause recovery polling (was previously unstoppable IIFE)
    if (typeof RecoveryPolling !== 'undefined') {
      RecoveryPolling.stop();
    }

    // ── SWAT-candidate findings A+B (superdash resource-efficiency pass,
    // 2026-08): the panel timers below were NOT covered by the pause/resume
    // pair above -- they kept firing fetch+render on hidden tabs regardless
    // of which tab/panel was active. Each check is defensive (typeof-guard +
    // method-exists guard) so a panel not yet loaded/mounted is a silent
    // no-op, matching the existing style in this function. ──
    if (typeof BusPanel !== 'undefined' && BusPanel._pollTimer) {
      BusPanel.stopPolling();
    }
    if (typeof CairnPanel !== 'undefined' && CairnPanel._autoRefreshTimer) {
      CairnPanel._stopAutoRefresh();
    }
    if (typeof ToolCostPanel !== 'undefined' && ToolCostPanel._pollTimer) {
      ToolCostPanel._stopPolling();
    }
    if (typeof ResilienceCard !== 'undefined' && ResilienceCard._pollTimer) {
      ResilienceCard._stopPolling();
    }
    if (typeof ToolFailures !== 'undefined' && ToolFailures._pollTimer) {
      ToolFailures.stopPolling();
    }
    if (typeof RecoveryPanel !== 'undefined' && RecoveryPanel._pollTimer) {
      RecoveryPanel.stopPolling();
    }
    if (typeof Cairn !== 'undefined' && Cairn.scratchRefreshTimer) {
      Cairn.stopScratchRefresh();
    }
    if (typeof BBPill !== 'undefined' && BBPill._timer) {
      clearInterval(BBPill._timer);
      BBPill._timer = null;
    }
    if (typeof FailureEpisodesPanel !== 'undefined' && FailureEpisodesPanel._timer) {
      clearInterval(FailureEpisodesPanel._timer);
      FailureEpisodesPanel._timer = null;
    }
    if (typeof Panels !== 'undefined' && Panels._fleetRefreshTicker) {
      Panels.stopFleetRefreshTicker();
    }
    if (typeof VersionStamp !== 'undefined' && VersionStamp.isActive()) {
      VersionStamp.stop();
    }
    if (typeof DeployStatusPill !== 'undefined' && DeployStatusPill.isActive && DeployStatusPill.isActive()) {
      DeployStatusPill.stop();
    }
    // App's
    // 1s clock tick previously ran unconditionally regardless of visibility.
    if (App.clockTimer) {
      App.stopClock();
    }

    // ── SWAT-candidate finding B (superdash resource-efficiency pass,
    // 2026-08): _cacheCleanTimer (10min full-localStorage-scan cache clean)
    // is NOT time-critical and safe to pause on hidden-tab. _maintenanceTimer
    // is DELIBERATELY left running even while hidden -- its own reload-when-
    // hidden-and-stale logic (MAX_UPTIME_MS / IDLE_RELOAD_MS checks in
    // _maintenanceCheck) is SPECIFICALLY designed to detect and clean up
    // long-hidden idle tabs; pausing it here would silently defeat that
    // existing feature. Only the redundant cache-scan work is paused. ──
    if (PerfGuard._cacheCleanTimer) {
      clearInterval(PerfGuard._cacheCleanTimer);
      PerfGuard._cacheCleanTimer = null;
    }
  },

  resume: function() {
    PerfGuard._hidden = false;
    PerfGuard._lastUserAction = Date.now();

    // Resume FleetState subscriber-driven polls
    if (typeof FleetState !== 'undefined') {
      FleetState._resume();
    }

    // Immediate refresh to catch up
    App.refresh();

    // Restart App poll timer
    if (!App.pollTimer) {
      App.pollTimer = setInterval(App.refresh, CONFIG.FLEET_POLL_INTERVAL);
    }

    // Restart FleetSections if on overview
    if (typeof FleetSections !== 'undefined' && FleetSections._mounted
        && App.currentTab === 'overview' && !FleetSections._pollTimer) {
      FleetSections.startPolling();
    }

    // Restart SSE poll
    if (typeof SSE !== 'undefined' && SSE.connected && !SSE._pollTimer && !SSE.source) {
      SSE._pollTimer = setInterval(SSE._poll, SSE._pollInterval);
    }

    // Resume recovery polling
    if (typeof RecoveryPolling !== 'undefined' && !RecoveryPolling.isActive()) {
      RecoveryPolling.start();
    }

    // Resume App's clock tick (finding G, folded in by UXIA)
    if (!App.clockTimer) {
      App.startClock();
    }

    // ── SWAT-candidate findings A+B (superdash resource-efficiency pass,
    // 2026-08): symmetric resume for the panel timers paused above. Each
    // panel only restarts its poll if it was actually mounted/active
    // (checked via the panel's own currently-active-tab guard where one
    // exists) to avoid resurrecting a timer for a panel the user isn't
    // even looking at -- matching the existing FleetSections restart-only-
    // if-on-overview guard immediately above. ──
    if (typeof BusPanel !== 'undefined' && App.currentTab === 'bus' && !BusPanel._pollTimer) {
      BusPanel.startPolling();
    }
    if (typeof CairnPanel !== 'undefined' && typeof Cairn !== 'undefined' && Cairn.open && !CairnPanel._autoRefreshTimer) {
      CairnPanel._startAutoRefresh();
    }
    if (typeof ToolCostPanel !== 'undefined' && !ToolCostPanel._pollTimer) {
      ToolCostPanel._startPolling();
    }
    if (typeof ResilienceCard !== 'undefined' && !ResilienceCard._pollTimer) {
      ResilienceCard._startPolling();
    }
    if (typeof ToolFailures !== 'undefined' && !ToolFailures._pollTimer) {
      ToolFailures.startPolling();
    }
    if (typeof RecoveryPanel !== 'undefined' && App.currentTab === 'recovery' && !RecoveryPanel._pollTimer) {
      RecoveryPanel.startPolling();
    }
    if (typeof Cairn !== 'undefined' && Cairn.open && (Cairn.activeTab === 'scratch' || Cairn.view === 'scratch') && !Cairn.scratchRefreshTimer) {
      Cairn.startScratchRefresh();
    }
    if (typeof BBPill !== 'undefined' && !BBPill._timer) {
      BBPill._timer = setInterval(BBPill.refresh, BBPill._POLL_MS);
    }
    if (typeof FailureEpisodesPanel !== 'undefined' && !FailureEpisodesPanel._timer && typeof FailureEpisodes !== 'undefined') {
      FailureEpisodesPanel._timer = setInterval(FailureEpisodesPanel.refresh.bind(FailureEpisodesPanel), FailureEpisodes.POLL_MS);
    }
    if (typeof Panels !== 'undefined' && !Panels._fleetRefreshTicker) {
      Panels.startFleetRefreshTicker();
    }
    if (typeof VersionStamp !== 'undefined' && !VersionStamp.isActive()) {
      VersionStamp.start();
    }
    if (typeof DeployStatusPill !== 'undefined' && DeployStatusPill.start && !(DeployStatusPill.isActive && DeployStatusPill.isActive())) {
      DeployStatusPill.start();
    }

    // Resume PerfGuard's own cache-clean watchdog (maintenance timer was
    // deliberately never paused -- see pause() comment above).
    if (!PerfGuard._cacheCleanTimer) {
      PerfGuard._cacheCleanTimer = setInterval(PerfGuard._cleanCaches, PerfGuard.CACHE_CLEAN_INTERVAL);
    }
  },

  // Hash utility for dirty-checking data before DOM rewrite
  // Avoids full JSON.stringify to reduce GC pressure on large objects
  quickHash: function(obj) {
    try {
      if (Array.isArray(obj)) {
        // For arrays (e.g., fleet.nodes): hash length + key fields of first/last items
        var len = obj.length;
        var first = obj[0] ? (obj[0].node_id || obj[0].id || obj[0].status || '') : '';
        var last = obj[len - 1] ? (obj[len - 1].last_seen || obj[len - 1].updated_at || obj[len - 1].status || '') : '';
        return len + '_' + first + '_' + last;
      }
      // For objects (e.g., health): hash key count + select fields
      var keys = Object.keys(obj);
      var sample = (obj.status || '') + '_' + (obj.uptime_seconds || '') + '_' + (obj.node_count || '') + '_' + (obj.updated_at || '');
      return keys.length + '_' + sample;
    } catch (e) {
      return '' + Date.now();
    }
  },

  // Expose uptime for status display
  uptimeMs: function() {
    return Date.now() - PerfGuard._bootTime;
  },

  idleMs: function() {
    return Date.now() - PerfGuard._lastUserAction;
  }
};
