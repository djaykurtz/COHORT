/* Superdash v2 -- Panel Rendering */

var Panels = {
  showFleetOverview: function() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');
    title.textContent = 'Fleet Overview';
    badge.textContent = '';
    Nodes.currentNode = null;
    document.querySelectorAll('.node-card').forEach(function(c) { c.classList.remove('active'); });

    // Use collapsible sections layout
    if (typeof FleetSections !== 'undefined') {
      FleetSections.init(content);
    } else {
      content.innerHTML = '<div class="fleet-overview" id="fleet-overview"><div class="loading-text">Loading fleet data...</div></div>';
    }
  },

  showNodeDetail: function(nodeId) {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');
    title.textContent = nodeId + ' -- Detail';
    badge.textContent = '';
    content.innerHTML = '<div class="loading-text">Loading ' + nodeId + ' data...</div>';

    var node = Nodes.nodeData[nodeId];
    if (!node) {
      content.innerHTML = '<div class="empty-text">No data for ' + nodeId + '</div>';
      return;
    }

    var color = Nodes.getColor(nodeId);
    var host = Nodes.getHost(nodeId);
    var score = (node.freshness_score !== undefined) ? node.freshness_score
      : (node.workload_score !== undefined) ? node.workload_score : '--';
    var cls = (typeof score === 'number') ? Nodes.freshnessClass(score) : '';

    var html = '<div style="margin-bottom:16px">';
    html += '<div style="font-size:18px;font-weight:600;color:' + color + ';margin-bottom:4px">' + nodeId + '</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">' + (node.role || '--') + '</div>';

    var rows = [
      ['Host', host],
      ['Status', node.lifecycle_state || node.status || 'unknown'],
      ['Workload', '<span class="' + cls + '">' + score + '</span>'],
      ['Last seen', Nodes.timeSince(node.last_seen)]
    ];
    rows.forEach(function(r) {
      html += '<div class="overview-card-row"><span class="label">' + r[0] + '</span><span class="value">' + r[1] + '</span></div>';
    });

    // WI-2 (RFC548x1 v1 / bundle-3 pickup): surface nested routing_state block on node-detail panel.
    // Defensive: section hides when routing_state absent; rows hide when individual fields undefined.
    // active_work_turns rendered with delta annotation (e.g. "12 (+3)") when delta is non-zero numeric.
    var rs = node.routing_state;
    if (rs && typeof rs === 'object') {
      var rsRows = [];
      if (typeof rs.checkpoint_count === 'number') {
        rsRows.push(['Checkpoints', String(rs.checkpoint_count)]);
      }
      if (typeof rs.active_work_turns === 'number') {
        var turnsVal = String(rs.active_work_turns);
        if (typeof rs.active_work_turns_delta === 'number' && rs.active_work_turns_delta !== 0) {
          var sign = rs.active_work_turns_delta > 0 ? '+' : '';
          turnsVal += ' <span class="value-delta">(' + sign + rs.active_work_turns_delta + ')</span>';
        }
        rsRows.push(['Active work turns', turnsVal]);
      }
      if (rs.last_molted) {
        var rsMolt = Nodes.timeSince(rs.last_molted);
        if (typeof rsMolt === 'string' && rsMolt.indexOf('NaN') < 0) {
          rsRows.push(['Last molted', rsMolt]);
        }
      }
      if (typeof rs.idle_burn_state === 'string' && rs.idle_burn_state.length) {
        var burnSlug = rs.idle_burn_state.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        var knownBurnStates = ['active', 'idle', 'warning', 'critical', 'degraded'];
        var burnCls = (knownBurnStates.indexOf(burnSlug) >= 0) ? 'value-burn-' + burnSlug : 'value-burn-unknown';
        rsRows.push(['Idle-burn state', '<span class="' + burnCls + '">' + Panels.esc(rs.idle_burn_state) + '</span>']);
      }
      if (rsRows.length) {
        html += '<div class="routing-state-section">';
        html += '  <div class="routing-state-label">Routing State</div>';
        rsRows.forEach(function(r) {
          html += '  <div class="overview-card-row"><span class="label">' + r[0] + '</span><span class="value">' + r[1] + '</span></div>';
        });
        html += '</div>';
      }
    }

    html += '</div>';
    content.innerHTML = html;
  },

  renderTasks: function(data) {
    var el = document.getElementById('task-list');
    // Active Tasks intel-card removed 2026-06-06 (UXIA, OPERATOR-direct).
    // Guard kept so any straggler caller is a silent no-op rather than a throw.
    if (!el) return;
    var tasks = (data && data.tasks) ? data.tasks : [];

    var active = tasks.filter(function(t) {
      return t.status === 'in_progress' || t.status === 'ready'
        || t.status === 'review' || t.status === 'blocked';
    });

    if (!active.length) {
      el.innerHTML = '<div class="empty-text">No active tasks</div>';
      return;
    }

    var html = '';
    active.slice(0, 8).forEach(function(t) {
      html += '<div class="task-item">'
        + '<div class="task-dot ' + t.status + '"></div>'
        + '<span class="task-title">' + Panels.esc(t.title || t.task_id) + '</span>'
        + '<span class="task-assignee">' + (t.assigned_to || '--') + '</span>'
        + '</div>';
    });

    el.innerHTML = html;
  },

  renderMolt: function(moltData) {
    var el = document.getElementById('molt-status');
    var moratorium = (moltData && moltData.moratorium && moltData.moratorium.active) ? true : false;

    var moratorium = (moltData && moltData.moratorium && moltData.moratorium.active) ? true : false;

    var html = '<div class="molt-grid">';
    var hosts = ['COORD_HOST', 'WORKER_HOST', 'WORKER_HOST_2'];
    hosts.forEach(function(h, i) {
      var wide = (i === 2) ? ' wide' : '';
      var statusColor = 'var(--success)';
      var statusText = 'Ready';

      if (moratorium) {
        statusColor = 'var(--error)';
        statusText = 'Moratorium';
      } else if (h === 'WORKER_HOST_2') {
        statusColor = 'var(--warning)';
        statusText = 'Unreachable';
      }

      html += '<div class="molt-host' + wide + '">';
      html += '<div class="molt-host-name">' + h + '</div>';
      html += '<div class="molt-host-status" style="color:' + statusColor + '">' + statusText + '</div>';
      html += '</div>';
    });
    html += '</div>';

    el.innerHTML = html;
  },

  renderHealth: function(health) {
    var el = document.getElementById('fleet-health');
    if (!health) {
      el.innerHTML = '<div class="empty-text">Unavailable</div>';
      return;
    }

    var rows = [];
    rows.push(['Coordinator', health.status === 'ok' ? 'healthy' : (health.status || '??'), health.status === 'ok' ? 'ok' : 'bad']);
    if (health.db_health) {
      rows.push(['DB Size', health.db_health.db_size_mb ? health.db_health.db_size_mb.toFixed(1) + 'MB' : '--', 'muted']);
      rows.push(['Events', (health.db_health.event_count || '--').toLocaleString(), 'muted']);
      rows.push(['Messages', (health.db_health.total_messages || '--').toLocaleString(), 'muted']);
    }
    if (health.uptime_seconds !== undefined) {
      rows.push(['Uptime', Panels.formatDuration(health.uptime_seconds), 'muted']);
    }

    var html = '';
    rows.forEach(function(r) {
      html += '<div class="health-row">'
        + '<span class="label">' + r[0] + '</span>'
        + '<span class="value ' + r[2] + '">' + r[1] + '</span>'
        + '</div>';
    });
    el.innerHTML = html;
  },

  updateHeader: function(health, fleetData) {
    var nodeCount = 0;
    var totalNodes = 0;
    if (fleetData && fleetData.nodes) {
      totalNodes = fleetData.nodes.length;
      fleetData.nodes.forEach(function(n) {
        var age = n.last_seen ? (Date.now() - new Date(n.last_seen).getTime()) / 1000 : 99999;
        if (age < 600) nodeCount++;
      });
      // SWAT-20260612-0039 Δ3: mark wall-clock of last fresh /api/fleet payload
      Panels._lastFleetRefreshMs = Date.now();
      Panels._renderFleetRefreshStat();
    }
    var statNodesEl = document.getElementById('stat-nodes');
    if (statNodesEl) statNodesEl.textContent = nodeCount + '/' + totalNodes;

    if (health) {
      if (health.db_health && health.db_health.event_count) {
        var evts = health.db_health.event_count;
        document.getElementById('stat-events').textContent = evts >= 1000 ? (evts / 1000).toFixed(1) + 'K' : evts;
      }
      if (health.uptime_seconds !== undefined) {
        document.getElementById('stat-uptime').textContent = Panels.formatDuration(health.uptime_seconds);
      }
    }
  },

  // SWAT-20260612-0039 Δ3: visible last-fleet-refresh indicator
  // _lastFleetRefreshMs is set on each successful /api/fleet payload arrival in updateHeader()
  // _renderFleetRefreshStat is also ticked from _fleetRefreshTicker every 5s so the age
  // string updates between fetches; the value flips to a 'stale' style when the age
  // exceeds the configured stale threshold (defaults aligned with Δ2 nodes.js: 360s).
  _lastFleetRefreshMs: null,
  _fleetRefreshTicker: null,

  _renderFleetRefreshStat: function() {
    var el = document.getElementById('stat-fleet-refresh');
    if (!el) return;
    if (Panels._lastFleetRefreshMs == null) {
      el.textContent = '--';
      el.classList.remove('stat-value-stale');
      return;
    }
    var ageSec = Math.floor((Date.now() - Panels._lastFleetRefreshMs) / 1000);
    var staleSec = (typeof CONFIG !== 'undefined' && CONFIG.NODE_STALE_THRESHOLD_SEC) || 360;
    var text;
    if (ageSec < 5) text = 'just now';
    else if (ageSec < 60) text = ageSec + 's ago';
    else if (ageSec < 3600) text = Math.floor(ageSec / 60) + 'm ' + (ageSec % 60) + 's ago';
    else text = Math.floor(ageSec / 3600) + 'h ago';
    el.textContent = text;
    if (ageSec > staleSec) el.classList.add('stat-value-stale');
    else el.classList.remove('stat-value-stale');
  },

  startFleetRefreshTicker: function() {
    if (Panels._fleetRefreshTicker) return;
    Panels._fleetRefreshTicker = setInterval(Panels._renderFleetRefreshStat, 5000);
  },

  // SWAT-candidate finding A/B+G (superdash resource-efficiency pass, 2026-08):
  // this ticker had no stop counterpart, so it ran forever (720x/hour) even
  // on hidden tabs -- adding the missing stop function so PerfGuard can pause it.
  stopFleetRefreshTicker: function() {
    if (Panels._fleetRefreshTicker) { clearInterval(Panels._fleetRefreshTicker); Panels._fleetRefreshTicker = null; }
  },

  updateStatusBar: function(health, moltData) {
    if (health) {
      document.getElementById('status-coordinator').textContent = health.status === 'ok' ? 'ok' : (health.status || '??');
      document.getElementById('status-coordinator').style.color = health.status === 'ok' ? 'var(--success)' : 'var(--error)';
      if (health.db_health) {
        document.getElementById('status-db').textContent = health.db_health.db_size_mb ? health.db_health.db_size_mb.toFixed(1) + 'MB' : '--';
      }
    }
    if (moltData) {
      var mor = moltData.moratorium || {};
      var mText = mor.active ? 'MORATORIUM' : 'clear';
      var mColor = mor.active ? 'var(--error)' : 'var(--text-secondary)';
      document.getElementById('status-molt').textContent = mText;
      document.getElementById('status-molt').style.color = mColor;
    }
  },

  setConnected: function(connected) {
    var dot = document.getElementById('live-dot');
    var text = document.getElementById('status-live-text');
    if (connected) {
      dot.classList.add('connected');
      text.textContent = 'LIVE';
      text.style.color = 'var(--success)';
    } else {
      dot.classList.remove('connected');
      text.textContent = 'POLLING';
      text.style.color = 'var(--warning)';
    }
  },

  formatBytes: function(b) {
    if (!b) return '--';
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
    return (b / 1048576).toFixed(1) + 'MB';
  },

  formatDuration: function(secs) {
    if (!secs && secs !== 0) return '--';
    if (secs < 60) return secs + 's';
    if (secs < 3600) return Math.floor(secs / 60) + 'm';
    return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  },

  esc: function(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
