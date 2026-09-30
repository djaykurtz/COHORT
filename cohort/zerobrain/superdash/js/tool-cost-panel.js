/* Superdash v2 -- Tool Cost Intel Panel (RFC017-P5)
 *
 * Renders ranked daily token-spend per tool from /api/tool_costs.
 * 5-tier render state machine per RFC017-P5 d3.1 §5:
 *   - error    (HTTP fail / shape-invalid)         red dot,    no table,    retry button
 *   - degraded (cache_age_ms > stale_threshold_ms) yellow dot, table visible (last-known), banner
 *   - healthy-0 (tools_with_telemetry == 0)        orange dot, no table,    message
 *   - warming   (0 < ratio < 0.20)                 orange dot, table + banner
 *   - normal    (ratio >= 0.20)                    orange dot, table only
 *
 * FEATURE-FLAG GATED (default ON per RFC017-P5 AC18; P3.5 endpoint shipped + telemetry accreted):
 *   - Enabled by default via window.TOOL_COST_WIDGET_ENABLED = true in config.js
 *   - Force-hide fleet-wide: set window.TOOL_COST_WIDGET_ENABLED = false in config.js
 *   - Per-browser override: localStorage.setItem('toolCostWidget','1') still forces ON
 * Off-state: card.style.display = 'none' from init guard; never fetches.
 *
 * Design refs:
 *   - 06110308UXIA-rfc017-p5-design-d1 (head-start, DRAGON architect cosign)
 *   - 06111442UXIA-RFC017-P5designd2-DRAGON-Q1-fo (cache_age_ms + naming-note)
 *   - 06111510UXIA-RFC017-P5d3design-stable-QUATT (4-tier + P3.5 wrapper)
 *   - 06111516UXIA-RFC017-P5d31amendment-QUATTRO6 (5-tier + payload-threshold + always-emit)
 *   - 06111545UXIA-RFC017-P5d32SURFACE-PATHCORREC (canonical surface = superdash-v2 intel-card)
 *
 * Ship-sequencing: render impl gated on NIMBUS P3.5 endpoint land + ~1wk data accretion.
 */

var ToolCostPanel = {
  _data: null,
  _lastSuccessfulFetchTs: null,
  _pollTimer: null,
  _POLL_MS: 60000,           // 60s per d3.1 §6 (separate from superdash 5s fetchAll)
  _ENDPOINT: '/api/tool_costs?top=20&window_days=7',

  // ═══ FEATURE-FLAG GATE ═══
  isEnabled: function() {
    if (typeof window !== 'undefined' && window.TOOL_COST_WIDGET_ENABLED === true) return true;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('toolCostWidget') === '1') return true;
    } catch (e) { /* localStorage unavailable */ }
    return false;
  },

  // ═══ LIFECYCLE ═══
  init: function() {
    var card = document.getElementById('tool-cost-card');
    if (!card) return;
    if (!ToolCostPanel.isEnabled()) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    ToolCostPanel._render();        // initial loading state
    ToolCostPanel._refresh();       // immediate first fetch
    ToolCostPanel._startPolling();
  },

  _startPolling: function() {
    ToolCostPanel._stopPolling();
    ToolCostPanel._pollTimer = setInterval(ToolCostPanel._refresh, ToolCostPanel._POLL_MS);
  },

  _stopPolling: function() {
    if (ToolCostPanel._pollTimer) {
      clearInterval(ToolCostPanel._pollTimer);
      ToolCostPanel._pollTimer = null;
    }
  },

  // ═══ DATA FETCH (5-tier state derivation) ═══
  _refresh: async function() {
    var data;
    try {
      var resp = await fetch((typeof CONFIG !== 'undefined' ? CONFIG.API_BASE : '') + ToolCostPanel._ENDPOINT, {
        headers: (typeof CONFIG !== 'undefined' && CONFIG.AUTH_TOKEN) ? {
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN,
          'X-Fleet-Token': CONFIG.AUTH_TOKEN
        } : {},
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      data = await resp.json();
      if (!data || !data.meta || !Array.isArray(data.items)) {
        throw new Error('shape-invalid');
      }
      // Always-emit guard per QUATTRO #62170 substrate strictness ask
      if (typeof data.meta.stale_threshold_ms !== 'number' ||
          typeof data.meta.cache_ttl_ms !== 'number' ||
          typeof data.meta.cache_age_ms !== 'number') {
        throw new Error('meta-missing-stale-fields');
      }
      ToolCostPanel._data = data;
      ToolCostPanel._lastSuccessfulFetchTs = Date.now();
    } catch (e) {
      ToolCostPanel._data = { _error: e.message || String(e) };
    }
    ToolCostPanel._render();
  },

  _deriveState: function(d) {
    if (!d || d._error) return 'error';
    if (d.meta.cache_age_ms > d.meta.stale_threshold_ms) return 'degraded';
    var total = d.meta.total_tools_cataloged || 0;
    var sampled = d.meta.tools_with_telemetry || 0;
    if (sampled === 0) return 'healthy-0';
    if (total > 0 && (sampled / total) < 0.20) return 'warming';
    return 'normal';
  },

  // ═══ RENDER ═══
  _render: function() {
    var body = document.getElementById('tool-cost-body');
    var dot  = document.getElementById('tool-cost-dot');
    var badge = document.getElementById('tool-cost-badge');
    if (!body || !dot || !badge) return;

    if (!ToolCostPanel._data) {
      body.innerHTML = '<div class="loading-text">Loading tool costs...</div>';
      dot.className = 'tool-cost-dot tool-cost-dot--loading';
      badge.textContent = '--';
      return;
    }

    var d = ToolCostPanel._data;
    var state = ToolCostPanel._deriveState(d);
    dot.className = 'tool-cost-dot tool-cost-dot--' + state;

    if (state === 'error') {
      var ago = ToolCostPanel._fmtAgo(ToolCostPanel._lastSuccessfulFetchTs);
      body.innerHTML =
        '<div class="tool-cost-banner tool-cost-banner--error">' +
          'Tool-cost telemetry FETCH FAILED' +
          (ago ? ' &mdash; last successful fetch ' + ago : '') + '.<br>' +
          '<small>Investigate <code>/api/tool_costs</code> health.</small>' +
          ' <button class="tool-cost-retry" onclick="ToolCostPanel._refresh()">Retry</button>' +
        '</div>';
      badge.textContent = 'ERR';
      return;
    }

    if (state === 'healthy-0') {
      body.innerHTML =
        '<div class="tool-cost-message">' +
          'Telemetry not yet collected. Widget activates once tool invocations are sampled.' +
        '</div>';
      badge.textContent = '0';
      return;
    }

    // For warming + degraded + normal: render the table
    var bannerHtml = '';
    if (state === 'degraded') {
      bannerHtml =
        '<div class="tool-cost-banner tool-cost-banner--degraded">' +
          'Data stale (cache age ' + Math.round(d.meta.cache_age_ms / 1000) + 's &gt; threshold ' +
          Math.round(d.meta.stale_threshold_ms / 1000) + 's) &mdash; server may be slow refreshing.' +
        '</div>';
    } else if (state === 'warming') {
      bannerHtml =
        '<div class="tool-cost-banner tool-cost-banner--warming">' +
          'Telemetry warming up (' + d.meta.tools_with_telemetry + '/' + d.meta.total_tools_cataloged +
          ' tools sampled, window=' + d.meta.window_days + 'd) &mdash; rankings will stabilize.' +
        '</div>';
    }

    var items = d.items || [];
    var maxSpend = items.reduce(function(m, it) { return Math.max(m, it.estimated_daily_spend || 0); }, 0) || 1;
    var rows = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var barPct = Math.round((it.estimated_daily_spend / maxSpend) * 100);
      rows +=
        '<tr>' +
          '<td class="tc-rank">' + (it.rank || (i + 1)) + '</td>' +
          '<td class="tc-tool">' + ToolCostPanel._esc(it.tool_name) + '</td>' +
          '<td class="tc-spend">' +
            '<span class="tc-spend-bar" style="width:' + barPct + '%"></span>' +
            '<span class="tc-spend-val">' + ToolCostPanel._fmtK(it.estimated_daily_spend) + '</span>' +
          '</td>' +
          '<td class="tc-stats">' +
            ToolCostPanel._fmtK(it.p50_invocation_tokens) + ' / ' +
            ToolCostPanel._fmtK(it.p95_invocation_tokens) +
            ' <small>(' + (it.sample_count || 0) + ')</small>' +
          '</td>' +
        '</tr>';
    }

    body.innerHTML =
      bannerHtml +
      '<table class="tool-cost-table">' +
        '<thead><tr><th>#</th><th>tool</th><th>day-est</th><th>p50 / p95 (samples)</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    // Badge = top1 daily-spend rounded to k
    badge.textContent = items.length ? ToolCostPanel._fmtK(items[0].estimated_daily_spend) : '--';

    // Tooltip on header (AC-P5-8): "computed Ns ago" from cache_age_ms
    var titleEl = document.querySelector('#tool-cost-card .intel-card-title');
    if (titleEl) {
      titleEl.title = 'computed ' + Math.round(d.meta.cache_age_ms / 1000) + 's ago' +
                      ' (cache ttl ' + Math.round(d.meta.cache_ttl_ms / 1000) + 's)';
    }
  },

  // ═══ FORMATTERS ═══
  _fmtK: function(n) {
    if (n == null || isNaN(n)) return '--';
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  },

  _fmtAgo: function(ts) {
    if (!ts) return '';
    var dt = Math.round((Date.now() - ts) / 1000);
    if (dt < 60) return dt + 's ago';
    if (dt < 3600) return Math.floor(dt / 60) + 'm ago';
    return Math.floor(dt / 3600) + 'h ago';
  },

  _esc: function(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
};

// Auto-init on DOMContentLoaded so the feature-flag gate runs once the card slot exists
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ToolCostPanel.init);
  } else {
    ToolCostPanel.init();
  }
}
