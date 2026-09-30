/* ZEROBRAIN Superdash v2 -- Version Stamp Badge (SWAT-20260604-0014)
 *
 * Purpose: give OPERATOR self-diagnostic visibility for the
 * "shipped 17 times but invisible" cache-staleness pattern.
 *
 * The status-bar badge "#status-build" was a STATIC version string
 * that never updated. This module replaces it with a live badge that:
 *   1. Fetches /api/version (server-side: git SHA, branch, commit time,
 *      sw_cache_version-as-deployed)
 *   2. Reads SW.CACHE_VERSION via MessageChannel (client-side actual)
 *   3. Reads localStorage SWR rev + IndexedDB CairnCache rev (DataStore globals)
 *   4. Tracks last successful /api/* fetch timestamp (via fetch shim)
 *   5. Computes a color: GREEN (all fresh), YELLOW (>60s stale on any layer),
 *      RED (>5min stale, OR deployed≠served mismatch on SW or git SHA)
 *   6. Click-expands a diagnostic panel with deploy-tip vs served vs cache-layers
 *
 * Refs: SWAT-0013 (localStorage SWR root cause), SWAT-0014 (this swat,
 * deploy-gap visibility), UXIA pivot #45394, rubber-duck #45366 rec 5.
 */
(function () {
  'use strict';

  var REFRESH_INTERVAL_MS = 30 * 1000;     // re-poll /api/version every 30s
  var YELLOW_THRESHOLD_MS = 60 * 1000;     // any layer stale >60s
  var RED_THRESHOLD_MS    = 5 * 60 * 1000; // any layer stale >5min
  var API_FRESHNESS_KEY   = '__lastApiFetchAt';

  var state = {
    server: null,            // /api/version response (deploy-tip)
    swReported: null,        // CACHE_VERSION from running SW
    swStaticCount: 0,
    swApiCount: 0,
    lastApiFetchAt: 0,       // ms epoch of last successful /api/* response
    fetchedAt: 0,            // ms epoch of last /api/version success
    fetchError: null
  };

  /* ── fetch shim: stamp lastApiFetchAt on every /api/* success ── */
  function installFetchShim() {
    if (typeof window === 'undefined' || !window.fetch || window[API_FRESHNESS_KEY + '_installed']) {
      return;
    }
    window[API_FRESHNESS_KEY + '_installed'] = true;
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isApi = url.indexOf('/api/') !== -1;
      return origFetch(input, init).then(function (resp) {
        if (isApi && resp && resp.ok) {
          state.lastApiFetchAt = Date.now();
        }
        return resp;
      });
    };
  }

  /* ── server-side deploy facts ── */
  function fetchVersion() {
    return fetch('/api/version', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject('http ' + r.status); })
      .then(function (data) {
        state.server = data;
        state.fetchedAt = Date.now();
        state.fetchError = null;
        return data;
      })
      .catch(function (err) {
        state.fetchError = String(err);
        return null;
      });
  }

  /* ── client-side SW reality ── */
  function querySW() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var ch = new MessageChannel();
      var timer = setTimeout(function () { resolve(null); }, 1500);
      ch.port1.onmessage = function (ev) {
        clearTimeout(timer);
        var d = ev.data || {};
        state.swReported = d.version || null;
        state.swStaticCount = d.static_count || 0;
        state.swApiCount = d.api_count || 0;
        resolve(d);
      };
      try {
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATUS' }, [ch.port2]);
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  /* ── client-side cache layers (best-effort reads) ── */
  function readClientLayers() {
    var layers = {};
    try {
      // RFC408 localStorage SWR cache (if DataStore exposes it)
      if (window.DataStore && typeof window.DataStore.getRev === 'function') {
        layers.swr_rev = window.DataStore.getRev();
      }
    } catch (e) {}
    try {
      // IndexedDB CAIRN cache (if CairnCache module exposes it)
      if (window.CairnCache && typeof window.CairnCache.getRev === 'function') {
        layers.cairn_rev = window.CairnCache.getRev();
      }
    } catch (e) {}
    return layers;
  }

  /* ── compute color + reason ── */
  function evaluate() {
    var now = Date.now();
    var reasons = [];
    var worstAge = 0;

    // 1. /api/version fetch freshness
    if (state.fetchError) {
      reasons.push('version-api-error: ' + state.fetchError);
      return { color: 'red', reasons: reasons, age: Infinity };
    }
    if (state.fetchedAt) {
      worstAge = Math.max(worstAge, now - state.fetchedAt);
    }

    // 2. SW CACHE_VERSION vs server-deployed sw_cache_version
    if (state.server && state.server.sw_cache_version && state.swReported) {
      if (state.swReported !== state.server.sw_cache_version) {
        reasons.push('sw-mismatch: client=' + state.swReported + ' deployed=' + state.server.sw_cache_version);
        return { color: 'red', reasons: reasons, age: worstAge, mismatch: true };
      }
    }

    // 3. API-call freshness (when did any /api/* last succeed?)
    if (state.lastApiFetchAt) {
      worstAge = Math.max(worstAge, now - state.lastApiFetchAt);
    }

    var color = 'green';
    if (worstAge >= RED_THRESHOLD_MS) {
      color = 'red';
      reasons.push('worst-layer-age ' + Math.round(worstAge / 1000) + 's >= 5min');
    } else if (worstAge >= YELLOW_THRESHOLD_MS) {
      color = 'yellow';
      reasons.push('worst-layer-age ' + Math.round(worstAge / 1000) + 's >= 60s');
    } else {
      reasons.push('all layers fresh (worst=' + Math.round(worstAge / 1000) + 's)');
    }
    return { color: color, reasons: reasons, age: worstAge };
  }

  /* ── render badge + click-expand panel ── */
  function render() {
    var el = document.getElementById('status-build');
    if (!el) return;
    var v = evaluate();
    var sha = (state.server && state.server.git_sha_short) || '????';
    var sw = state.swReported || (state.server && state.server.sw_cache_version) || '?';
    var br = (state.server && state.server.git_branch) || '';

    // Color via inline border-color (so we don't need new CSS classes).
    var colorMap = { green: '#4ade80', yellow: '#facc15', red: '#f87171' };
    el.style.borderBottom = '2px solid ' + colorMap[v.color];
    el.style.cursor = 'pointer';
    el.title = 'SWAT-0014 version stamp -- click for diagnostics\n' + v.reasons.join('\n');
    el.textContent = sw + '/' + sha + (br && br !== 'master' ? ' (' + br + ')' : '');

    // Wire click-once to toggle diagnostic panel.
    if (!el._swat0014_wired) {
      el._swat0014_wired = true;
      el.addEventListener('click', toggleDiagnostic);
    }
  }

  function toggleDiagnostic() {
    var existing = document.getElementById('swat-0014-diag');
    if (existing) {
      existing.remove();
      return;
    }
    var layers = readClientLayers();
    var v = evaluate();
    var rows = [
      ['Color', v.color.toUpperCase()],
      ['Reasons', v.reasons.join(' | ')],
      ['─── Deploy (server-side) ───', ''],
      ['Git SHA',     (state.server && state.server.git_sha) || '(n/a)'],
      ['Git branch',  (state.server && state.server.git_branch) || '(n/a)'],
      ['Commit time', (state.server && state.server.git_commit_time) || '(n/a)'],
      ['Server up',   (state.server && state.server.server_started_iso) || '(n/a)'],
      ['Deployed SW', (state.server && state.server.sw_cache_version) || '(n/a)'],
      ['─── Served (client-side) ───', ''],
      ['Running SW',  state.swReported || '(no SW or no response)'],
      ['SW static cache entries', state.swStaticCount],
      ['SW API cache entries',    state.swApiCount],
      ['localStorage SWR rev',    layers.swr_rev || '(unavailable)'],
      ['IndexedDB CAIRN rev',     layers.cairn_rev || '(unavailable)'],
      ['Last /api/* fetch',       state.lastApiFetchAt ? new Date(state.lastApiFetchAt).toISOString() : '(none yet)'],
      ['Last /api/version fetch', state.fetchedAt ? new Date(state.fetchedAt).toISOString() : '(none yet)']
    ];

    var html = '<div style="font-family:monospace;font-size:11px;line-height:1.6;">';
    rows.forEach(function (r) {
      var k = r[0], val = r[1];
      if (k.indexOf('───') === 0) {
        html += '<div style="opacity:.6;margin:6px 0 2px;">' + k + '</div>';
      } else {
        html += '<div><span style="opacity:.7;display:inline-block;min-width:180px;">' + k + ':</span> <span>' + escapeHtml(String(val)) + '</span></div>';
      }
    });
    html += '<div style="margin-top:8px;opacity:.5;font-size:10px;">SWAT-20260604-0014 -- click badge again to dismiss</div>';
    html += '</div>';

    var panel = document.createElement('div');
    panel.id = 'swat-0014-diag';
    panel.style.cssText = [
      'position:fixed', 'bottom:48px', 'right:12px', 'z-index:99999',
      'background:rgba(15,18,28,.96)', 'color:#e4e6ef',
      'border:1px solid rgba(255,255,255,.1)', 'border-radius:6px',
      'padding:14px 18px', 'max-width:480px', 'box-shadow:0 8px 32px rgba(0,0,0,.5)',
      'backdrop-filter:blur(8px)'
    ].join(';');
    panel.innerHTML = html;
    document.body.appendChild(panel);

    // Click outside to close.
    setTimeout(function () {
      var dismiss = function (ev) {
        if (!panel.contains(ev.target) && ev.target.id !== 'status-build') {
          panel.remove();
          document.removeEventListener('click', dismiss, true);
        }
      };
      document.addEventListener('click', dismiss, true);
    }, 0);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── boot ── */
  function refresh() {
    Promise.all([fetchVersion(), querySW()]).then(render);
  }

  var _refreshTimer = null;

  function init() {
    installFetchShim();
    refresh();
    _refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
  }

  // SWAT-candidate finding A/B (superdash resource-efficiency pass, 2026-08):
  // this timer was previously an anonymous setInterval with no captured
  // reference, so it could never be paused on hidden-tab -- exposing
  // stop/start (same pattern as recovery.js's window.RecoveryPolling) so
  // PerfGuard can register it.
  window.VersionStamp = {
    stop: function () { if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; } },
    start: function () { if (!_refreshTimer) { refresh(); _refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS); } },
    isActive: function () { return !!_refreshTimer; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
