/**
 * ZEROBRAIN Superdash — Recovery Status Panel (Project Grid)
 * Shows fleet health by host, per-service status, node lifecycle states,
 * and recovery manifest info from /api/recovery/status endpoint.
 */

var RecoveryPanel = {
  _data: null,
  _pollTimer: null,
  _POLL_MS: 15000,

  // ═══ DATA FETCHING ═══
  async fetchStatus() {
    try {
      var resp = await fetch(CONFIG.API_BASE + '/api/recovery/status', {
        headers: {
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN,
          'X-Fleet-Token': CONFIG.AUTH_TOKEN
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      return { _error: e.message, overall_status: 'critical', hosts: {}, nodes: {}, recovery_manifest: { available: false } };
    }
  },

  async refresh() {
    RecoveryPanel._data = await RecoveryPanel.fetchStatus();
    return RecoveryPanel._data;
  },

  // ═══ PANEL LIFECYCLE ═══
  async renderPanel() {
    var container = document.getElementById('main-content');
    container.innerHTML = '<div class="recovery-panel"><div class="loading-text">Loading recovery status…</div></div>';
    document.getElementById('main-panel-title').textContent = 'Recovery Status';
    document.getElementById('main-panel-badge').textContent = '';

    await RecoveryPanel.refresh();
    RecoveryPanel.render(container);
    RecoveryPanel.startPolling();
  },

  startPolling() {
    RecoveryPanel.stopPolling();
    RecoveryPanel._pollTimer = setInterval(async function() {
      if (App.currentTab !== 'recovery') { RecoveryPanel.stopPolling(); return; }
      await RecoveryPanel.refresh();
      var container = document.getElementById('main-content');
      if (container) RecoveryPanel.render(container);
    }, RecoveryPanel._POLL_MS);
  },

  stopPolling() {
    if (RecoveryPanel._pollTimer) { clearInterval(RecoveryPanel._pollTimer); RecoveryPanel._pollTimer = null; }
  },

  // ═══ RENDERING ═══
  render(container) {
    var data = RecoveryPanel._data;
    if (!data) { container.innerHTML = '<div class="recovery-panel"><div class="loading-text">No data</div></div>'; return; }

    var html = '<div class="recovery-panel">';

    // Header with overall status
    var statusCls = RecoveryPanel.statusClass(data.overall_status);
    html += '<div class="recovery-header">';
    html += '  <div class="recovery-header-left">';
    html += '    <span class="recovery-header-icon">🏥</span>';
    html += '    <div>';
    html += '      <div class="recovery-header-title">FLEET RECOVERY</div>';
    html += '      <div class="recovery-header-subtitle">Project Grid · Infrastructure Health</div>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="recovery-header-status">';
    html += '    <span class="recovery-status-dot ' + statusCls + '"></span>';
    html += '    <span class="recovery-status-label ' + statusCls + '">' + RecoveryPanel.esc(data.overall_status || 'unknown') + '</span>';
    html += '  </div>';
    html += '</div>';

    // Recovery mode banner (if active)
    if (data.recovery_mode) {
      html += '<div class="recovery-mode-banner">';
      html += '  <span class="recovery-mode-icon">⚠️</span>';
      html += '  <span>Recovery mode active — automated healing in progress</span>';
      html += '</div>';
    }

    // Error banner
    if (data._error) {
      html += '<div class="recovery-error-banner">';
      html += '  <span>⚡ API error: ' + RecoveryPanel.esc(data._error) + '</span>';
      html += '</div>';
    }

    // Host cards
    html += '<div class="recovery-hosts">';
    var hosts = data.hosts || {};
    Object.keys(hosts).forEach(function(hostKey) {
      html += RecoveryPanel.renderHostCard(hostKey, hosts[hostKey], data.nodes || {});
    });
    html += '</div>';

    // Recovery manifest section
    html += RecoveryPanel.renderManifest(data.recovery_manifest);

    // Timestamp
    if (data.timestamp) {
      html += '<div class="recovery-timestamp">Last updated: ' + RecoveryPanel.formatTime(data.timestamp) + '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  },

  renderHostCard(hostKey, hostData, allNodes) {
    var html = '<div class="recovery-host-card">';
    html += '<div class="recovery-host-header">';
    html += '  <span class="recovery-host-name">' + RecoveryPanel.esc(hostKey) + '</span>';
    html += '  <span class="recovery-host-hostname">' + RecoveryPanel.esc(hostData.hostname || '') + '</span>';
    if (hostData.local) html += '  <span class="recovery-host-local-badge">LOCAL</span>';
    html += '</div>';

    // Services grid
    html += '<div class="recovery-services">';
    var services = hostData.services || {};
    Object.keys(services).forEach(function(svcName) {
      var svc = services[svcName];
      var svcCls = RecoveryPanel.serviceStatusClass(svc.status);
      html += '<div class="recovery-service-card ' + svcCls + '">';
      html += '  <div class="recovery-service-name">' + RecoveryPanel.esc(svcName) + '</div>';
      html += '  <div class="recovery-service-status">';
      html += '    <span class="recovery-svc-dot ' + svcCls + '"></span>';
      html += '    <span>' + RecoveryPanel.esc(svc.status || 'unknown') + '</span>';
      html += '  </div>';
      if (svc.port) html += '  <div class="recovery-service-port">:' + svc.port + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Nodes on this host
    var hostNodes = hostData.nodes || [];
    if (hostNodes.length > 0) {
      html += '<div class="recovery-host-nodes">';
      hostNodes.forEach(function(nodeId) {
        var nodeInfo = allNodes[nodeId] || {};
        var nodeCls = RecoveryPanel.nodeStatusClass(nodeInfo.status);
        html += '<div class="recovery-node-chip ' + nodeCls + '">';
        html += '  <span class="recovery-node-id">' + RecoveryPanel.esc(nodeId) + '</span>';
        html += '  <span class="recovery-node-lifecycle">' + RecoveryPanel.esc(nodeInfo.lifecycle_state || '—') + '</span>';
        if (nodeInfo.last_seen) {
          html += '  <span class="recovery-node-seen">' + RecoveryPanel.timeSince(nodeInfo.last_seen) + '</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  renderManifest(manifest) {
    if (!manifest) return '';
    var html = '<div class="recovery-manifest">';
    html += '<div class="recovery-manifest-header">Recovery Manifest</div>';
    if (!manifest.available) {
      html += '<div class="recovery-manifest-unavailable">No manifest available — waiting for pg-recover-script</div>';
    } else {
      html += '<div class="recovery-manifest-row"><span class="label">Last run</span><span class="value">' + RecoveryPanel.formatTime(manifest.last_run) + '</span></div>';
      var resultCls = manifest.last_result === 'success' ? 'status-ok' : manifest.last_result === 'partial' ? 'status-warn' : 'status-error';
      html += '<div class="recovery-manifest-row"><span class="label">Result</span><span class="value ' + resultCls + '">' + RecoveryPanel.esc(manifest.last_result || '—') + '</span></div>';
    }
    html += '</div>';
    return html;
  },

  // ═══ HELPERS ═══
  statusClass(status) {
    if (status === 'healthy') return 'status-ok';
    if (status === 'degraded') return 'status-warn';
    return 'status-error';
  },

  serviceStatusClass(status) {
    if (status === 'ok') return 'svc-ok';
    if (status === 'error') return 'svc-error';
    return 'svc-unreachable';
  },

  nodeStatusClass(status) {
    if (status === 'online') return 'node-online';
    if (status === 'stale') return 'node-stale';
    return 'node-offline';
  },

  formatTime(isoStr) {
    if (!isoStr) return '—';
    try {
      var d = new Date(isoStr);
      return d.toLocaleTimeString() + ' ' + d.toLocaleDateString();
    } catch (e) { return isoStr; }
  },

  timeSince(isoStr) {
    if (!isoStr) return '';
    try {
      var ms = Date.now() - new Date(isoStr).getTime();
      if (ms < 60000) return Math.floor(ms / 1000) + 's ago';
      if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
      return Math.floor(ms / 3600000) + 'h ago';
    } catch (e) { return ''; }
  },

  esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};
