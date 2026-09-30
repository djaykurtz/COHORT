/**
 * ZEROBRAIN Superdash -- Gary Status Panel (RFC588)
 *
 * OPERATOR-gated pull view for Project Crash Test Dummy "Gary" -- a disposable
 * singleton test/canary session. Reads GET /operator/gary-status.
 *
 * RFC588 solidplan explicitly requires this surface be NAV-ONLY, NEVER
 * auto-rendered or SSE-driven: "accidental SSE/auto-render of gated view" is
 * a named MED risk with a required "nav-only assertion test". Unlike sibling
 * panels (e.g. RecoveryPanel), this panel deliberately has NO polling timer --
 * data is fetched exactly once per explicit tab-navigation or manual refresh
 * click, never on an interval and never pushed via SSE.
 */
var GaryPanel = {
  _data: null,

  // ═══ DATA FETCHING (pull-only, one-shot -- no polling, no SSE) ═══
  async fetchStatus() {
    try {
      var resp = await fetch(CONFIG.API_BASE + '/operator/gary-status', {
        headers: {
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN,
          'X-Fleet-Token': CONFIG.AUTH_TOKEN
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      return { _error: e.message, active_session: null, lease_held: false, recent_sessions: [], reaper_stats: { expired_reaped_count: 0 } };
    }
  },

  async refresh() {
    GaryPanel._data = await GaryPanel.fetchStatus();
    return GaryPanel._data;
  },

  // ═══ PANEL LIFECYCLE (explicit nav only -- called from App.switchTab) ═══
  async renderPanel() {
    var container = document.getElementById('main-content');
    container.innerHTML = '<div class="gary-panel"><div class="loading-text">Loading Gary status…</div></div>';
    document.getElementById('main-panel-title').textContent = 'Gary Status';
    document.getElementById('main-panel-badge').textContent = 'RFC588';

    await GaryPanel.refresh();
    GaryPanel.render(container);
  },

  // Manual refresh button handler -- the ONLY re-fetch path besides initial nav.
  async manualRefresh() {
    var container = document.getElementById('main-content');
    if (!container) return;
    await GaryPanel.refresh();
    GaryPanel.render(container);
  },

  // ═══ RENDERING ═══
  render(container) {
    var data = GaryPanel._data;
    if (!data) { container.innerHTML = '<div class="gary-panel"><div class="loading-text">No data</div></div>'; return; }

    var html = '<div class="gary-panel">';

    // Header
    html += '<div class="gary-header">';
    html += '  <div class="gary-header-left">';
    html += '    <span class="gary-header-icon">🧪</span>';
    html += '    <div>';
    html += '      <div class="gary-header-title">PROJECT CRASH TEST DUMMY "GARY"</div>';
    html += '      <div class="gary-header-subtitle">RFC588 · disposable canary test harness · pull-only, manual refresh</div>';
    html += '    </div>';
    html += '  </div>';
    html += '  <button class="gary-refresh-btn" onclick="GaryPanel.manualRefresh()" title="Manually re-fetch (this view never auto-refreshes)">🔄 Refresh</button>';
    html += '</div>';

    // Error banner
    if (data._error) {
      html += '<div class="gary-error-banner">⚡ API error: ' + GaryPanel.esc(data._error) + '</div>';
    }

    // Lease + active session status
    html += GaryPanel.renderActiveSection(data);

    // Recent sessions history
    html += GaryPanel.renderRecentSessions(data.recent_sessions || []);

    // Reaper stats
    html += GaryPanel.renderReaperStats(data.reaper_stats || {});

    html += '</div>';
    container.innerHTML = html;
  },

  renderActiveSection(data) {
    var html = '<div class="gary-active-card">';
    if (data.active_session) {
      var s = data.active_session;
      html += '<div class="gary-active-header">';
      html += '  <span class="gary-status-dot gary-status-active"></span>';
      html += '  <span class="gary-active-label">ACTIVE -- ' + GaryPanel.esc(s.gary_session_id || '') + '</span>';
      html += '</div>';
      html += '<div class="gary-active-detail">';
      html += '  <div class="gary-detail-row"><span class="label">Kind</span><span class="value">' + GaryPanel.esc(s.kind || '--') + '</span></div>';
      html += '  <div class="gary-detail-row"><span class="label">Spawner</span><span class="value">' + GaryPanel.esc(s.spawner_node || '--') + '</span></div>';
      html += '  <div class="gary-detail-row"><span class="label">Started</span><span class="value">' + GaryPanel.formatTime(s.started_at_utc) + '</span></div>';
      html += '  <div class="gary-detail-row"><span class="label">TTL</span><span class="value">' + (s.ttl_seconds ? Math.round(s.ttl_seconds / 60) + ' min' : '--') + '</span></div>';
      html += '  <div class="gary-detail-row"><span class="label">Lease held</span><span class="value">' + (data.lease_held ? 'yes' : 'no') + '</span></div>';
      html += '</div>';
    } else {
      html += '<div class="gary-active-header">';
      html += '  <span class="gary-status-dot gary-status-idle"></span>';
      html += '  <span class="gary-active-label">No active Gary session</span>';
      html += '</div>';
      if (data.lease_held) {
        html += '<div class="gary-lease-warning">⚠️ Lease reports held, but no open gary_test_results row was found -- possible drift, worth investigating.</div>';
      }
    }
    html += '</div>';
    return html;
  },

  renderRecentSessions(sessions) {
    var html = '<div class="gary-recent-section">';
    html += '<div class="gary-section-title">Recent Sessions (last ' + sessions.length + ')</div>';
    if (!sessions.length) {
      html += '<div class="gary-empty">No completed Gary sessions yet.</div>';
    } else {
      html += '<div class="gary-recent-list">';
      sessions.forEach(function(s) {
        var verdictCls = GaryPanel.verdictClass(s.verdict);
        html += '<div class="gary-recent-row">';
        html += '  <span class="gary-verdict-dot ' + verdictCls + '"></span>';
        html += '  <span class="gary-recent-id">' + GaryPanel.esc(s.gary_session_id || '') + '</span>';
        html += '  <span class="gary-recent-kind">' + GaryPanel.esc(s.kind || '--') + '</span>';
        html += '  <span class="gary-recent-verdict ' + verdictCls + '">' + GaryPanel.esc(s.verdict || 'unknown') + '</span>';
        html += '  <span class="gary-recent-spawner">@' + GaryPanel.esc(s.spawner_node || '--') + '</span>';
        html += '  <span class="gary-recent-time">' + GaryPanel.formatTime(s.started_at_utc) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  renderReaperStats(stats) {
    var html = '<div class="gary-reaper-card">';
    html += '<span class="label">Expired-and-reaped (bricked, absence-is-signal) count</span>';
    html += '<span class="value">' + (stats.expired_reaped_count || 0) + '</span>';
    html += '</div>';
    return html;
  },

  // ═══ HELPERS ═══
  verdictClass(verdict) {
    if (!verdict) return 'verdict-unknown';
    if (verdict === 'pass' || verdict === 'success') return 'verdict-pass';
    if (verdict === 'expired_reaped' || verdict === 'fail' || verdict === 'failure') return 'verdict-fail';
    return 'verdict-neutral';
  },

  formatTime(isoStr) {
    if (!isoStr) return '--';
    try {
      var d = new Date(isoStr);
      return d.toLocaleTimeString() + ' ' + d.toLocaleDateString();
    } catch (e) { return isoStr; }
  },

  esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};
