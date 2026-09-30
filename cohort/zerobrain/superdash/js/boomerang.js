/* Superdash v2 -- Boomerang Work Queue Panel (RFC-BDD71A)
 *
 * Three views: Catch Queue (node), Escalation Queue (PM), Metrics (OPERATOR)
 * Mock data until backend ships GET /api/boomerangs
 * Uses FleetState + Components helpers
 */

var Boomerang = {
  data: null,
  _subscribed: false,
  currentView: 'catch',  // catch | escalation | metrics
  ENDPOINT: '/api/boomerangs',

  // Mock data until ZBPRIME ships the backend
  MOCK: {
    items: [
      { id: 'boom-001', task_id: 'fddb12-panel-taskboard', title: 'Build Task Board panel', assigned_to: 'NIMBUS', thrown_by: 'TEMPO', thrown_at: new Date(Date.now() - 3600000).toISOString(), deadline: new Date(Date.now() + 7200000).toISOString(), status: 'active', priority: 1, scope: 'Full kanban with write actions' },
      { id: 'boom-002', task_id: 'fddb12-panel-messages', title: 'Build Message Inbox panel', assigned_to: 'NIMBUS', thrown_by: 'TEMPO', thrown_at: new Date(Date.now() - 1800000).toISOString(), deadline: new Date(Date.now() + 10800000).toISOString(), status: 'active', priority: 2, scope: 'FleetState retrofit + Components' },
      { id: 'boom-003', task_id: 'boomerang-superdash-panels', title: 'Boomerang WQ superdash panels', assigned_to: 'NIMBUS', thrown_by: 'TEMPO', thrown_at: new Date(Date.now() - 300000).toISOString(), deadline: new Date(Date.now() + 14400000).toISOString(), status: 'active', priority: 1, scope: 'Catch queue, escalation view, metrics' },
      { id: 'boom-004', task_id: 'breathbus-mailman-impl', title: 'Implement Mailman delivery model', assigned_to: 'ZBPRIME', thrown_by: 'TEMPO', thrown_at: new Date(Date.now() - 600000).toISOString(), deadline: new Date(Date.now() + 3600000).toISOString(), status: 'active', priority: 2, scope: 'Daemon batching + heartbeat offload' },
      { id: 'boom-005', task_id: 'pm-fleet-health-monitor', title: 'Fleet health monitoring', assigned_to: 'TEMPO', thrown_by: 'OPERATOR', thrown_at: new Date(Date.now() - 86400000).toISOString(), deadline: new Date(Date.now() - 3600000).toISOString(), status: 'overdue', priority: 1, scope: 'Continuous fleet health checks' },
      { id: 'boom-006', task_id: 'cairn-archive-cleanup', title: 'CAIRN archive cleanup', assigned_to: 'QUATTRO', thrown_by: 'TEMPO', thrown_at: new Date(Date.now() - 7200000).toISOString(), deadline: new Date(Date.now() + 36000000).toISOString(), status: 'active', priority: 3, scope: 'Purge stale drafts, archive old RFCs' },
    ],
    wip_caps: { NIMBUS: 5, ZBPRIME: 5, TEMPO: 5, QUATTRO: 5, UXIA: 5, DRAGON: 5 },
    stats: { overdue_pct: 8, avg_return_hours: 4.2, total_thrown: 42, total_returned: 36 }
  },

  // -- Data --

  async load() {
    // Subscribe for live updates once, regardless of which data path wins.
    // Must run on real-API-success path too (was previously gated to mock-fallback only --
    // meant the common case never got live updates).
    if (!Boomerang._subscribed) {
      Boomerang._subscribed = true;
      DataStore.subscribe(Boomerang.ENDPOINT, function(data) {
        if (data && data.items) {
          Boomerang.data = data;
          Boomerang._usingMock = false;
        }
        if (App.currentTab === 'boomerang') Boomerang.renderPanel();
      });
    }

    // Try real API first, fall back to mock
    try {
      var result = await DataStore.get(Boomerang.ENDPOINT, { maxAge: 15000 });
      if (result && result.items) {
        Boomerang.data = result;
        Boomerang._usingMock = false;
        return Boomerang.data;
      }
    } catch(e) {
      console.warn('[Boomerang] API unavailable, using mock data:', e.message || e);
      Boomerang._apiError = e.message || 'Connection failed';
    }

    Boomerang.data = Boomerang.MOCK;
    Boomerang._usingMock = true;
    return Boomerang.data;
  },

  // -- Render --

  renderPanel: function() {
    var content = Components.setupPanel('Boomerang Queue', '');

    if (!Boomerang.data) {
      content.innerHTML = Components.loading('Loading boomerangs...');
      Boomerang.load().then(function() { Boomerang.renderPanel(); });
      return;
    }

    var items = Boomerang.data.items || [];
    var active = items.filter(function(i) { return i.status === 'active' || i.status === 'overdue'; });
    var overdue = items.filter(function(i) { return i.status === 'overdue' || new Date(i.deadline) < new Date(); });

    var badgeEl = document.getElementById('main-panel-badge');
    if (badgeEl) badgeEl.textContent = active.length + ' in flight' + (overdue.length ? ' \u00b7 ' + overdue.length + ' overdue' : '');

    var html = Components.errorBanner();

    // Mock data warning banner
    if (Boomerang._usingMock) {
      var errMsg = Boomerang._apiError
        ? 'Using mock data (API: ' + Components.esc(Boomerang._apiError) + ')'
        : 'Using mock data -- backend not yet available';
      html += '<div class="comp-error-banner" style="background:rgba(210,153,34,0.1);border-color:var(--warning,#d29922)">'
        + '<span class="comp-error-icon" style="color:var(--warning,#d29922)">&#9888;</span>'
        + '<span class="comp-error-text" style="color:var(--warning,#d29922)">' + errMsg + '</span>'
        + '</div>';
    }

    // View tabs
    html += '<div class="boom-tabs">'
      + '<button class="boom-tab' + (Boomerang.currentView === 'catch' ? ' active' : '') + '" onclick="Boomerang.switchView(\'catch\')">Catch Queue</button>'
      + '<button class="boom-tab' + (Boomerang.currentView === 'escalation' ? ' active' : '') + '" onclick="Boomerang.switchView(\'escalation\')">Escalation</button>'
      + '<button class="boom-tab' + (Boomerang.currentView === 'metrics' ? ' active' : '') + '" onclick="Boomerang.switchView(\'metrics\')">Metrics</button>'
      + '</div>';

    // WIP indicators
    html += Boomerang._renderWipBar(items);

    switch (Boomerang.currentView) {
      case 'catch': html += Boomerang._renderCatchQueue(items); break;
      case 'escalation': html += Boomerang._renderEscalation(items); break;
      case 'metrics': html += Boomerang._renderMetrics(items); break;
    }

    // Mock data notice (only when using mock fallback)
    if (Boomerang._usingMock) {
      html += '<div style="margin-top:12px;padding:6px 10px;font-size:9px;color:var(--text-tertiary);font-family:\'JetBrains Mono\',monospace;text-align:center;border-top:1px solid var(--glass-border)">'
        + 'Mock data -- waiting for GET /api/boomerangs backend</div>';
    }

    content.innerHTML = html;
  },

  switchView: function(view) {
    Boomerang.currentView = view;
    Boomerang.renderPanel();
  },

  // -- WIP Bar --

  _renderWipBar: function(items) {
    var nodes = Object.keys(CONFIG.NODE_COLORS || {});
    var caps = (Boomerang.data && Boomerang.data.wip_caps) || {};
    var html = '<div class="boom-wip-bar">';

    nodes.forEach(function(n) {
      var count = items.filter(function(i) { return i.assigned_to === n && (i.status === 'active' || i.status === 'overdue'); }).length;
      var cap = caps[n] || 5;
      var pct = Math.min(100, (count / cap) * 100);
      var color = Components.nodeColor(n);
      var cls = pct >= 100 ? 'boom-wip-full' : (pct >= 60 ? 'boom-wip-warn' : '');

      html += '<div class="boom-wip-node ' + cls + '">'
        + '<span class="boom-wip-name" style="color:' + color + '">' + n + '</span>'
        + '<div class="boom-wip-gauge">'
        + '<div class="boom-wip-fill" style="width:' + pct + '%;background:' + color + '"></div>'
        + '</div>'
        + '<span class="boom-wip-count">' + count + '/' + cap + '</span>'
        + '</div>';
    });

    html += '</div>';
    return html;
  },

  // -- Catch Queue (Node view) --

  _renderCatchQueue: function(items) {
    var sorted = items.filter(function(i) { return i.status === 'active' || i.status === 'overdue'; })
      .sort(function(a, b) { return new Date(a.deadline) - new Date(b.deadline); });

    if (!sorted.length) return Components.empty('No active boomerangs');

    var html = '<div class="boom-list">';
    sorted.forEach(function(item) {
      html += Boomerang._renderCard(item);
    });
    html += '</div>';
    return html;
  },

  // -- Escalation Queue (PM view) --

  _renderEscalation: function(items) {
    var overdue = items.filter(function(i) {
      return i.status === 'overdue' || new Date(i.deadline) < new Date();
    }).sort(function(a, b) { return new Date(a.deadline) - new Date(b.deadline); });

    var approaching = items.filter(function(i) {
      if (i.status === 'overdue') return false;
      var remaining = new Date(i.deadline) - new Date();
      return remaining > 0 && remaining < 3600000; // <1h remaining
    });

    var html = '';

    if (overdue.length) {
      html += '<div class="boom-section-header" style="color:var(--error)">Overdue (' + overdue.length + ')</div>';
      html += '<div class="boom-list">';
      overdue.forEach(function(item) { html += Boomerang._renderCard(item, true); });
      html += '</div>';
    }

    if (approaching.length) {
      html += '<div class="boom-section-header" style="color:var(--warning)">Approaching deadline (' + approaching.length + ')</div>';
      html += '<div class="boom-list">';
      approaching.forEach(function(item) { html += Boomerang._renderCard(item, true); });
      html += '</div>';
    }

    if (!overdue.length && !approaching.length) {
      return Components.empty('No escalations needed');
    }

    return html;
  },

  // -- Metrics (OPERATOR view) --

  _renderMetrics: function(items) {
    var stats = (Boomerang.data && Boomerang.data.stats) || {};
    var nodes = Object.keys(CONFIG.NODE_COLORS || {});

    var html = '<div class="boom-metrics-grid">';

    // Summary cards
    html += Components.card({
      header: 'System Health',
      icon: '\ud83d\udcca',
      body: Components.kvRow('Overdue rate', (stats.overdue_pct || 0) + '%', { status: stats.overdue_pct > 20 ? 'error' : (stats.overdue_pct > 10 ? 'warn' : 'ok') })
        + Components.kvRow('Avg return time', (stats.avg_return_hours || '--') + 'h')
        + Components.kvRow('Total thrown', stats.total_thrown || 0)
        + Components.kvRow('Total returned', stats.total_returned || 0)
    });

    // Per-node bounce rates
    var bounceHtml = '';
    nodes.forEach(function(n) {
      var nodeItems = items.filter(function(i) { return i.assigned_to === n; });
      var bounced = nodeItems.filter(function(i) { return i.status === 'returned'; }).length;
      var rate = nodeItems.length ? Math.round((bounced / nodeItems.length) * 100) : 0;
      var color = Components.nodeColor(n);
      bounceHtml += '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px">'
        + '<span style="color:' + color + '">' + n + '</span>'
        + '<span style="font-family:\'JetBrains Mono\',monospace;color:var(--text-secondary)">' + rate + '% (' + bounced + '/' + nodeItems.length + ')</span>'
        + '</div>';
    });

    html += Components.card({
      header: 'Bounce Rates',
      icon: '\ud83d\udd04',
      body: bounceHtml || '<span style="color:var(--text-tertiary)">No data</span>'
    });

    html += '</div>';
    return html;
  },

  // -- Card --

  _renderCard: function(item, showAssignee) {
    var now = Date.now();
    var deadlineMs = new Date(item.deadline).getTime();
    var remainingMs = deadlineMs - now;
    var isOverdue = remainingMs < 0;

    // Countdown
    var countdown;
    if (isOverdue) {
      var overdueMs = Math.abs(remainingMs);
      countdown = Components.formatDuration(Math.floor(overdueMs / 1000)) + ' overdue';
    } else {
      countdown = Components.formatDuration(Math.floor(remainingMs / 1000)) + ' left';
    }

    // Color coding: green=on-time, yellow=<2h, red=overdue
    var urgency = isOverdue ? 'error' : (remainingMs < 7200000 ? 'warn' : 'ok');
    var accentColor = urgency === 'error' ? 'var(--error)' : (urgency === 'warn' ? 'var(--warning)' : 'var(--success)');

    var priLabel = item.priority <= 1 ? Components.statusBadge('P' + item.priority, 'error')
                 : item.priority <= 2 ? Components.statusBadge('P' + item.priority, 'warn')
                 : '';

    var assigneeHtml = '';
    if (showAssignee !== false) {
      var color = Components.nodeColor(item.assigned_to);
      assigneeHtml = '<span style="color:' + color + ';font-weight:500;font-size:11px">' + Components.esc(item.assigned_to || '--') + '</span>';
    }

    var thrownAgo = Components.timeSince(item.thrown_at);

    var bodyHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<span class="boom-countdown ' + urgency + '">' + countdown + '</span>'
      + assigneeHtml
      + '</div>';

    if (item.scope) {
      bodyHtml += '<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">' + Components.esc(item.scope) + '</div>';
    }

    bodyHtml += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">'
      + priLabel
      + '<span style="font-size:9px;color:var(--text-tertiary);font-family:\'JetBrains Mono\',monospace">thrown ' + thrownAgo + ' by ' + Components.esc(item.thrown_by || '??') + '</span>'
      + '</div>';

    return Components.card({
      header: item.title || item.task_id,
      badge: Components.statusBadge(isOverdue ? 'OVERDUE' : 'active', urgency),
      accentColor: accentColor,
      body: bodyHtml
    });
  }
};
