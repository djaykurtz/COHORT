/* Superdash v2 -- Components Helper (RFC-FDDB12 Phase 2)
 *
 * Shared UI component factory for all superdash panels.
 * Provides consistent card, badge, panel, and indicator patterns
 * so panels don't reinvent the wheel.
 *
 * Integrates with FleetState for stale-data and error state display.
 */

var Components = {

  // ═══ HTML HELPERS ═══

  /** Escape HTML entities to prevent XSS. */
  esc: function(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  /** Create a DOM element from an HTML string. */
  fromHtml: function(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  },

  // ═══ TIME FORMATTING ═══

  /** Relative time string (e.g., "3m ago", "2h ago"). */
  timeSince: function(isoStr) {
    if (!isoStr) return 'never';
    var secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (secs < 0) return 'future';
    if (secs < 60) return 'now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  },

  /** Duration string from seconds (e.g., "2h 15m"). */
  formatDuration: function(secs) {
    if (!secs && secs !== 0) return '--';
    if (secs < 60) return secs + 's';
    if (secs < 3600) return Math.floor(secs / 60) + 'm';
    return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  },

  // ═══ NODE HELPERS ═══

  /** Get node color from CONFIG. */
  nodeColor: function(nodeId) {
    return (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[nodeId]) || '#58a6ff';
  },

  /** Get host name for a node. */
  nodeHost: function(nodeId) {
    if (!CONFIG.HOSTS) return '??';
    for (var host in CONFIG.HOSTS) {
      if (CONFIG.HOSTS[host].indexOf(nodeId) !== -1) return host;
    }
    return '??';
  },

  // ═══ STATUS INDICATORS ═══

  /** Status dot HTML (colored circle). */
  statusDot: function(status, opts) {
    opts = opts || {};
    var size = opts.size || 8;
    var cls = 'status-dot ' + (status || '');
    return '<span class="' + cls + '" style="width:' + size + 'px;height:' + size
      + 'px;border-radius:50%;display:inline-block;flex-shrink:0" title="'
      + Components.esc(status) + '"></span>';
  },

  /** Status badge with text and color class. */
  statusBadge: function(text, colorClass) {
    colorClass = colorClass || '';
    return '<span class="comp-badge ' + colorClass + '">' + Components.esc(text) + '</span>';
  },

  /** Numeric count badge. */
  countBadge: function(count, opts) {
    opts = opts || {};
    var cls = 'comp-count-badge';
    if (opts.highlight && count > 0) cls += ' highlighted';
    return '<span class="' + cls + '">' + count + '</span>';
  },

  // ═══ STALE DATA BADGE (FleetState integration) ═══

  /** Stale-data warning badge. Shows when cached data exceeds TTL. */
  staleBadge: function(endpoint) {
    if (typeof FleetState === 'undefined') return '';
    if (!FleetState.isStale(endpoint)) return '';
    var age = FleetState.age(endpoint);
    var ageStr = age < 60000 ? Math.round(age / 1000) + 's' : Math.round(age / 60000) + 'm';
    return '<span class="comp-stale-badge" title="Data is ' + ageStr + ' old">'
      + '&#9888; stale (' + ageStr + ')</span>';
  },

  // ═══ ERROR BANNER (FleetState integration) ═══

  /** Error banner for coordinator-unreachable state. Returns HTML string. */
  errorBanner: function(opts) {
    opts = opts || {};
    var connected = true;
    var errorDetail = '';
    var failingCount = 0;
    var criticalsCount = 0;
    if (typeof FleetState !== 'undefined') {
      connected = FleetState.connected;
      if (!connected) {
        var criticals = Object.keys(FleetState.ENDPOINTS).filter(function(ep) {
          return FleetState.ENDPOINTS[ep].critical;
        });
        var failing = criticals.filter(function(ep) {
          var s = FleetState.endpointStatus(ep);
          return s && s.errorCount >= 3;
        });
        criticalsCount = criticals.length;
        failingCount = failing.length;
        errorDetail = failingCount + '/' + criticalsCount + ' critical endpoints failing';
      }
    }
    // OPERATOR P1 fix 2026-06-06 (UXIA): suppress banner if connected=false but
    // no endpoint has actually accumulated >=3 errors. Avoids the contradictory
    // "0/N critical endpoints failing" red banner during the initial-load
    // window before fetches return. forceShow still bypasses for explicit cases.
    if (!opts.forceShow && !connected && failingCount === 0) {
      return '';
    }
    if (opts.forceShow || !connected) {
      var msg = opts.message || 'Cannot reach coordinator API';
      return '<div class="comp-error-banner">'
        + '<span class="comp-error-icon">&#9888;</span>'
        + '<span class="comp-error-text">' + Components.esc(msg) + '</span>'
        + (errorDetail ? '<span class="comp-error-detail">' + Components.esc(errorDetail) + '</span>' : '')
        + '</div>';
    }
    return '';
  },

  // ═══ CARDS ═══

  /** Glass card with optional header and body content. */
  card: function(opts) {
    opts = opts || {};
    var cls = 'comp-card';
    if (opts.className) cls += ' ' + opts.className;
    if (opts.highlight) cls += ' comp-card-highlight';
    var style = opts.accentColor ? ' style="border-left:2px solid ' + opts.accentColor + '"' : '';

    var html = '<div class="' + cls + '"' + style + '>';
    if (opts.header) {
      html += '<div class="comp-card-header">';
      if (opts.icon) html += '<span class="comp-card-icon">' + opts.icon + '</span>';
      html += '<span class="comp-card-title">' + Components.esc(opts.header) + '</span>';
      if (opts.badge) html += opts.badge;
      if (opts.headerRight) html += '<span class="comp-card-header-right">' + opts.headerRight + '</span>';
      html += '</div>';
    }
    if (opts.body) {
      html += '<div class="comp-card-body">' + opts.body + '</div>';
    }
    html += '</div>';
    return html;
  },

  /** Key-value row for detail displays. */
  kvRow: function(label, value, opts) {
    opts = opts || {};
    var cls = 'comp-kv-row';
    var valCls = 'comp-kv-value';
    if (opts.status) valCls += ' ' + opts.status;
    return '<div class="' + cls + '">'
      + '<span class="comp-kv-label">' + Components.esc(label) + '</span>'
      + '<span class="' + valCls + '">' + value + '</span>'
      + '</div>';
  },

  // ═══ PANEL SETUP ═══

  /** Set up main panel header (title + badge). Returns content container. */
  setupPanel: function(title, badge) {
    var titleEl = document.getElementById('main-panel-title');
    var badgeEl = document.getElementById('main-panel-badge');
    if (titleEl) titleEl.textContent = title;
    if (badgeEl) badgeEl.textContent = badge || '';
    return document.getElementById('main-content');
  },

  /** Loading placeholder HTML. */
  loading: function(text) {
    return '<div class="loading-text">' + Components.esc(text || 'Loading...') + '</div>';
  },

  /** Empty state placeholder HTML. */
  empty: function(text) {
    return '<div class="empty-text">' + Components.esc(text || 'No data') + '</div>';
  },

  // ═══ PANEL LIFECYCLE ═══

  /**
   * Register a panel with FleetState subscription wiring.
   * Returns { unsubscribe, refresh } controls.
   *
   * Usage:
   *   var reg = Components.registerPanel({
   *     endpoints: ['/api/fleet', '/api/health'],
   *     onData: function(allData) { renderMyPanel(allData); },
   *     container: document.getElementById('my-panel')
   *   });
   *   // later: reg.unsubscribe() to clean up
   */
  registerPanel: function(opts) {
    if (typeof FleetState === 'undefined') {
      console.warn('[Components] FleetState not available -- panel registration skipped');
      return { unsubscribe: function() {}, refresh: function() {} };
    }

    var endpoints = opts.endpoints || [];
    var onData = opts.onData;
    var unsubs = [];
    var dataMap = {};

    function gather() {
      endpoints.forEach(function(ep) {
        dataMap[ep] = FleetState.cached(ep);
      });
      if (onData) {
        try { onData(dataMap); } catch (e) { console.warn('[Components] panel onData error:', e); }
      }
    }

    endpoints.forEach(function(ep) {
      var unsub = FleetState.subscribe(ep, function() { gather(); });
      unsubs.push(unsub);
    });

    return {
      unsubscribe: function() {
        unsubs.forEach(function(fn) { fn(); });
        unsubs = [];
      },
      refresh: function() {
        var promises = endpoints.map(function(ep) { return FleetState.refresh(ep); });
        return Promise.all(promises).then(gather);
      }
    };
  }
};
