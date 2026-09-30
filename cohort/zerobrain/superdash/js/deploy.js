/* Superdash v2 -- Deploy Status Widget (4C-E3)
 * Reads fleet-shared/last-deploy.json via coordinator API proxy.
 * Shows last deploy timestamp, pass/fail, individual check results.
 */

var Deploy = {
  data: null,
  pollInterval: null,

  async load() {
    try {
      var resp = await fetch(CONFIG.API_BASE + '/api/deploy-status', {
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
      });
      if (!resp.ok) {
        // Fallback: try direct file fetch (same-origin only)
        try {
          var fallback = await fetch('/last-deploy.json');
          if (fallback.ok) {
            Deploy.data = await fallback.json();
            return;
          }
        } catch(e) {}
        Deploy.data = null;
        return;
      }
      Deploy.data = await resp.json();
    } catch(e) {
      Deploy.data = null;
    }
  },

  render() {
    var el = document.getElementById('deploy-widget');
    if (!el) return;

    if (!Deploy.data || Deploy.data.error) {
      el.innerHTML = '<div class="deploy-widget">'
        + '<div class="deploy-header">'
        + '<span class="deploy-icon">🚀</span>'
        + '<span class="deploy-title">Last Deploy</span>'
        + '</div>'
        + '<div class="deploy-empty">No deploy data available</div>'
        + '</div>';
      return;
    }

    var d = Deploy.data;
    var passed = d.status === 'pass';
    var statusClass = passed ? 'deploy-pass' : 'deploy-fail';
    var statusIcon = passed ? '✅' : '❌';
    var statusText = passed ? 'PASSED' : 'FAILED';

    var html = '<div class="deploy-widget ' + statusClass + '">';
    html += '<div class="deploy-header">';
    html += '<span class="deploy-icon">🚀</span>';
    html += '<span class="deploy-title">Last Deploy</span>';
    html += '<span class="deploy-status-badge ' + statusClass + '">' + statusIcon + ' ' + statusText + '</span>';
    html += '</div>';

    // Timestamp + commit
    html += '<div class="deploy-meta">';
    if (d.timestamp) {
      html += '<span class="deploy-time">' + Deploy.formatTime(d.timestamp) + '</span>';
    }
    if (d.commit) {
      html += '<span class="deploy-commit">' + d.commit.substring(0, 7) + '</span>';
    }
    if (d.elapsed_s !== undefined) {
      html += '<span class="deploy-elapsed">' + d.elapsed_s + 's</span>';
    }
    html += '</div>';

    // Individual checks
    if (d.checks) {
      html += '<div class="deploy-checks">';
      var checkOrder = ['py_compile', 'import', 'health', 'mcp_status', 'errors_log'];
      var checkLabels = {
        py_compile: 'Compile',
        import: 'Import',
        health: 'Health',
        mcp_status: 'MCP',
        errors_log: 'Error Log'
      };
      checkOrder.forEach(function(key) {
        if (d.checks[key] !== undefined) {
          var val = d.checks[key];
          var ok = val === 'pass' || val === 'ok' || val === 'clean' || val === 'connected';
          html += '<div class="deploy-check">';
          html += '<span class="deploy-check-icon">' + (ok ? '✓' : '✗') + '</span>';
          html += '<span class="deploy-check-label">' + (checkLabels[key] || key) + '</span>';
          html += '<span class="deploy-check-value ' + (ok ? 'check-ok' : 'check-fail') + '">' + Deploy.esc(String(val)) + '</span>';
          html += '</div>';
        }
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  },

  formatTime(iso) {
    try {
      var d = new Date(iso);
      var now = new Date();
      var diff = Math.floor((now - d) / 1000);
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      return iso;
    }
  },

  esc(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  async refresh() {
    await Deploy.load();
    Deploy.render();
  },

  startPolling(intervalMs) {
    if (Deploy.pollInterval) clearInterval(Deploy.pollInterval);
    Deploy.pollInterval = setInterval(Deploy.refresh, intervalMs || 60000);
  }
};
