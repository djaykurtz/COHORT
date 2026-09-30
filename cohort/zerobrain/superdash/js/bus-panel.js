/**
 * ZEROBRAIN Superdash -- Breath Bus Panel (Phase 3)
 * Live data from breathbus health endpoints + coordinator fleet API.
 * Per-rider health cards, alarm timeline, line status, host co-tenant grouping.
 */

var BusPanel = {
  _data: null,
  _pollTimer: null,
  _fleetNodes: null,

  // ═══ DATA FETCHING ═══
  async fetchHostHealth(hostName) {
    var cfg = CONFIG.BREATHBUS[hostName];
    if (!cfg) return { name: hostName, status: 'unconfigured', error: 'No breathbus config' };
    var url = 'http://' + cfg.ip + ':' + cfg.port + '/health';
    try {
      var resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      data.name = hostName;
      data._reachable = true;
      return data;
    } catch (e) {
      return { name: hostName, status: 'unreachable', error: e.message, _reachable: false,
               riders: CONFIG.HOSTS[hostName] || [], version: '--', uptime_seconds: 0 };
    }
  },

  // SWAT-superdash-perf-C: was a raw `fetch('/api/fleet')` bypassing
  // FleetState's cache/dedup entirely. Only reached as a fallback (see
  // refresh() below, which prefers App.lastFleet when available) but when it
  // IS reached -- e.g. Bus tab opened before the first App.refresh() completes
  // -- it now goes through FleetState.get() so it benefits from the same
  // caching/dedup/error-tracking as every other consumer of '/api/fleet'
  // instead of issuing an independent, uncoordinated network request.
  async fetchFleetNodes() {
    try {
      var data = await FleetState.get('/api/fleet');
      if (!data) return null;
      var map = {};
      (data.nodes || []).forEach(function(n) { map[n.node_id] = n; });
      return map;
    } catch (e) { return null; }
  },

  async refresh() {
    var hostNames = Object.keys(CONFIG.HOSTS);

    // Reuse fleet data from App if available (avoid redundant /api/fleet fetch)
    var fleetPromise;
    if (App.lastFleet && App.lastFleet.nodes) {
      var map = {};
      App.lastFleet.nodes.forEach(function(n) { map[n.node_id] = n; });
      fleetPromise = Promise.resolve(map);
    } else {
      fleetPromise = BusPanel.fetchFleetNodes();
    }

    var results = await Promise.allSettled([
      fleetPromise
    ].concat(hostNames.map(function(h) { return BusPanel.fetchHostHealth(h); })));

    BusPanel._fleetNodes = results[0].status === 'fulfilled' ? results[0].value : null;
    var hosts = [];
    for (var i = 0; i < hostNames.length; i++) {
      var h = results[i + 1].status === 'fulfilled' ? results[i + 1].value : { name: hostNames[i], status: 'error', error: 'fetch failed' };
      // Infer host status from fleet node heartbeats when direct health check fails
      if (!h._reachable && BusPanel._fleetNodes) {
        var riderIds = CONFIG.HOSTS[hostNames[i]] || [];
        var activeRiders = riderIds.filter(function(rid) {
          var n = BusPanel._fleetNodes[rid];
          return n && n.last_seen && (Date.now() - new Date(n.last_seen).getTime()) < 300000;
        });
        if (activeRiders.length > 0) {
          h._reachable = 'inferred';
          h.status = 'ok';
          h._inferred = true;
          h.rider_count = riderIds.length;
          h.error = null;
        }
      }
      hosts.push(h);
    }
    BusPanel._data = { hosts: hosts, fetchedAt: new Date().toISOString() };
    return BusPanel._data;
  },

  // ═══ PANEL LIFECYCLE ═══
  async renderPanel() {
    var container = document.getElementById('main-content');
    container.innerHTML = '<div class="bus-panel"><div class="loading-text">Connecting to Breath Bus…</div></div>';
    document.getElementById('main-panel-title').textContent = 'Breath Bus';
    document.getElementById('main-panel-badge').textContent = '';

    await BusPanel.refresh();
    BusPanel.render(container);
    BusPanel.startPolling();
  },

  startPolling() {
    BusPanel.stopPolling();
    BusPanel._pollTimer = setInterval(async function() {
      if (App.currentTab !== 'bus') { BusPanel.stopPolling(); return; }
      await BusPanel.refresh();
      var container = document.getElementById('main-content');
      if (container) BusPanel.render(container);
    }, CONFIG.BUS_POLL_INTERVAL);
  },

  stopPolling() {
    if (BusPanel._pollTimer) { clearInterval(BusPanel._pollTimer); BusPanel._pollTimer = null; }
  },

  // ═══ RENDERING ═══
  // SWAT-candidate finding D (superdash resource-efficiency pass, 2026-08):
  // this render previously did a full container.innerHTML= replace every poll
  // tick (30s, CONFIG.BUS_POLL_INTERVAL) even when host/rider data was
  // byte-identical to the prior tick. Adds a dirty-check guard matching the
  // proven pattern already used in taskboard.js: the "Last fetched: Ns ago"
  // footer text is deliberately EXCLUDED from the compared signature (it
  // changes every tick regardless of underlying data, which would defeat a
  // naive full-string compare -- same lesson as taskboard.js's volatile-
  // prefix split) and is instead updated in-place via its own element id
  // when the rest of the panel is unchanged.
  _lastRenderSig: null,

  render(container) {
    var data = BusPanel._data;
    if (!data || !data.hosts) { container.innerHTML = '<div class="bus-panel"><div class="loading-text">No data</div></div>'; return; }

    var html = '<div class="bus-panel">';
    var totalRiders = data.hosts.reduce(function(n, h) { return n + (Array.isArray(h.riders) ? h.riders.length : h.rider_count || 0); }, 0);

    // Fleet header with line status
    var lineStatus = BusPanel.computeLineStatus(data.hosts);
    html += '<div class="bus-header">';
    html += '  <div class="bus-header-left">';
    html += '    <span class="bus-header-icon">🚌</span>';
    html += '    <div>';
    html += '      <div class="bus-header-title">BREATH BUS</div>';
    html += '      <div class="bus-header-subtitle">Fleet Life Services · ' + data.hosts.length + ' hosts · ' + totalRiders + ' riders</div>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="bus-header-status">';
    html += '    <span class="bus-status-dot ' + lineStatus.cls + '"></span>';
    html += '    <span class="bus-status-label ' + lineStatus.cls + '">' + BusPanel.esc(lineStatus.text) + '</span>';
    html += '  </div>';
    html += '</div>';

    // Host cards with rider sub-cards
    html += '<div class="bus-hosts">';
    data.hosts.forEach(function(host) {
      html += BusPanel.renderHostCard(host);
    });
    html += '</div>';

    // The Line indicator
    html += BusPanel.renderLine(lineStatus);

    // OPERATOR 2026-06-04: Alarm summary scrapped (confusing + unused).
    // html += BusPanel.renderAlarmSummary(data.hosts);

    html += '</div>'; // close .bus-panel (footer appended separately below)

    var footerText = 'Last fetched: ' + BusPanel.timeAgo(data.fetchedAt) + ' · Auto-refresh ' + (CONFIG.BUS_POLL_INTERVAL / 1000) + 's';

    var domIsOurs = !!container.querySelector('.bus-panel');
    var unchanged = domIsOurs && (html === BusPanel._lastRenderSig);
    BusPanel._lastRenderSig = html;

    if (unchanged) {
      // Stable content identical to last tick -- update only the volatile
      // "time ago" footer text in place, skip the destructive innerHTML
      // rebuild of the whole panel (host cards, line indicator, etc.).
      var footerEl = container.querySelector('.bus-footer-meta');
      if (footerEl) {
        footerEl.textContent = footerText;
        return;
      }
      // No footer element found (unexpected) -- fall through to full rebuild.
    }

    // Insert the footer div (with its own id-able class) just before the
    // closing </div> of .bus-panel so future ticks can target it directly.
    html = html.slice(0, -6) + '<div class="bus-footer-meta">' + footerText + '</div></div>';
    container.innerHTML = html;
  },

  renderHostCard(host) {
    var reachable = host._reachable !== false;
    var inferred = host._inferred === true;
    var unhealthy = !reachable || (host.status !== 'ok' && host.status !== 'running');
    var statusText = reachable ? (inferred ? 'INFERRED OK' : (host.status || 'unknown').toUpperCase()) : 'UNREACHABLE';
    var badgeClass = reachable ? (inferred ? 'inferred' : (unhealthy ? 'degraded' : 'running')) : 'stopped';
    var riders = BusPanel.getRiders(host);

    var html = '<div class="bus-host-card' + (unhealthy ? ' unhealthy' : '') + '">';

    // Host header
    html += '<div class="bus-host-header">';
    html += '  <span class="bus-host-name">' + BusPanel.esc(host.name) + '</span>';
    html += '  <span class="bus-host-badge ' + badgeClass + '">' + statusText + '</span>';
    html += '</div>';

    // Host metrics
    html += '<div class="bus-host-metrics">';
    if (reachable && !inferred) {
      html += BusPanel.renderMetric('Uptime', BusPanel.formatUptime(host.uptime_seconds || 0));
      html += BusPanel.renderMetric('Version', host.version || '--');
      html += BusPanel.renderMetric('Riders', String(host.rider_count || riders.length));
      var hbOk = host.last_heartbeat_ok;
      html += BusPanel.renderMetric('Heartbeat', hbOk === true ? '✓ OK' : hbOk === false ? '✗ FAIL' : '--', hbOk === false ? 'error' : '');
    } else if (inferred) {
      html += BusPanel.renderMetric('Status', 'Riders active', 'ok');
      html += BusPanel.renderMetric('Riders', String(riders.length));
      html += BusPanel.renderMetric('Source', 'Fleet heartbeats');
      html += BusPanel.renderMetric('Heartbeat', '✓ via coordinator');
    } else {
      html += BusPanel.renderMetric('Status', 'No connection', 'error');
      html += BusPanel.renderMetric('Riders', String(riders.length) + ' (config)');
      html += BusPanel.renderMetric('Error', BusPanel.esc(host.error || '--'), 'warn');
      html += BusPanel.renderMetric('Heartbeat', '--');
    }
    html += '</div>';

    // Last heartbeat timestamp
    if (host.last_heartbeat) {
      html += '<div class="bus-host-hb-time">Last heartbeat: ' + BusPanel.timeAgo(host.last_heartbeat) + '</div>';
    }

    // Coordinator reachability
    if (reachable && host.coordinator_reachable !== undefined) {
      var crCls = host.coordinator_reachable ? 'confirmed' : 'failed';
      html += '<div class="bus-host-coord-status ' + crCls + '">';
      html += 'Coordinator: ' + (host.coordinator_reachable ? '✓ reachable' : '✗ unreachable');
      if (host.last_heartbeat_err) {
        html += ' <span class="bus-err-detail" title="' + BusPanel.esc(host.last_heartbeat_err) + '">ⓘ</span>';
      }
      html += '</div>';
    }

    // Per-rider cards
    html += '<div class="bus-rider-cards">';
    riders.forEach(function(riderId) {
      html += BusPanel.renderRiderCard(riderId, host);
    });
    html += '</div>';

    html += '</div>';
    return html;
  },

  renderRiderCard(riderId, host) {
    var node = BusPanel._fleetNodes ? BusPanel._fleetNodes[riderId] : null;
    var color = CONFIG.NODE_COLORS[riderId] || 'var(--accent)';
    var isOnline = node && node.status === 'online';
    var lastSeen = node ? node.last_seen : null;
    var stale = lastSeen && (Date.now() - new Date(lastSeen).getTime()) > 600000; // >10min

    var html = '<div class="bus-rider-card" style="border-left: 3px solid ' + color + '">';
    html += '<div class="bus-rider-header">';
    html += '  <span class="bus-rider-name">' + BusPanel.esc(riderId) + '</span>';
    var dotCls = !node ? 'unknown' : stale ? 'stale' : isOnline ? 'online' : 'offline';
    html += '  <span class="bus-rider-dot ' + dotCls + '" title="' + dotCls + '"></span>';
    html += '</div>';
    html += '<div class="bus-rider-meta">';
    if (node) {
      html += '<span>Role: ' + BusPanel.esc(node.role || '--') + '</span>';
      html += '<span>Seen: ' + BusPanel.timeAgo(lastSeen) + '</span>';
    } else {
      html += '<span>No fleet data</span>';
    }
    html += '</div>';

    // Empty chair indicator
    if (stale || (!isOnline && node)) {
      html += '<div class="bus-rider-empty-chair">🪑 EMPTY CHAIR</div>';
    }
    html += '</div>';
    return html;
  },

  renderMetric(label, value, cls) {
    return '<div class="bus-metric">' +
      '<span class="bus-metric-label">' + BusPanel.esc(label) + '</span>' +
      '<span class="bus-metric-value' + (cls ? ' ' + cls : '') + '">' + BusPanel.esc(value) + '</span>' +
      '</div>';
  },

  computeLineStatus(hosts) {
    var reachable = hosts.filter(function(h) { return h._reachable !== false; });
    var healthy = reachable.filter(function(h) { return h.status === 'ok' || h.status === 'running'; });
    var unreachableCount = hosts.length - reachable.length;
    var violations = [];

    hosts.forEach(function(h) {
      if (h._reachable === false) violations.push(h.name + ': unreachable');
      else if (!h._inferred && h.status !== 'ok' && h.status !== 'running') violations.push(h.name + ': ' + (h.status || 'unknown'));
      if (h.coordinator_reachable === false) violations.push(h.name + ': coordinator disconnected');
      if (h.last_heartbeat_ok === false) violations.push(h.name + ': last heartbeat failed');
    });

    if (violations.length === 0) return { cls: 'healthy', text: reachable.some(function(h) { return h._inferred; }) ? 'All Hosts Online (via fleet)' : 'All Hosts Online', violations: [] };
    if (healthy.length === 0) return { cls: 'down', text: 'All Hosts Down', violations: violations };
    return { cls: 'degraded', text: 'Degraded -- ' + violations.length + ' issue' + (violations.length > 1 ? 's' : ''), violations: violations };
  },

  renderLine(lineStatus) {
    var isClean = lineStatus.cls === 'healthy';
    var html = '<div class="bus-line ' + (isClean ? 'clean' : 'violation') + '">';
    html += '<span class="bus-line-icon">' + (isClean ? '✓' : '⚠') + '</span>';
    html += '<span class="bus-line-text">';
    if (isClean) {
      html += 'The Line: No violations detected';
    } else {
      html += 'THE LINE: ' + lineStatus.violations.map(BusPanel.esc).join(' · ');
    }
    html += '</span>';
    html += '</div>';
    return html;
  },

  renderAlarmSummary(hosts) {
    var reachableHosts = hosts.filter(function(h) { return h._reachable !== false; });
    if (reachableHosts.length === 0) return '';

    var html = '<div class="bus-alarms">';
    html += '<div class="bus-alarms-header">';
    html += '  <span class="bus-alarms-title">Alarm Summary</span>';
    html += '</div>';
    html += '<div class="bus-alarm-list">';

    reachableHosts.forEach(function(host) {
      var unread = host.last_inbox_unread || 0;
      var longPoll = host.long_poll_active;
      var hbOk = host.last_heartbeat_ok;

      html += '<div class="bus-alarm-item">';
      html += '  <span class="bus-alarm-host">' + BusPanel.esc(host.name) + '</span>';
      html += '  <span class="bus-alarm-desc">';
      html += 'Riders: ' + (host.rider_count || '?');
      html += ' · Unread: ' + unread;
      html += ' · Long-poll: ' + (longPoll ? '✓' : '✗');
      html += '</span>';
      var statusCls = hbOk ? 'confirmed' : 'failed';
      var statusText = hbOk ? '✓ heartbeat ok' : '✗ heartbeat fail';
      html += '  <span class="bus-alarm-status ' + statusCls + '">' + statusText + '</span>';
      html += '</div>';
    });

    html += '</div></div>';
    return html;
  },

  getRiders(host) {
    if (Array.isArray(host.riders)) {
      return host.riders.map(function(r) { return typeof r === 'string' ? r : r.node_id; });
    }
    return CONFIG.HOSTS[host.name] || [];
  },

  // ═══ UTILITIES ═══
  esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  },

  formatUptime(seconds) {
    if (!seconds) return '--';
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    if (d > 0) return d + 'd ' + h + 'h';
    var m = Math.floor((seconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  },

  timeAgo(iso) {
    if (!iso) return 'never';
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
  }
};
