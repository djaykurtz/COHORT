/**
 * ZEROBRAIN Superdash -- Fleet Sections (Collapsible Modular Layout)
 * Merges Nodes, Breath Bus, and Recovery into the Fleet tab as collapsible sections.
 */

var FleetSections = {
  _mounted: false,
  _pollTimer: null,
  _POLL_MS: 120000,  // 120s -- bus health only; resilience uses App.lastFleet
  _state: {},  // { nodes: true, bus: false, recovery: false }

  // Load persisted expand/collapse state
  _loadState: function() {
    try {
      var saved = localStorage.getItem('superdash.fleetSections.v1');
      if (saved) {
        FleetSections._state = JSON.parse(saved);
      } else {
        FleetSections._state = { resilience: true, backup: false, bus: false, auth: false };
      }
      // Migration: existing users may have saved state without 'auth' key
      if (typeof FleetSections._state.auth === 'undefined') {
        FleetSections._state.auth = false;
      }
    } catch (e) {
      FleetSections._state = { resilience: true, bus: false, auth: false };
    }
  },

  _saveState: function() {
    try {
      localStorage.setItem('superdash.fleetSections.v1', JSON.stringify(FleetSections._state));
    } catch (e) { /* ignore */ }
  },

  // ═══ MOUNT / INIT ═══
  init: function(container) {
    FleetSections._loadState();

    // OPERATOR 2026-06-04: Resilience Grid dropped (data lives in left node cards).
    // Auth Events moved to Authorization tab (Guestbook section).
    // Breath Bus kept but hidden behind a Legacy toggle (collapsed by default;
    // BB status now surfaces in top-bar pill).
    var html = '';
    html += '<div class="fleet-legacy-wrap collapsed" id="fleet-legacy-wrap">';
    html += '  <button class="fleet-legacy-toggle" id="fleet-legacy-toggle" type="button" aria-expanded="false">';
    html += '    <span class="fleet-legacy-chevron">▸</span>';
    html += '    <span class="fleet-legacy-label">Show legacy sections</span>';
    html += '  </button>';
    html += '  <div class="fleet-legacy-body" id="fleet-legacy-body" hidden>';
    html += FleetSections._sectionShell('bus', '🚌', 'Breath Bus (legacy)', '');
    html += '  </div>';
    html += '</div>';

    container.innerHTML = '<div class="fleet-sections" id="fleet-sections">' + html + '</div>';
    FleetSections._mounted = true;

    // Legacy reveal toggle
    var legacyBtn = document.getElementById('fleet-legacy-toggle');
    if (legacyBtn) {
      legacyBtn.addEventListener('click', function() {
        var wrap = document.getElementById('fleet-legacy-wrap');
        var body = document.getElementById('fleet-legacy-body');
        var expanded = wrap.classList.toggle('collapsed') === false;
        legacyBtn.setAttribute('aria-expanded', String(expanded));
        if (body) body.hidden = !expanded;
        var chev = legacyBtn.querySelector('.fleet-legacy-chevron');
        if (chev) chev.textContent = expanded ? '▾' : '▸';
        var label = legacyBtn.querySelector('.fleet-legacy-label');
        if (label) label.textContent = expanded ? 'Hide legacy sections' : 'Show legacy sections';
        if (expanded) FleetSections._renderAll();
      });
    }

    // Bind section header click handlers (Bus only)
    document.querySelectorAll('.fleet-section-header').forEach(function(el) {
      el.addEventListener('click', function() {
        var section = el.parentElement.getAttribute('data-section');
        FleetSections.toggle(section);
      });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var section = el.parentElement.getAttribute('data-section');
          FleetSections.toggle(section);
        }
      });
    });

    // Don't auto-load anything; legacy panel is collapsed by default.
    // (Bus summary still polled passively for BB pill via separate module.)
  },

  _sectionShell: function(name, icon, title, badge) {
    var expanded = FleetSections._state[name] !== false;
    var cls = expanded ? ' expanded' : '';
    return '<div class="fleet-section' + cls + '" data-section="' + name + '">'
      + '<button class="fleet-section-header" aria-expanded="' + expanded + '" aria-controls="fleet-body-' + name + '">'
      + '  <span class="fleet-section-chevron">▸</span>'
      + '  <span class="fleet-section-icon">' + icon + '</span>'
      + '  <span class="fleet-section-title">' + title + '</span>'
      + '  <span class="fleet-section-badge" id="fleet-badge-' + name + '">' + badge + '</span>'
      + '  <span class="fleet-section-status" id="fleet-status-' + name + '"></span>'
      + '</button>'
      + '<div class="fleet-section-body" id="fleet-body-' + name + '">'
      + '  <div class="loading-text">Loading...</div>'
      + '</div>'
      + '</div>';
  },

  // ═══ TOGGLE ═══
  toggle: function(name) {
    var section = document.querySelector('.fleet-section[data-section="' + name + '"]');
    if (!section) return;

    var expanded = section.classList.toggle('expanded');
    FleetSections._state[name] = expanded;
    FleetSections._saveState();

    var header = section.querySelector('.fleet-section-header');
    if (header) header.setAttribute('aria-expanded', String(expanded));

    // If just expanded, render fresh content
    if (expanded) {
      FleetSections._renderSection(name);
    }
  },

  isExpanded: function(name) {
    return FleetSections._state[name] === true;
  },

  // Expand a section programmatically (e.g., from redirected tab switch)
  expand: function(name) {
    if (!FleetSections._state[name]) {
      FleetSections.toggle(name);
    }
  },

  // ═══ RENDERING ═══
  _renderAll: function() {
    // Resilience + Auth removed (lives elsewhere). Bus is the only legacy section.
    FleetSections._refreshBusSummary();
    if (FleetSections._state.bus) FleetSections._renderSection('bus');
  },

  _renderSection: function(name) {
    switch (name) {
      case 'resilience':
        FleetSections.renderResilience();
        break;
      case 'bus':
        FleetSections.renderBus();
        break;
      case 'auth':
        FleetSections.renderAuth();
        break;
    }
  },

  // ── Resilience Grid ──
  renderResilience: function(nodes) {
    var body = document.getElementById('fleet-body-resilience');
    if (!body) return;

    var nodeList = nodes || (App.lastFleet && App.lastFleet.nodes) || [];
    if (!nodeList.length) {
      body.innerHTML = '<div class="empty-text">No fleet data available</div>';
      FleetSections._setBadge('resilience', '--', 'unknown');
      return;
    }

    // Group nodes by host
    var hostGroups = {};
    var hostOrder = Object.keys(CONFIG.HOSTS || {});
    nodeList.forEach(function(node) {
      var host = FleetSections._getNodeHost(node.node_id);
      if (!hostGroups[host]) hostGroups[host] = [];
      hostGroups[host].push(node);
    });

    var html = '<div class="resilience-grid">';
    var greenCount = 0, totalCount = 0;

    // Render in host order, then any ungrouped
    var rendered = {};
    hostOrder.forEach(function(host) {
      if (hostGroups[host]) {
        html += FleetSections._renderHostGroup(host, hostGroups[host]);
        hostGroups[host].forEach(function(n) {
          totalCount++;
          if (FleetSections._nodeState(n) === 'green') greenCount++;
        });
        rendered[host] = true;
      }
    });
    // Any remaining (ungrouped nodes)
    Object.keys(hostGroups).forEach(function(host) {
      if (!rendered[host]) {
        html += FleetSections._renderHostGroup(host, hostGroups[host]);
        hostGroups[host].forEach(function(n) {
          totalCount++;
          if (FleetSections._nodeState(n) === 'green') greenCount++;
        });
      }
    });

    html += '</div>';
    body.innerHTML = html;

    // Wire click handlers
    body.querySelectorAll('.resilience-tile').forEach(function(tile) {
      tile.addEventListener('click', function() {
        var nodeId = tile.getAttribute('data-node');
        if (nodeId) Nodes.selectNode(nodeId);
      });
    });

    // Badge
    var status = greenCount === totalCount ? 'ok' : (greenCount > totalCount / 2 ? 'degraded' : 'critical');
    FleetSections._setBadge('resilience', greenCount + '/' + totalCount + ' green', status);
  },

  _getNodeHost: function(nodeId) {
    var hosts = CONFIG.HOSTS || {};
    for (var host in hosts) {
      if (hosts[host].indexOf(nodeId) !== -1) return host;
    }
    return 'Unknown';
  },

  _nodeState: function(node) {
    // RED: empty_chair or stale/offline
    if (node.empty_chair === true) return 'red';
    if (node.lifecycle_state === 'stale') return 'red';
    if (node.last_seen) {
      var age = (Date.now() - new Date(node.last_seen).getTime()) / 1000;
      if (age > 600) return 'red';
    } else {
      return 'red';
    }
    // YELLOW: has pending unread
    if (node.oldest_unread_age_s && node.oldest_unread_age_s > 0) return 'yellow';
    // GREEN: healthy
    return 'green';
  },

  _renderHostGroup: function(hostName, nodes) {
    var html = '<div class="resilience-host-group">';
    html += '<div class="resilience-host-label">' + hostName + '</div>';
    html += '<div class="resilience-host-tiles">';
    nodes.forEach(function(node) {
      var state = FleetSections._nodeState(node);
      var color = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[node.node_id]) || '#58a6ff';
      var lastSeen = Nodes.timeSince(node.last_seen);
      var stateEmoji = state === 'green' ? '🟢' : state === 'yellow' ? '🟡' : '🔴';
      var stateDetail = '';
      if (state === 'yellow') stateDetail = 'unread:' + Math.round(node.oldest_unread_age_s) + 's';
      else if (state === 'red' && node.empty_chair) stateDetail = 'EMPTY CHAIR';
      else if (state === 'red') stateDetail = lastSeen;
      else stateDetail = lastSeen;

      html += '<div class="resilience-tile state-' + state + '" data-node="' + node.node_id + '">';
      html += '  <div class="resilience-tile-header">';
      html += '    <span class="resilience-node-name" style="color:' + color + '">' + node.node_id + '</span>';
      html += '    <span class="resilience-state-dot">' + stateEmoji + '</span>';
      html += '  </div>';
      html += '  <div class="resilience-tile-meta">';
      html += '    <span class="resilience-role">' + (node.role || '--') + '</span>';
      html += '    <span class="resilience-detail">' + stateDetail + '</span>';
      html += '  </div>';

      // WI-1 (RFC548x1 v1 / bundle-3 pickup): surface checkpoint_count, active_work_turns,
      // last_molted from /api/fleet. Per renderAuth precedent (line 339): idle-cycle pickup of
      // fields emitted by coordinator get_fleet_status but previously unread by the frontend.
      // Defensive: each pill hides when value undefined or zero; row hides when all pills hidden.
      var ckpt = (typeof node.checkpoint_count === 'number' && node.checkpoint_count > 0) ? node.checkpoint_count : null;
      var turns = (typeof node.active_work_turns === 'number' && node.active_work_turns > 0) ? node.active_work_turns : null;
      var molt = null;
      if (node.last_molted) {
        var _t = Nodes.timeSince(node.last_molted);
        molt = (typeof _t === 'string' && _t.indexOf('NaN') < 0) ? _t : null;
      }
      if (ckpt !== null || turns !== null || molt !== null) {
        html += '  <div class="resilience-tile-routing">';
        if (ckpt !== null) html += '<span class="routing-pill" title="checkpoint count">ckpt:' + ckpt + '</span>';
        if (turns !== null) html += '<span class="routing-pill" title="active work turns">turns:' + turns + '</span>';
        if (molt !== null) html += '<span class="routing-pill" title="time since last MOLT">molt:' + molt + '</span>';
        html += '  </div>';
      }

      html += '</div>';
    });
    html += '</div></div>';
    return html;
  },

  // ── Breath Bus ──
  _busLoadStep: function(pct, label) {
    var fill = document.getElementById('bus-loading-fill');
    var lbl = document.getElementById('bus-loading-label');
    if (fill) fill.style.width = pct + '%';
    if (lbl) lbl.textContent = label;
  },

  async renderBus() {
    var body = document.getElementById('fleet-body-bus');
    if (!body) return;
    body.innerHTML = '<div class="bus-loading" id="bus-loading">'
      + '<div class="bus-loading-bar"><div class="bus-loading-fill" id="bus-loading-fill"></div></div>'
      + '<div class="bus-loading-label" id="bus-loading-label">Connecting to Breath Bus…</div>'
      + '</div>';

    FleetSections._busLoadStep(15, 'Connecting to Breath Bus…');
    await BusPanel.refresh();
    FleetSections._busLoadStep(80, 'Rendering host data…');

    if (!BusPanel._data || !BusPanel._data.hosts) {
      body.innerHTML = '<div class="empty-text">No bus data available</div>';
      return;
    }

    FleetSections._busLoadStep(100, 'Done');
    var loader = document.getElementById('bus-loading');
    if (loader) loader.classList.add('done');
    await new Promise(function(r) { setTimeout(r, 300); });

    var tempDiv = document.createElement('div');
    BusPanel.render(tempDiv);
    body.innerHTML = tempDiv.innerHTML;
    FleetSections._updateBusBadge();
  },

  async _refreshBusSummary() {
    await BusPanel.refresh();
    FleetSections._updateBusBadge();
  },

  _updateBusBadge: function() {
    if (!BusPanel._data || !BusPanel._data.hosts) {
      FleetSections._setBadge('bus', '--', 'unknown');
      return;
    }
    var hosts = BusPanel._data.hosts;
    var reachable = hosts.filter(function(h) { return h._reachable !== false; }).length;
    var total = hosts.length;
    var totalRiders = hosts.reduce(function(n, h) { return n + (h.rider_count || 0); }, 0);
    var status = reachable === total ? 'ok' : (reachable > 0 ? 'degraded' : 'critical');
    FleetSections._setBadge('bus', reachable + '/' + total + ' hosts · ' + totalRiders + ' riders', status);

    // Auto-expand if critical
    var section = document.querySelector('.fleet-section[data-section="bus"]');
    if (section) {
      section.classList.toggle('critical', status === 'critical');
      section.classList.toggle('degraded', status === 'degraded');
    }
  },

  // ── Auth Events (RFC376 D4c breakglass observability, RFC421 contract-drift fix) ──
  // Surfaces `breakglass_overrides_24h` from /api/fleet -- emitted by coordinator
  // get_fleet_status() but previously unread by the frontend. Idle-cycle pickup work.
  renderAuth: function(fleet) {
    var data = fleet || App.lastFleet;
    var count = (data && typeof data.breakglass_overrides_24h === 'number')
      ? data.breakglass_overrides_24h
      : null;
    var body = document.getElementById('fleet-body-auth');

    if (count === null) {
      FleetSections._setBadge('auth', '--', 'unknown');
      if (body) body.innerHTML = '<div class="empty-text">No auth data available</div>';
      return;
    }

    var badgeStatus = count === 0 ? 'ok' : (count <= 3 ? 'degraded' : 'critical');
    FleetSections._setBadge('auth', count + ' / 24h', badgeStatus);

    // Auto-elevate critical so OPERATOR sees the burst even if collapsed
    var section = document.querySelector('.fleet-section[data-section="auth"]');
    if (section) {
      section.classList.toggle('critical', badgeStatus === 'critical');
      section.classList.toggle('degraded', badgeStatus === 'degraded');
    }

    if (body) {
      var statusLabel = count === 0
        ? 'No OPERATOR breakglass overrides in the last 24 hours.'
        : count + ' OPERATOR breakglass override' + (count === 1 ? '' : 's') + ' in the last 24 hours.';
      body.innerHTML = '<div class="auth-events-body">'
        + '<div class="auth-counter ' + badgeStatus + '" style="font-size:28px;font-weight:600;padding:8px 0;">'
        + count
        + ' <span style="font-size:12px;font-weight:400;color:var(--text-secondary);">breakglass overrides (24h)</span>'
        + '</div>'
        + '<div class="auth-events-detail" style="margin:6px 0;">' + statusLabel + '</div>'
        + '<div class="auth-events-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:8px;">'
        + 'RFC376 D4c: counts audit_log events with event_type=emergency_operator_override '
        + '(OPERATOR-token writes bypassing normal auth). Surfaced via RFC421 contract-drift fix.'
        + '</div>'
        + '</div>';
    }
  },

  // ── Recovery -- REMOVED per OPERATOR request (dead weight, pg-recover never existed) ──

  // ═══ BADGE HELPER ═══
  _setBadge: function(name, text, statusClass) {
    var badge = document.getElementById('fleet-badge-' + name);
    var dot = document.getElementById('fleet-status-' + name);
    if (badge) badge.textContent = text;
    if (dot) {
      dot.className = 'fleet-section-status ' + (statusClass || '');
    }
  },

  // ═══ POLLING ═══
  startPolling: function() {
    FleetSections.stopPolling();
    FleetSections._pollTimer = setInterval(async function() {
      if (App.currentTab !== 'overview') {
        FleetSections.stopPolling();
        return;
      }
      // Bus summary only -- resilience grid is updated by App.refresh() via renderResilience
      await FleetSections._refreshBusSummary();
      if (FleetSections._state.bus) {
        var busBody = document.getElementById('fleet-body-bus');
        if (busBody && BusPanel._data) {
          var tempDiv = document.createElement('div');
          BusPanel.render(tempDiv);
          busBody.innerHTML = tempDiv.innerHTML;
        }
      }
    }, FleetSections._POLL_MS);
  },

  stopPolling: function() {
    if (FleetSections._pollTimer) {
      clearInterval(FleetSections._pollTimer);
      FleetSections._pollTimer = null;
    }
  },

  // ═══ CLEANUP ═══
  destroy: function() {
    FleetSections.stopPolling();
    FleetSections._mounted = false;
  }
};
