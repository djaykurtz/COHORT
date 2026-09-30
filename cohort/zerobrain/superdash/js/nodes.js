/* Superdash v2 -- Node Rendering */

const Nodes = {
  currentNode: null,
  nodeData: {},
  _initialRenderDone: false,

  getColor(nodeId) {
    return CONFIG.NODE_COLORS[nodeId] || '#58a6ff';
  },

  getHost(nodeId) {
    for (var host in CONFIG.HOSTS) {
      if (CONFIG.HOSTS[host].indexOf(nodeId) !== -1) return host;
    }
    return '??';
  },

  freshnessClass(score) {
    if (score >= 70) return 'fresh';
    if (score >= 40) return 'warm';
    return 'stale';
  },

  freshnessLabel(score) {
    if (score >= 70) return 'FRESH';
    if (score >= 40) return 'WARM';
    return 'STALE';
  },

  indicatorClass(node) {
    if (!node.last_seen) return 'offline';
    var age = (Date.now() - new Date(node.last_seen).getTime()) / 1000;
    // SWAT-20260612-0039 Δ2: config-driven thresholds, defaults respect 2-3 cycle observation
    // window for the 2m/5m bb4 cadence (360s stale = 3x of 2m cadence; 720s offline = 6x).
    var offlineSec = (typeof CONFIG !== 'undefined' && CONFIG.NODE_OFFLINE_THRESHOLD_SEC) || 720;
    var staleSec   = (typeof CONFIG !== 'undefined' && CONFIG.NODE_STALE_THRESHOLD_SEC)   || 360;
    if (age > offlineSec) return 'offline';
    if (age > staleSec)   return 'stale';
    return '';
  },


  timeSince(isoStr) {
    if (!isoStr) return 'never';
    var secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (secs < 60) return 'now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  },

  sessionAge(node) {
    // Use bootstrapped_at as session start (= last molt/boot time)
    // process_start_time is the OS process which persists across molts -- wrong for session age
    var pst = node.bootstrapped_at || node.session_start_time || node.process_start_time;
    var secs;
    if (pst) {
      secs = Math.floor((Date.now() - new Date(pst).getTime()) / 1000);
    } else if (node.session_age_seconds !== undefined && node.session_age_seconds !== null) {
      secs = node.session_age_seconds;
    } else {
      return '\u2014';
    }
    if (secs < 0 || isNaN(secs)) return '\u2014';
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  },

  lifeSvcClass(node) {
    if (!node.heartbeat_status) return 'grey';
    if (node.heartbeat_status === 'healthy' && node.heartbeat_phase === 'active') return 'green';
    if (node.heartbeat_status === 'healthy') return 'green';
    if (node.heartbeat_status === 'overdue') return 'red';
    return 'grey';
  },

  lifeSvcLabel(node) {
    if (!node.heartbeat_status) return 'no data';
    if (node.heartbeat_status === 'healthy') return 'alive';
    if (node.heartbeat_status === 'overdue') return 'overdue';
    return node.heartbeat_status;
  },

  renderNav(nodes) {
    // Inner list container (sibling of the bottom Fleet Health card inside .nav).
    var nav = document.getElementById('node-nav-list') || document.getElementById('node-nav');
    if (!nodes || !nodes.length) {
      nav.innerHTML = '<div class="nav-loading">No nodes found</div>';
      return;
    }

    var isFirst = !Nodes._initialRenderDone;
    var html = '';
    nodes.forEach(function(node, i) {
      var color = Nodes.getColor(node.node_id);
      var ind = Nodes.indicatorClass(node);
      var host = Nodes.getHost(node.node_id);
      var active = (Nodes.currentNode === node.node_id) ? ' active' : '';
      var animClass = isFirst ? ' animate-in' : '';
      var animStyle = isFirst ? 'animation-delay:' + (i * 0.05) + 's;' : '';
      var score = (node.freshness_score !== undefined) ? node.freshness_score
        : (node.workload_score !== undefined) ? node.workload_score : '--';
      var status = node.lifecycle_state || node.status || 'unknown';

      var lsClass = Nodes.lifeSvcClass(node);
      var lsLabel = Nodes.lifeSvcLabel(node);

      html += '<div class="node-card' + animClass + active + '" '
        + 'style="--node-color:' + color + ';' + animStyle + '" '
        + 'data-node="' + node.node_id + '">'
        + '<div class="node-card-header">'
        + '<span class="node-name" style="color:' + color + '">' + node.node_id + '</span>'
        + '<span class="node-role">' + (node.role || '--') + '</span>'
        + '</div>'
        + '<div class="node-meta" style="margin-top:4px">'
        + '<span class="node-indicator ' + ind + '"></span>'
        + '<span>' + status + '</span>'
        + '<span class="life-svc-pip ' + lsClass + '" title="Life services: ' + lsLabel + '"></span>'
        + '<span class="node-host">' + host + '</span>'
        + '</div>'
        + '<div class="node-session-age-row">'
        + '\u23f1 ' + Nodes.sessionAge(node)
        + '</div>'
        + '<div class="node-meta" style="margin-top:2px">'
        + '<span>wl:' + score + '</span>'
        + '<span style="margin-left:auto">' + Nodes.timeSince(node.last_seen) + '</span>'
        + '</div>'
        + '</div>';
    });

    nav.innerHTML = html;
    Nodes._initialRenderDone = true;

    nav.querySelectorAll('.node-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var nodeId = card.getAttribute('data-node');
        Nodes.selectNode(nodeId);
      });
    });
  },

  selectNode(nodeId) {
    Nodes.currentNode = nodeId;
    document.querySelectorAll('.node-card').forEach(function(c) {
      c.classList.toggle('active', c.getAttribute('data-node') === nodeId);
    });
    Panels.showNodeDetail(nodeId);
  },

  renderOverviewCards(nodes) {
    var el = document.getElementById('fleet-overview');
    if (!el) return;
    el.innerHTML = '';
  }
};
