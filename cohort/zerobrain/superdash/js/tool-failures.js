/* Superdash v2 -- Tool Failures Panel (Lessons Learned first section)
   Shows live feed of bad tool calls + 3-day aggregate leaderboard.
   Data source: /api/tool-failures (coordinator audit_log)
   Owner: UXIA | Directive: OPERATOR via DRAGON */

var ToolFailures = {
  _data: null,
  _pollTimer: null,
  _POLL_MS: 30000,

  async load() {
    try {
      var resp = await fetch(CONFIG.API_BASE + '/api/tool-failures?days=5&limit=200', {
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
      });
      if (resp.ok) {
        ToolFailures._data = await resp.json();
      }
    } catch (e) {
      // Endpoint not available yet -- degrade gracefully
      ToolFailures._data = null;
    }
  },

  startPolling() {
    if (ToolFailures._pollTimer) return;
    // Kick an immediate fetch+render so the first paint shows data instead of the
    // "Waiting for tool-failures API" placeholder for 30s. (UXIA 2026-06-04)
    var refresh = async function() {
      await ToolFailures.load();
      var section = document.querySelector('.tf-section');
      if (section) {
        var tmp = document.createElement('div');
        tmp.innerHTML = ToolFailures.renderSection();
        section.replaceWith(tmp.firstElementChild);
      }
    };
    refresh();
    ToolFailures._pollTimer = setInterval(refresh, ToolFailures._POLL_MS);
  },

  stopPolling() {
    if (ToolFailures._pollTimer) {
      clearInterval(ToolFailures._pollTimer);
      ToolFailures._pollTimer = null;
    }
  },

  _activeView: 'feed',

  renderSection() {
    var data = ToolFailures._data;
    var html = '<div class="tf-section">';
    html += '<div class="tf-header">';
    html += '<span class="tf-title">&#9888; Tool Failures</span>';
    if (data && data.recent) {
      var count = data.recent.length;
      html += '<span class="tf-badge">' + count + ' in last ' + (data.days || 3) + 'd</span>';
    }
    html += '</div>';

    if (!data || data.error) {
      html += '<div class="tf-empty">Waiting for tool-failures API (requires coordinator with audit_log).</div>';
      html += '</div>';
      return html;
    }

    // Tab bar
    var av = ToolFailures._activeView;
    html += '<div class="tf-tabs">';
    html += '<button class="tf-tab' + (av === 'feed' ? ' active' : '') + '" onclick="ToolFailures.switchView(\'feed\')">Live Feed</button>';
    html += '<button class="tf-tab' + (av === 'top' ? ' active' : '') + '" onclick="ToolFailures.switchView(\'top\')">Top Failures</button>';
    html += '<button class="tf-tab' + (av === 'nodes' ? ' active' : '') + '" onclick="ToolFailures.switchView(\'nodes\')">Per Node</button>';
    html += '</div>';

    // Live Feed view
    html += '<div class="tf-live tf-view" style="display:' + (av === 'feed' ? 'block' : 'none') + '">';
    if (!data.recent || data.recent.length === 0) {
      html += '<div class="tf-empty">No tool failures recorded. &#10003;</div>';
    } else {
      html += '<div class="tf-feed">';
      var items = data.recent.slice(0, 25);
      items.forEach(function(item) {
        html += ToolFailures._renderFeedItem(item);
      });
      if (data.recent.length > 25) {
        html += '<div class="tf-more">+ ' + (data.recent.length - 25) + ' more</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Top Failures view
    html += '<div class="tf-agg tf-view" style="display:' + (av === 'top' ? 'block' : 'none') + '">';
    html += '<div class="tf-sub-title">Top Failures (last ' + (data.days || 3) + ' days)</div>';
    if (!data.aggregated || data.aggregated.length === 0) {
      html += '<div class="tf-empty">No aggregated data yet.</div>';
    } else {
      html += '<div class="tf-leaderboard">';
      data.aggregated.forEach(function(item, idx) {
        html += ToolFailures._renderAggItem(item, idx);
      });
      html += '</div>';
    }
    html += '</div>';

    // Per Node view
    html += ToolFailures._renderPerNode(av === 'nodes');

    html += '</div>';
    return html;
  },

  switchView(view) {
    ToolFailures._activeView = view;
    // Update tab active state
    document.querySelectorAll('.tf-tab').forEach(function(t) {
      t.classList.remove('active');
    });
    var tabs = document.querySelectorAll('.tf-tab');
    tabs.forEach(function(t) {
      if ((view === 'feed' && t.textContent === 'Live Feed')
        || (view === 'top' && t.textContent === 'Top Failures')
        || (view === 'nodes' && t.textContent === 'Per Node')) {
        t.classList.add('active');
      }
    });
    // Toggle view visibility
    var section = document.querySelector('.tf-section');
    if (!section) return;
    section.querySelectorAll('.tf-view').forEach(function(v) { v.style.display = 'none'; });
    var sel = view === 'feed' ? '.tf-live' : view === 'top' ? '.tf-agg' : '.tf-per-node';
    var target = section.querySelector(sel);
    if (target) target.style.display = 'block';
  },

  _renderPerNode(visible) {
    var data = ToolFailures._data;
    var perNode = data ? data.per_node : null;
    var html = '<div class="tf-per-node tf-view" style="display:' + (visible ? 'block' : 'none') + '">';

    if (!perNode || Object.keys(perNode).length === 0) {
      html += '<div class="tf-empty">No per-node failure data.</div>';
      html += '</div>';
      return html;
    }

    html += '<div class="tf-node-grid">';
    var nodes = Object.keys(perNode).sort();
    nodes.forEach(function(nodeId) {
      var tools = perNode[nodeId];
      var totalCount = tools.reduce(function(sum, t) { return sum + (t.count || 0); }, 0);
      var latestSeen = tools.reduce(function(latest, t) {
        if (!t.last_seen) return latest;
        return (!latest || t.last_seen > latest) ? t.last_seen : latest;
      }, null);
      var nodeColor = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[nodeId]) || '#8b949e';

      html += '<div class="tf-node-card">';
      html += '<div class="tf-node-header">';
      html += '<span class="tf-node-name" style="color:' + nodeColor + '">' + Panels.esc(nodeId) + '</span>';
      html += '<span class="tf-node-total">' + totalCount + ' failure' + (totalCount !== 1 ? 's' : '') + '</span>';
      html += '</div>';

      if (latestSeen) {
        html += '<div class="tf-node-last">Last: ' + ToolFailures._relativeTime(latestSeen) + '</div>';
      }

      html += '<div class="tf-node-tools">';
      tools.slice(0, 5).forEach(function(t) {
        html += '<div class="tf-node-tool-row">';
        html += '<span class="tf-node-tool-name">' + Panels.esc(t.tool_name || '--') + '</span>';
        html += '<span class="tf-node-tool-count">' + (t.count || 0) + 'x</span>';
        html += '</div>';
      });
      if (tools.length > 5) {
        html += '<div class="tf-more">+ ' + (tools.length - 5) + ' more tools</div>';
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    return html;
  },

  _renderFeedItem(item) {
    var ts = item.timestamp ? ToolFailures._relativeTime(item.timestamp) : '--';
    var node = item.actor_node || 'unknown';
    var tool = item.tool_name || '--';
    var detail = item.detail || '';
    var nodeColor = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[node]) || '#8b949e';

    var html = '<div class="tf-feed-item">';
    html += '<span class="tf-feed-ts">' + Panels.esc(ts) + '</span>';
    html += '<span class="tf-feed-node" style="color:' + nodeColor + '">' + Panels.esc(node) + '</span>';
    html += '<span class="tf-feed-tool">' + Panels.esc(tool) + '</span>';
    html += '<span class="tf-feed-detail">' + Panels.esc(detail) + '</span>';
    html += '</div>';
    return html;
  },

  _renderAggItem(item, idx) {
    var rank = idx + 1;
    var tool = item.tool_name || '--';
    var count = item.count || 0;
    var nodes = item.nodes || '--';
    var lastSeen = item.last_seen ? ToolFailures._relativeTime(item.last_seen) : '--';

    var html = '<div class="tf-agg-item">';
    html += '<span class="tf-agg-rank">#' + rank + '</span>';
    html += '<span class="tf-agg-tool">' + Panels.esc(tool) + '</span>';
    html += '<span class="tf-agg-count">' + count + 'x</span>';
    html += '<span class="tf-agg-nodes">' + Panels.esc(nodes) + '</span>';
    html += '<span class="tf-agg-last">' + Panels.esc(lastSeen) + '</span>';
    html += '</div>';
    return html;
  },

  _relativeTime(ts) {
    var now = Date.now();
    var t = new Date(ts).getTime();
    var diff = Math.abs(now - t);
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }
};
