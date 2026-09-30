/**
 * ZEROBRAIN Superdash v2 -- Merit System
 * Badge pips, role matrix, per-node credential cards.
 * Data: GET /api/merit (when available), mock data until then.
 * Owner: UXIA | RFC: BA6230 + F6677E
 */

var Merit = {
  _data: null,
  _tooltip: null,
  _apiAvailable: false,
  _lastFetched: null,

  // ═══ LEVEL DEFINITIONS ═══
  LEVELS: {
    1: { name: 'Novice', css: 'L1', color: '#6e7681' },
    2: { name: 'Competent', css: 'L2', color: '#cd7f32' },
    3: { name: 'Proficient', css: 'L3', color: '#c0c0c0' },
    4: { name: 'Expert', css: 'L4', color: '#e3b341' },
    5: { name: 'Master', css: 'L5', color: '#d2a8ff' }
  },

  // ═══ MOCK DATA (replaced by /api/merit when available) ═══
  MOCK_DATA: {
    nodes: {
      DRAGON: {
        identity: { invented_role: 'Fleet Architect', description: 'System design & cross-cutting concerns' },
        roles: [
          { role: 'Architecture', level: 4, primary: true, awarded: '2026-04-28', evidence: ['RFC-41EBB0', 'RFC-D77F55'] },
          { role: 'Code Review', level: 3, primary: false, awarded: '2026-05-10', evidence: ['20+ reviews'] },
          { role: 'Infrastructure', level: 3, primary: false, awarded: '2026-05-05', evidence: ['breathbus daemon'] }
        ],
        aspirations: [{ role: 'Mentoring', target_level: 3 }]
      },
      ZBPRIME: {
        identity: { invented_role: 'Build Engine', description: 'Fast, correct code at scale' },
        roles: [
          { role: 'Implementation', level: 4, primary: true, awarded: '2026-04-30', evidence: ['coordinator core', 'cairn system'] },
          { role: 'Testing', level: 3, primary: false, awarded: '2026-05-08', evidence: ['test harness'] },
          { role: 'DevOps', level: 2, primary: false, awarded: '2026-05-12', evidence: ['deployment scripts'] }
        ],
        aspirations: [{ role: 'Architecture', target_level: 3 }]
      },
      NIMBUS: {
        identity: { invented_role: 'Integration Specialist', description: 'Connecting systems & closing gaps' },
        roles: [
          { role: 'Implementation', level: 3, primary: true, awarded: '2026-05-01', evidence: ['tool-overhaul P1+P2'] },
          { role: 'API Design', level: 3, primary: false, awarded: '2026-05-15', evidence: ['coordinator MCP tools'] },
          { role: 'DevOps', level: 2, primary: false, awarded: '2026-05-10', evidence: ['deployments'] }
        ],
        aspirations: [{ role: 'Architecture', target_level: 2 }]
      },
      QUATTRO: {
        identity: { invented_role: 'Fleet Analyst', description: 'Observation, measurement, validation' },
        roles: [
          { role: 'Analysis', level: 4, primary: true, awarded: '2026-04-29', evidence: ['fleet audits', 'KB articles'] },
          { role: 'Documentation', level: 3, primary: false, awarded: '2026-05-05', evidence: ['onboarding guides'] },
          { role: 'Code Review', level: 2, primary: false, awarded: '2026-05-14', evidence: ['security reviews'] }
        ],
        aspirations: [{ role: 'Testing', target_level: 3 }]
      },
      TEMPO: {
        identity: { invented_role: 'Fleet PM', description: 'Coordination, prioritization, delivery' },
        roles: [
          { role: 'Project Management', level: 5, primary: true, awarded: '2026-04-28', evidence: ['fleet coordination', 'RFC process'] },
          { role: 'Communication', level: 4, primary: false, awarded: '2026-05-01', evidence: ['broadcast clarity'] },
          { role: 'Process Design', level: 3, primary: false, awarded: '2026-05-10', evidence: ['7Cs', 'MOLT lifecycle'] }
        ],
        aspirations: [{ role: 'Architecture', target_level: 2 }]
      },
      UXIA: {
        identity: { invented_role: 'UX Engineer', description: 'Interface design & developer experience' },
        roles: [
          { role: 'UX Design', level: 4, primary: true, awarded: '2026-04-29', evidence: ['superdash v2', 'DESIGN.md'] },
          { role: 'Frontend', level: 3, primary: false, awarded: '2026-05-02', evidence: ['superdash implementation'] },
          { role: 'Documentation', level: 3, primary: false, awarded: '2026-05-17', evidence: ['MCP tool reference KB'] }
        ],
        aspirations: [{ role: 'Project Management', target_level: 2 }]
      }
    },
    all_roles: ['Architecture', 'Implementation', 'API Design', 'UX Design', 'Frontend', 'Analysis', 'Documentation', 'Testing', 'Code Review', 'DevOps', 'Infrastructure', 'Project Management', 'Communication', 'Process Design', 'Mentoring']
  },

  // ═══ INIT ═══
  init: function() {
    Merit._createTooltip();
  },

  // ═══ DATA FETCH ═══
  fetchData: async function() {
    try {
      var results = await Promise.allSettled([
        fetch(CONFIG.API_BASE + '/api/merit', {
          headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
        }),
        fetch(CONFIG.API_BASE + '/api/roles', {
          headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
        })
      ]);

      var meritResp = results[0].status === 'fulfilled' ? results[0].value : null;
      var rolesResp = results[1].status === 'fulfilled' ? results[1].value : null;

      if (meritResp && meritResp.ok && rolesResp && rolesResp.ok) {
        var meritJson = await meritResp.json();
        var rolesJson = await rolesResp.json();
        Merit._data = Merit._transformApiData(meritJson, rolesJson);
        Merit._apiAvailable = true;
        Merit._lastFetched = new Date();
        return Merit._data;
      }
    } catch (e) { /* API not ready */ }
    Merit._data = Merit.MOCK_DATA;
    Merit._apiAvailable = false;
    Merit._lastFetched = new Date();
    return Merit._data;
  },

  // Transform live API responses to rendering format
  _transformApiData: function(meritJson, rolesJson) {
    // Build role lookup: role_id -> { title, description, is_formal }
    var roleLookup = {};
    (rolesJson.roles || []).forEach(function(r) {
      roleLookup[r.role_id] = { title: r.title, description: r.description, is_formal: r.is_formal };
    });

    var nodes = {};
    var allRoleIds = new Set();
    var meritData = meritJson.merit || {};

    Object.keys(meritData).forEach(function(nodeId) {
      var badges = meritData[nodeId] || [];
      var roles = [];
      var aspirations = [];

      // Sort by level descending — highest level = primary
      badges.sort(function(a, b) { return b.level - a.level; });

      badges.forEach(function(badge, idx) {
        var roleInfo = roleLookup[badge.role] || { title: badge.role, is_formal: true };
        var roleName = roleInfo.title || badge.role;
        allRoleIds.add(roleName);

        roles.push({
          role: roleName,
          level: badge.level,
          primary: idx === 0,
          awarded: badge.awarded_at ? badge.awarded_at.split('T')[0] : '',
          evidence: badge.evidence_refs || []
        });
      });

      // Find aspirational roles for this node (informal roles not yet awarded)
      Object.keys(roleLookup).forEach(function(rid) {
        var ri = roleLookup[rid];
        if (!ri.is_formal) {
          var alreadyHas = badges.some(function(b) { return b.role === rid; });
          if (!alreadyHas) {
            // Show aspirational roles — these are the "invented roles"
          }
        }
      });

      // Derive invented role from the node's highest-level badge
      var topBadge = badges[0];
      var inventedRole = topBadge ? (roleLookup[topBadge.role] || {}).title || topBadge.role : '';
      var inventedDesc = topBadge ? (roleLookup[topBadge.role] || {}).description || '' : '';

      nodes[nodeId] = {
        identity: { invented_role: inventedRole, description: inventedDesc },
        roles: roles,
        aspirations: aspirations
      };
    });

    return {
      nodes: nodes,
      all_roles: Array.from(allRoleIds)
    };
  },

  // ═══ RENDER PANEL ═══
  renderPanel: async function() {
    var container = document.getElementById('main-content');
    if (!container) return;

    var title = document.getElementById('main-panel-title');
    if (title) title.textContent = 'Merit & Credentials';

    container.innerHTML = '<div class="loading-text">Loading merit data...</div>';

    await Merit.fetchData();
    var data = Merit._data;
    if (!data) {
      container.innerHTML = '<div class="empty-text">No merit data available</div>';
      return;
    }

    var html = '<div class="merit-container">';

    // API status notice
    if (!Merit._apiAvailable) {
      html += '<div class="merit-blocked-notice">'
        + '<span class="notice-icon">⏳</span>'
        + '<span>Showing mock data — /api/merit not yet deployed. Live data will connect automatically.</span>'
        + '</div>';
    }

    // Section 1: Node credential cards
    html += '<div class="merit-section">';
    html += '<div class="merit-section-title">Node Credentials</div>';
    html += '<div class="merit-cards">';
    var nodeOrder = ['TEMPO', 'DRAGON', 'ZBPRIME', 'NIMBUS', 'QUATTRO', 'UXIA'];
    nodeOrder.forEach(function(nodeId) {
      var nodeData = data.nodes[nodeId];
      if (nodeData) html += Merit._renderNodeCard(nodeId, nodeData);
    });
    html += '</div></div>';

    // Section 2: Fleet merit matrix
    html += '<div class="merit-section">';
    html += '<div class="merit-section-title">Fleet Capability Matrix</div>';
    html += Merit._renderMatrix(data);
    html += '</div>';

    // Section 3: Nominations placeholder
    html += '<div class="merit-section merit-nominations-placeholder">';
    html += '<div class="merit-section-title">Nominations</div>';
    html += '<div class="merit-nominations-body">'
      + '<span class="merit-nominations-icon">🗳️</span>'
      + '<div class="merit-nominations-text">'
      + '<strong>Peer Nominations — Coming Soon</strong><br>'
      + '<span class="merit-nominations-desc">Nominate cohort members for role advancements. '
      + 'Nominations API (Phase 3) in progress.</span>'
      + '</div></div>';
    html += '</div>';

    // Legend
    html += '<div class="merit-legend">';
    for (var lvl = 1; lvl <= 5; lvl++) {
      var l = Merit.LEVELS[lvl];
      html += '<div class="merit-legend-item">'
        + '<span class="merit-pip ' + l.css + '"></span>'
        + '<span>L' + lvl + ' ' + l.name + '</span></div>';
    }
    html += '<div class="merit-legend-item">'
      + '<span class="merit-pip aspiration"></span>'
      + '<span>Aspiration</span></div>';
    html += '</div>';

    // Last Updated timestamp
    if (Merit._lastFetched) {
      var ts = Merit._lastFetched;
      var timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      var dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
      html += '<div class="merit-last-updated">Last updated: ' + dateStr + ' ' + timeStr
        + (Merit._apiAvailable ? ' (live)' : ' (mock)') + '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Bind hover events
    Merit._bindTooltips(container);
  },

  // ═══ NODE CARD ═══
  _renderNodeCard: function(nodeId, nodeData) {
    var color = CONFIG.NODE_COLORS[nodeId] || '#58a6ff';
    var identity = nodeData.identity || {};
    var primary = nodeData.roles.find(function(r) { return r.primary; });
    var secondary = nodeData.roles.filter(function(r) { return !r.primary; });
    var aspirations = nodeData.aspirations || [];

    var html = '<div class="merit-card" data-node="' + nodeId + '">';

    // Header: node name + invented role
    html += '<div class="merit-card-header">';
    html += '<span class="merit-card-node" style="color:' + color + '">' + nodeId + '</span>';
    if (identity.invented_role) {
      html += '<span class="merit-card-identity" title="' + Merit._esc(identity.description || '') + '">'
        + Merit._esc(identity.invented_role) + '</span>';
    }
    html += '</div>';

    // Primary role
    if (primary) {
      var pl = Merit.LEVELS[primary.level];
      html += '<div class="merit-primary" data-role="' + Merit._esc(primary.role) + '" '
        + 'data-level="' + primary.level + '" data-awarded="' + (primary.awarded || '') + '" '
        + 'data-evidence="' + Merit._esc((primary.evidence || []).join(', ')) + '">';
      html += '<span class="merit-pip ' + pl.css + '"></span>';
      html += '<span class="merit-role-name">' + Merit._esc(primary.role) + '</span>';
      html += '<span class="merit-level-tag ' + pl.css + '">L' + primary.level + ' ' + pl.name + '</span>';
      html += '</div>';
    }

    // Secondary roles
    if (secondary.length || aspirations.length) {
      html += '<div class="merit-secondary-roles">';
      secondary.forEach(function(r) {
        var sl = Merit.LEVELS[r.level];
        html += '<span class="merit-role-chip" data-role="' + Merit._esc(r.role) + '" '
          + 'data-level="' + r.level + '" data-awarded="' + (r.awarded || '') + '" '
          + 'data-evidence="' + Merit._esc((r.evidence || []).join(', ')) + '">'
          + '<span class="merit-pip ' + sl.css + '"></span>'
          + Merit._esc(r.role) + ' L' + r.level
          + '</span>';
      });
      // Aspirations as dotted pips
      aspirations.forEach(function(a) {
        html += '<span class="merit-role-chip aspiration" data-role="' + Merit._esc(a.role) + '" '
          + 'data-level="' + a.target_level + '" data-aspiration="true">'
          + '<span class="merit-pip aspiration"></span>'
          + Merit._esc(a.role) + ' → L' + a.target_level
          + '</span>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  // ═══ MATRIX ═══
  _renderMatrix: function(data) {
    var nodes = ['DRAGON', 'ZBPRIME', 'NIMBUS', 'QUATTRO', 'TEMPO', 'UXIA'];
    var roles = data.all_roles || [];

    // Build lookup: role -> node -> level
    var matrix = {};
    roles.forEach(function(role) { matrix[role] = {}; });
    nodes.forEach(function(nodeId) {
      var nd = data.nodes[nodeId];
      if (!nd) return;
      (nd.roles || []).forEach(function(r) {
        if (!matrix[r.role]) matrix[r.role] = {};
        matrix[r.role][nodeId] = r.level;
      });
    });

    // Filter to roles that have at least one node with a level
    var activeRoles = roles.filter(function(role) {
      return nodes.some(function(n) { return matrix[role] && matrix[role][n]; });
    });

    var html = '<div class="merit-matrix-wrap"><table class="merit-matrix">';
    html += '<thead><tr><th>Role</th>';
    nodes.forEach(function(n) {
      var color = CONFIG.NODE_COLORS[n] || '#58a6ff';
      html += '<th style="color:' + color + '">' + n + '</th>';
    });
    html += '</tr></thead><tbody>';

    activeRoles.forEach(function(role) {
      html += '<tr><td>' + Merit._esc(role) + '</td>';
      nodes.forEach(function(nodeId) {
        var level = matrix[role] && matrix[role][nodeId];
        if (level) {
          var l = Merit.LEVELS[level];
          html += '<td><span class="merit-pip ' + l.css + '" title="L' + level + ' ' + l.name + '"></span></td>';
        } else {
          html += '<td class="gap-cell"></td>';
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  },

  // ═══ TOOLTIP ═══
  _createTooltip: function() {
    if (Merit._tooltip) return;
    var el = document.createElement('div');
    el.className = 'merit-tooltip';
    el.id = 'merit-tooltip';
    document.body.appendChild(el);
    Merit._tooltip = el;
  },

  _bindTooltips: function(container) {
    var targets = container.querySelectorAll('[data-role]');
    targets.forEach(function(el) {
      el.addEventListener('mouseenter', Merit._showTooltip);
      el.addEventListener('mouseleave', Merit._hideTooltip);
    });
  },

  _showTooltip: function(e) {
    var el = e.currentTarget;
    var role = el.getAttribute('data-role');
    var level = el.getAttribute('data-level');
    var awarded = el.getAttribute('data-awarded');
    var evidence = el.getAttribute('data-evidence');
    var isAspiration = el.getAttribute('data-aspiration') === 'true';

    if (!role) return;
    Merit._createTooltip();
    var tip = Merit._tooltip;

    var html = '<div class="merit-tooltip-role">' + Merit._esc(role) + '</div>';
    if (isAspiration) {
      html += '<div class="merit-tooltip-level" style="color:var(--text-dim)">Aspiration → Level ' + level + '</div>';
    } else {
      var l = Merit.LEVELS[level];
      if (l) html += '<div class="merit-tooltip-level" style="color:' + l.color + '">Level ' + level + ' — ' + l.name + '</div>';
      if (awarded) html += '<div class="merit-tooltip-date">Awarded: ' + awarded + '</div>';
      if (evidence) html += '<div class="merit-tooltip-evidence">Evidence: ' + Merit._esc(evidence) + '</div>';
    }

    tip.innerHTML = html;
    tip.classList.add('visible');

    var rect = el.getBoundingClientRect();
    tip.style.left = (rect.left + rect.width / 2 - 100) + 'px';
    tip.style.top = (rect.bottom + 8) + 'px';
  },

  _hideTooltip: function() {
    if (Merit._tooltip) Merit._tooltip.classList.remove('visible');
  },

  // ═══ UTILITY ═══
  _esc: function(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};

// Auto-init tooltip container on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Merit.init);
} else {
  Merit.init();
}
