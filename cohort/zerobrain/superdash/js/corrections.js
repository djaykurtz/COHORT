/* Superdash v2 -- Corrections / Lessons Learned Panel
   Wires to coordinator /api/corrections endpoints (pending ZBPRIME build).
   Owner: UXIA | RFC: 84BE18 */

var Corrections = {
  _data: null,
  _loading: false,
  _apiAvailable: false,
  _lessonsCollapsed: true,
  _showArchived: false,

  // Status display config
  STATUS: {
    active:   { label: 'ACTIVE',   css: 'status-active',   color: '#f85149', icon: '!' },
    learned:  { label: 'LEARNED',  css: 'status-learned',  color: '#3fb950', icon: 'v' },
    archived: { label: 'ARCHIVED', css: 'status-archived', color: '#6e7681', icon: '-' }
  },

  // Known fleet nodes
  NODES: ['ZBPRIME', 'NIMBUS', 'UXIA', 'TEMPO', 'QUATTRO', 'DRAGON'],

  async load() {
    Corrections._loading = true;
    var allCorrections = [];
    var summaryTotals = { active: 0, learned: 0, archived: 0, total: 0, relapses: 0 };
    var apiHit = false;

    // Fetch corrections for each node
    var fetches = Corrections.NODES.map(async function(nodeId) {
      try {
        var resp = await fetch(CONFIG.API_BASE + '/api/corrections/' + nodeId, {
          headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
        });
        if (resp.ok) {
          var data = await resp.json();
          apiHit = true;
          var items = data.history && data.history.corrections ? data.history.corrections : [];
          items.forEach(function(c) { allCorrections.push(c); });
          if (data.history && data.history.summary) {
            var s = data.history.summary;
            summaryTotals.active += s.active || 0;
            summaryTotals.learned += s.learned || 0;
            summaryTotals.archived += s.archived || 0;
            summaryTotals.total += s.total || 0;
          }
        }
      } catch (e) {
        // Node endpoint not available yet
      }
    });

    await Promise.all(fetches);

    // Count total relapses
    allCorrections.forEach(function(c) {
      summaryTotals.relapses += c.relapse_count || 0;
    });

    if (apiHit) {
      Corrections._apiAvailable = true;
      Corrections._data = {
        corrections: allCorrections,
        stats: summaryTotals,
        fleet_lessons: allCorrections.filter(function(c) { return c.scope === 'fleet'; })
      };
    } else {
      Corrections._apiAvailable = false;
      Corrections._data = null;
    }
    Corrections._loading = false;
  },

  renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Lessons Learned';
    badge.textContent = '';

    if (Corrections._loading) {
      content.innerHTML = '<div class="corrections-loading">Loading corrections data...</div>';
      return;
    }

    // Tool Failures section renders independently (uses /api/tool-failures)
    var html = '<div class="corrections-panel">';
    html += ToolFailures.renderSection();

    if (!Corrections._apiAvailable || !Corrections._data) {
      html += Corrections._renderLessonsCollapsible(Corrections._renderWaitingForApi());
    } else {
      var lessonsHtml = Corrections._renderToolbar();
      lessonsHtml += '<div class="corrections-body">';
      lessonsHtml += Corrections._renderCriticalSurface();
      lessonsHtml += Corrections._renderNodeLessons();
      lessonsHtml += Corrections._renderFleetLessons();
      lessonsHtml += Corrections._renderTrajectory();
      lessonsHtml += '</div>';
      html += Corrections._renderLessonsCollapsible(lessonsHtml);
    }
    html += '</div>';

    content.innerHTML = html;

    // Update badge with counts
    if (Corrections._apiAvailable && Corrections._data) {
      var data = Corrections._data;
      var corrections = data.corrections || data.items || [];
      var activeCount = corrections.filter(function(c) {
        return c.status === 'ACTIVE';
      }).length;
      badge.textContent = activeCount > 0 ? activeCount + ' active' : 'all clear';
    }

    // Start auto-refresh for tool failures
    ToolFailures.startPolling();
  },

  _renderLessonsCollapsible(innerHtml) {
    var collapsed = Corrections._lessonsCollapsed;
    var toggle = collapsed ? '▶' : '▼';
    var html = '<div class="corrections-collapsible">';
    html += '<button type="button" class="corrections-collapsible-header" onclick="Corrections.toggleLessons()" aria-expanded="' + (!collapsed) + '" aria-controls="corrections-lessons-body" style="cursor:pointer;user-select:none">';
    html += '<span class="corrections-collapse-toggle">' + toggle + '</span>';
    html += '<span class="corrections-collapsible-title">Behavioral Lessons &amp; Corrections</span>';
    html += '</button>';
    if (!collapsed) {
      html += '<div class="corrections-collapsible-body" id="corrections-lessons-body">';
      html += innerHtml;
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  toggleLessons() {
    Corrections._lessonsCollapsed = !Corrections._lessonsCollapsed;
    Corrections.renderPanel();
  },

  _renderWaitingForApi() {
    return '<div class="corrections-panel">'
      + '<div class="corrections-waiting">'
      + '<div class="corrections-waiting-icon">&#128218;</div>'
      + '<div class="corrections-waiting-title">Lessons Learned Panel</div>'
      + '<div class="corrections-waiting-text">'
      + 'Waiting for corrections API (ZBPRIME: corrections-schema-graduation task).<br>'
      + 'This panel will show per-node lessons learned, fleet-wide wisdom, and learning trajectory once the API lands.'
      + '</div>'
      + '<div class="corrections-preview">'
      + '<div class="corrections-preview-title">What you will see:</div>'
      + '<div class="corrections-preview-items">'
      + '<span class="corrections-preview-chip active">Active lessons (red)</span>'
      + '<span class="corrections-preview-chip learned">Learned (green)</span>'
      + '<span class="corrections-preview-chip archived">Archived (gray)</span>'
      + '<span class="corrections-preview-chip fleet">Fleet-wide wisdom</span>'
      + '<span class="corrections-preview-chip trajectory">Learning trajectory</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  },

  _renderToolbar() {
    var data = Corrections._data || {};
    var corrections = data.corrections || data.items || [];
    var archivedCount = corrections.filter(function(c) { return c.status === 'ARCHIVED'; }).length;
    var toggleLabel = Corrections._showArchived ? 'Hide archived' : 'Show archived';
    var togglePressed = Corrections._showArchived ? 'true' : 'false';
    return '<div class="corrections-toolbar">'
      + '<div class="corrections-view-tabs">'
      + '<button class="corrections-tab active" onclick="Corrections.switchView(\'nodes\')">Per-Node</button>'
      + '<button class="corrections-tab" onclick="Corrections.switchView(\'fleet\')">Fleet Lessons</button>'
      + '<button class="corrections-tab" onclick="Corrections.switchView(\'trajectory\')">Trajectory</button>'
      + '</div>'
      + '<button class="corrections-archived-toggle" onclick="Corrections.toggleArchived()" aria-pressed="' + togglePressed + '" title="Toggle visibility of archived lessons">'
      +    toggleLabel + ' (' + archivedCount + ')'
      + '</button>'
      + '</div>';
  },

  toggleArchived() {
    Corrections._showArchived = !Corrections._showArchived;
    Corrections.renderPanel();
  },

  _renderCriticalSurface() {
    var data = Corrections._data;
    var corrections = (data && (data.corrections || data.items)) || [];
    var critical = corrections.filter(function(c) {
      return c.severity === 'CRITICAL' && c.status !== 'ARCHIVED';
    });
    if (!critical.length) return '';
    // Sort newest first so the most recent critical lessons surface at top
    critical.sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    var html = '<div class="corrections-critical-surface">';
    html += '<div class="critical-surface-title">'
      + '<span class="critical-dot">●</span> Critical / Active'
      + ' <span class="critical-count">(' + critical.length + ')</span>'
      + '</div>';
    html += '<div class="critical-surface-list">';
    critical.forEach(function(c) {
      var node = Panels.esc(c.node_id || c.node || '?');
      var title = Panels.esc(c.distilled_principle || c.text || '--');
      var age = c.created_at ? Corrections._relativeTime(c.created_at) : '';
      html += '<div class="critical-row">'
        + '<span class="critical-node">' + node + '</span>'
        + '<span class="critical-title">' + title + '</span>'
        + '<span class="critical-age">' + age + '</span>'
        + '</div>';
    });
    html += '</div></div>';
    return html;
  },

  _renderNodeLessons() {
    var data = Corrections._data;
    var corrections = data.corrections || data.items || [];
    if (!corrections.length) {
      return '<div class="corrections-empty">No lessons recorded yet.</div>';
    }

    // Group by node
    var byNode = {};
    corrections.forEach(function(c) {
      var node = c.node_id || c.node || 'Unknown';
      if (!byNode[node]) byNode[node] = [];
      byNode[node].push(c);
    });

    var html = '<div class="corrections-nodes">';
    Object.keys(byNode).sort().forEach(function(node) {
      var items = byNode[node];
      var activeCount = items.filter(function(c) { return c.status === 'ACTIVE'; }).length;
      var learnedCount = items.filter(function(c) { return c.status === 'LEARNED'; }).length;
      var archivedCount = items.filter(function(c) { return c.status === 'ARCHIVED'; }).length;
      var visibleItems = Corrections._showArchived
        ? items
        : items.filter(function(c) { return c.status !== 'ARCHIVED'; });

      html += '<div class="corrections-node-group collapsed">';
      var nodeBodyId = 'corrections-node-body-' + node.replace(/[^a-zA-Z0-9]/g, '');
      html += '<button type="button" class="corrections-node-header" onclick="Corrections.toggleNode(this)" aria-expanded="false" aria-controls="' + nodeBodyId + '">';
      html += '<span class="corrections-node-toggle">+</span>';
      html += '<span class="corrections-node-name">' + Panels.esc(node) + '</span>';
      html += '<span class="corrections-node-counts">';
      if (activeCount > 0) html += '<span class="count-active">' + activeCount + ' active</span>';
      if (learnedCount > 0) html += '<span class="count-learned">' + learnedCount + ' learned</span>';
      if (archivedCount > 0 && !Corrections._showArchived) {
        html += '<span class="count-archived-hidden" title="Archived lessons hidden -- toggle in toolbar">' + archivedCount + ' archived (hidden)</span>';
      } else if (archivedCount > 0) {
        html += '<span class="count-archived">' + archivedCount + ' archived</span>';
      }
      html += '</span>';
      html += '</button>';

      html += '<div class="corrections-node-body" id="' + nodeBodyId + '">';
      if (!visibleItems.length) {
        html += '<div class="corrections-empty corrections-empty-inline">All lessons in this node are archived. Toggle "Show archived" to view.</div>';
      } else {
        visibleItems.forEach(function(c) {
          html += Corrections._renderLessonCard(c);
        });
      }
      html += '</div>'; // close node-body

      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  _renderLessonCard(c) {
    var statusCfg = Corrections.STATUS[c.status.toLowerCase()] || Corrections.STATUS.active;
    var relapse = c.relapse_count || 0;
    var created = c.created_at ? Corrections._relativeTime(c.created_at) : '--';
    var graduated = c.graduated_at ? Corrections._relativeTime(c.graduated_at) : null;
    var sevLabel = c.severity === 'CRITICAL' ? ' CRIT' : '';
    var pinnedLabel = c.pinned ? ' [pinned]' : '';

    var html = '<div class="lesson-card ' + statusCfg.css + '">';
    html += '<div class="lesson-header">';
    html += '<span class="lesson-status" style="color:' + statusCfg.color + '">' + statusCfg.label + sevLabel + '</span>';
    html += '<span class="lesson-title">' + Panels.esc(c.distilled_principle || c.text || '--') + pinnedLabel + '</span>';
    if (relapse > 0) {
      html += '<span class="lesson-relapse" title="Relapse count">' + relapse + 'x relapsed</span>';
    }
    html += '</div>';
    if (c.distilled_principle && c.text) {
      html += '<div class="lesson-body">' + Panels.esc(c.text) + '</div>';
    }
    html += '<div class="lesson-meta">';
    html += '<span>Created: ' + created + '</span>';
    if (graduated) html += '<span>Graduated: ' + graduated + '</span>';
    html += '<span>' + Panels.esc(c.track || 'learnable') + ' / ' + Panels.esc(c.scope || 'personal') + '</span>';
    if (c.boots_since_active > 0) html += '<span>' + c.boots_since_active + ' boots clean</span>';
    html += '</div>';
    html += '</div>';
    return html;
  },

  _renderFleetLessons() {
    var data = Corrections._data;
    var fleet = data.fleet_lessons || data.fleet || [];
    if (!fleet.length) {
      return '<div class="corrections-empty">No fleet-wide lessons yet.</div>';
    }

    var html = '<div class="corrections-fleet">';
    html += '<div class="corrections-section-title">Fleet-Wide Wisdom</div>';
    fleet.forEach(function(lesson) {
      html += '<div class="fleet-lesson-card">';
      html += '<div class="fleet-lesson-title">' + Panels.esc(lesson.distilled_principle || lesson.text || '') + '</div>';
      if (lesson.distilled_principle && lesson.text) {
        html += '<div class="fleet-lesson-body">' + Panels.esc(lesson.text) + '</div>';
      }
      html += '<div class="fleet-lesson-meta">';
      html += '<span>Origin: ' + Panels.esc(lesson.node_id || '--') + '</span>';
      html += '<span>Created: ' + (lesson.created_at ? Corrections._relativeTime(lesson.created_at) : '--') + '</span>';
      html += '<span>' + Panels.esc(lesson.severity || '') + '</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  _renderTrajectory() {
    var data = Corrections._data;
    var stats = data.stats || data.trajectory || {};

    var total = stats.total || 0;
    var active = stats.active || 0;
    var learned = stats.learned || 0;
    var archived = stats.archived || 0;
    var relapses = stats.relapses || stats.total_relapses || 0;

    if (total === 0) {
      return '<div class="corrections-empty">No trajectory data yet.</div>';
    }

    var learnedPct = total > 0 ? Math.round((learned / total) * 100) : 0;

    var html = '<div class="corrections-trajectory">';
    html += '<div class="corrections-section-title">Learning Trajectory</div>';
    html += '<div class="trajectory-stats">';
    html += '<div class="trajectory-stat"><span class="trajectory-num" style="color:#f85149">' + active + '</span><span class="trajectory-label">Active</span></div>';
    html += '<div class="trajectory-stat"><span class="trajectory-num" style="color:#3fb950">' + learned + '</span><span class="trajectory-label">Learned</span></div>';
    html += '<div class="trajectory-stat"><span class="trajectory-num" style="color:#6e7681">' + archived + '</span><span class="trajectory-label">Archived</span></div>';
    html += '<div class="trajectory-stat"><span class="trajectory-num" style="color:#d29922">' + relapses + '</span><span class="trajectory-label">Relapses</span></div>';
    html += '</div>';

    // Progress bar
    html += '<div class="trajectory-bar">';
    if (learned > 0) html += '<div class="trajectory-segment learned" style="width:' + learnedPct + '%"></div>';
    html += '</div>';
    html += '<div class="trajectory-pct">' + learnedPct + '% lessons internalized</div>';
    html += '</div>';
    return html;
  },

  switchView(view) {
    document.querySelectorAll('.corrections-tab').forEach(function(t) {
      t.classList.remove('active');
    });
    event.target.classList.add('active');

    var nodes = document.querySelector('.corrections-nodes');
    var fleet = document.querySelector('.corrections-fleet');
    var trajectory = document.querySelector('.corrections-trajectory');

    if (nodes) nodes.style.display = view === 'nodes' ? 'block' : 'none';
    if (fleet) fleet.style.display = view === 'fleet' ? 'block' : 'none';
    if (trajectory) trajectory.style.display = view === 'trajectory' ? 'block' : 'none';
  },

  toggleNode(headerEl) {
    var group = headerEl.parentElement;
    var toggle = headerEl.querySelector('.corrections-node-toggle');
    if (group.classList.contains('collapsed')) {
      group.classList.remove('collapsed');
      headerEl.setAttribute('aria-expanded', 'true');
      if (toggle) toggle.textContent = '\u2212';
    } else {
      group.classList.add('collapsed');
      headerEl.setAttribute('aria-expanded', 'false');
      if (toggle) toggle.textContent = '+';
    }
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
