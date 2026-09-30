/* Superdash v2 -- Cairn RFC Panel (main content tab)
 * Summary view of active RFCs: status, wave progress, responders, votes.
 * Uses DataStore for data layer. Clicking a card opens Cairn drawer to forum.
 */

var CairnPanel = {
  _data: null,
  _details: {},  // rfcId -> forum detail cache (kept for future wave-state use)
  _taskIndex: null,  // { 'RFC090': {open:N, total:M}, ... }

  // SWAT 2026-06-07 (UXIA): meta-density quick wins.
  // A=updated_at relative, B=revision chip, C=stance distribution mini-bar,
  // E=category badge, F=sort active by updated_at desc.
  _relTime: function(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var dt = (Date.now() - t) / 1000;
    if (dt < 60) return 'just now';
    if (dt < 3600) return Math.floor(dt / 60) + 'm ago';
    if (dt < 86400) return Math.floor(dt / 3600) + 'h ago';
    if (dt < 86400 * 7) return Math.floor(dt / 86400) + 'd ago';
    return Math.floor(dt / 86400 / 7) + 'w ago';
  },

  _stanceDistHtml: function(responders) {
    if (!responders || !responders.length) return '';
    var c = { support: 0, nuance: 0, object: 0, defer: 0 };
    responders.forEach(function(r) {
      var s = (r.stance || '').toLowerCase();
      if (c[s] !== undefined) c[s]++;
    });
    var parts = [];
    if (c.support) parts.push(c.support + '✓');
    if (c.nuance)  parts.push(c.nuance + '~');
    if (c.object)  parts.push(c.object + '✕');
    if (c.defer)   parts.push(c.defer + '·');
    return parts.join(' ');
  },

  /**
   * Build a per-RFC task index from /api/tasks (all statuses, including
   * completed). Sticky-stateful predicate per OPERATOR 2026-06-06:
   * "ratified RFCs that have tasks built from them" -- entry trigger is
   * "any task was ever sent referring to this RFC", exit only when the
   * RFC's status leaves ratified. So we MUST include completed tasks
   * when computing the EXISTS-task signal; otherwise an RFC whose tasks
   * all happened to land before ship would silently drop off Active.
   *
   * ref_rfc_id is not yet exposed on the /api/tasks list payload, so we
   * derive it from task_id / title using the fleet's rfcNNN[pN] naming
   * convention. The regex tolerates `RFC090`, `rfc090`, `RFC540p1`, etc.
   */
  async _buildTaskIndex() {
    try {
      var data = await DataStore.get('/api/tasks?include_completed=true', { maxAge: 5000 });
      var tasks = (data && data.tasks) ? data.tasks : [];
      var idx = {};
      // DRAGON 2026-06-06 catch: original `(?:p\d+)?` missed the x-suffix
      // taxonomy (RFC497x1, RFC307x1, ...). The closing `\b` failed because
      // digit→letter is NOT a word boundary, so RFC497x1 silently lost its
      // RFC497 prefix match too. 20 live tasks in current corpus had x-suffix.
      // Adding `x` to the optional suffix character class catches the full
      // expansion taxonomy. Leaving `p` matched for legacy RFC270p1/RFC540p1
      // backfill (patch suffix is being phased out per OPERATOR taxonomy
      // discussion but those RFCs are still on the active board).
      var rx = /\bRFC\d{2,4}(?:[xpc]\d+)?\b/i;
      tasks.forEach(function(t) {
        // DRAGON note: explicit space separator prevents false-positive
        // boundary if task_id ends in digit and title begins with "RFC".
        var hay = (t.task_id || '') + ' ' + (t.title || '');
        var m = hay.match(rx);
        if (!m) return;
        // Whole-match (m[0]) since the regex no longer wraps in a capture
        // group -- the optional `(?:[xp]\d+)?` is a non-capturing suffix.
        var rfcId = m[0].toUpperCase();
        if (!idx[rfcId]) idx[rfcId] = { open: 0, total: 0 };
        idx[rfcId].total++;
        var s = (t.status || '').toLowerCase();
        if (s !== 'done' && s !== 'cancelled' && s !== 'archived') {
          idx[rfcId].open++;
        }
      });
      CairnPanel._taskIndex = idx;
    } catch (e) {
      CairnPanel._taskIndex = {};
    }
  },

  async load() {
    // SWAT 2026-06-07 (UXIA): pivoted main-tab Active RFCs from /api/cairn/search
    // to /api/cairn/filter. Search query='SEED OR RFC' was structurally missing
    // every active ratified/in_round RFC (verified: RFC559/RFC497x1/RFC384/RFC550p1
    // all absent from search results, only Response R# stubs returned). Filter
    // endpoint returns rich inline payload (revision, category, updated_at,
    // responders, wave_count, response_count, vote_tally) -- eliminates the
    // per-RFC /api/cairn/forum loadDetail roundtrip for basic meta render.
    //
    // Reuses the same primary URL as cairn-recent.js (already registered in
    // datastore.js ENDPOINTS) to dedup the poll stream. Secondary URL for
    // seeds+shipped uses default 15s maxAge (acceptable for those sections).
    var primaryUrl = '/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30';
    var secondaryUrl = '/api/cairn/filter?status=seed,shipped&limit=100';
    try {
      if (typeof DataStore !== 'undefined' && DataStore && typeof DataStore.invalidate === 'function') {
        DataStore.invalidate(primaryUrl);
        DataStore.invalidate(secondaryUrl);
      }
    } catch (e) { /* non-critical */ }
    var taskP = CairnPanel._buildTaskIndex();
    var results = await Promise.all([
      DataStore.get(primaryUrl, { maxAge: 0 }),
      DataStore.get(secondaryUrl, { maxAge: 0 })
    ]);
    await taskP;
    var primary = results[0];
    var secondary = results[1];
    if (!primary || primary.error) return;

    var columns = { ideation: [], in_round: [], ratified: [], seed: [], shipped: [] };
    var seen = {};
    var ingest = function(items) {
      (items || []).forEach(function(item) {
        var id = item.rfc_id || item.id || '';
        if (!id || seen[id]) return;
        var status = (item.status || '').toLowerCase();
        if (status === 'rfc') status = 'ideation';
        if (!status || status === 'archived' || status === 'deferred' ||
            status === 'superseded' || status === 'cancelled') return;
        if (/^Response R\d/.test(item.title || '')) return;
        if (!columns[status]) return;
        item.rfc_id = item.rfc_id || item.id;
        columns[status].push(item);
        seen[id] = true;
      });
    };
    ingest(primary.items);
    if (secondary && secondary.error) {
      console.warn('cairn-panel secondary fetch failed:', secondary.error);
    }
    if (secondary && secondary.items) ingest(secondary.items);
    CairnPanel._data = columns;
  },

  async loadDetail(rfcId) {
    var data = await API.cairnForum(rfcId);
    if (data && !data.error) {
      var rfc = data.rfc || data;
      rfc.rfc_id = rfc.rfc_id || rfc.id || rfcId;
      rfc.waves = data.waves || rfc.waves || [];
      rfc.votes = data.votes || rfc.votes || {};
      CairnPanel._details[rfcId] = rfc;
    }
    return CairnPanel._details[rfcId];
  },

  openRfc: function(rfcId) {
    if (!rfcId) return;
    // Open drawer idempotently (only toggle if closed)
    if (!Cairn.open) Cairn.toggle();
    // Load forum directly -- avoid competing tab loads
    Cairn.loadForum(rfcId);
  },

  async renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');
    if (!title || !badge || !content) return;

    title.textContent = 'Cairn -- RFCs';
    badge.textContent = '';

    // OPERATOR-directive 2026-06-01: ALWAYS force-fresh on tab render.
    // The previous `if (!CairnPanel._data)` memoization meant a stale snapshot
    // would render forever until an SSE invalidation arrived. Coordinator only
    // emits 8 of ~22 cairn tool events (KB cairn-ui-sync-contract) so most RFC
    // state changes never trigger invalidation. Drop the memoization for the
    // user-initiated render path; trust load() to be fast (5s maxAge in
    // DataStore, plus per-call cache bust inside load() itself).
    CairnPanel._data = null;
    content.innerHTML = '<div class="loading-text">Loading RFC data...</div>';
    await CairnPanel.load();
    if (!CairnPanel._data) {
      content.innerHTML = '<div class="empty-text">Failed to load RFC data</div>';
      return;
    }

    // Start safety-net auto-refresh while this tab is active
    CairnPanel._startAutoRefresh();

    var cols = CairnPanel._data;
    var ratified = cols.ratified || [];
    var ideation = cols.ideation || [];
    var seeds = cols.seed || [];
    var shipped = cols.shipped || [];
    var inRound = cols.in_round || [];
    var taskIdx = CairnPanel._taskIndex || {};

    // OPERATOR-direct predicate 2026-06-06 (sticky-stateful):
    //   Active RFC = status='ratified' AND any task ever referenced this RFC.
    // Entry trigger is task creation; exit only when status leaves ratified
    // (e.g., -> shipped). RFCs whose open-task count drops to 0 STAY in
    // Active until ship. RFCs in ratified that have never had a task built
    // from them stay in the "Ratified" section below (not yet active).
    var activeRfcs = ratified.filter(function(r) {
      var id = (r.rfc_id || r.id || '').toUpperCase();
      var hit = taskIdx[id];
      return !!(hit && hit.total > 0);
    });
    var ratifiedNoTask = ratified.filter(function(r) {
      var id = (r.rfc_id || r.id || '').toUpperCase();
      var hit = taskIdx[id];
      return !hit || hit.total === 0;
    });

    // F: sort active by updated_at desc -- newest activity first.
    activeRfcs.sort(function(a, b) {
      return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    });

    // Aggregate task counter across all active RFCs (open / total).
    var totalOpen = 0, totalTasks = 0;
    activeRfcs.forEach(function(r) {
      var id = (r.rfc_id || r.id || '').toUpperCase();
      var hit = taskIdx[id];
      if (hit) { totalOpen += hit.open; totalTasks += hit.total; }
    });

    badge.textContent = activeRfcs.length + ' active';

    var html = '';

    // Active RFCs section -- RFC counter + Task counter (open/total)
    html += '<div class="cairn-panel-section">';
    html += '<div class="cairn-panel-section-header">';
    html += '<span class="cairn-panel-section-title">Active RFCs</span>';
    html += '<span class="opa-grants-badge" title="RFCs in this section">' + activeRfcs.length + ' RFC' + (activeRfcs.length !== 1 ? 's' : '') + '</span>';
    html += '<span class="opa-grants-badge" title="Open / total tasks across active RFCs" style="background:rgba(88,166,255,0.18);color:#58a6ff;margin-left:6px">' + totalOpen + ' / ' + totalTasks + ' tasks</span>';
    html += '</div>';

    if (!activeRfcs.length) {
      html += '<div class="empty-text" style="padding:12px">No active RFCs (a ratified RFC becomes Active once a task is assigned that references it)</div>';
    } else {
      activeRfcs.forEach(function(rfc) {
        html += CairnPanel._renderCard(rfc);
      });
    }
    html += '</div>';

    // Legacy in_round bucket -- surfaced if the coordinator still emits this
    // status for any RFC. Most flows have collapsed in_round into ratified.
    if (inRound.length) {
      html += '<div class="cairn-panel-section">';
      html += '<div class="cairn-panel-section-header">';
      html += '<span class="cairn-panel-section-title">In Round</span>';
      html += '<span class="opa-grants-badge">' + inRound.length + '</span>';
      html += '</div>';
      inRound.forEach(function(rfc) {
        html += CairnPanel._renderCard(rfc);
      });
      html += '</div>';
    }

    // Ideation section
    if (ideation.length) {
      html += '<div class="cairn-panel-section">';
      html += '<div class="cairn-panel-section-header">';
      html += '<span class="cairn-panel-section-title">Ideation</span>';
      html += '<span class="opa-grants-badge" style="background:rgba(0,200,180,0.15);color:#00c8b4">' + ideation.length + '</span>';
      html += '</div>';
      ideation.forEach(function(rfc) {
        html += CairnPanel._renderCard(rfc);
      });
      html += '</div>';
    }

    // Ratified section (ratified RFCs that have NOT yet had any task built --
    // they live here until a task is assigned, then they promote into Active).
    if (ratifiedNoTask.length) {
      html += '<div class="cairn-panel-section">';
      html += '<div class="cairn-panel-section-header">';
      html += '<span class="cairn-panel-section-title">Ratified (awaiting tasks)</span>';
      html += '<span class="opa-grants-badge" style="background:var(--success);color:#000">' + ratifiedNoTask.length + '</span>';
      html += '</div>';
      ratifiedNoTask.forEach(function(rfc) {
        html += CairnPanel._renderCard(rfc);
      });
      html += '</div>';
    }

    // Seeds section (collapsed by default)
    if (seeds.length) {
      html += '<div class="cairn-panel-section">';
      html += '<div class="cairn-panel-section-header" onclick="CairnPanel._toggleSeeds()" style="cursor:pointer">';
      html += '<span class="auth-collapse-toggle">' + (CairnPanel._seedsCollapsed ? '▶' : '▼') + '</span>';
      html += '<span class="cairn-panel-section-title">Seeds</span>';
      html += '<span class="opa-grants-badge" style="background:var(--glass-2)">' + seeds.length + '</span>';
      html += '</div>';
      if (!CairnPanel._seedsCollapsed) {
        seeds.forEach(function(s) {
          html += CairnPanel._renderSeedCard(s);
        });
      }
      html += '</div>';
    }

    // Shipped count
    if (shipped.length) {
      html += '<div class="cairn-panel-shipped">' + shipped.length + ' shipped</div>';
    }

    content.innerHTML = html;

    // Attach click handlers via event delegation (no inline onclick for cards)
    content.querySelectorAll('.cairn-card[data-rfc-id]').forEach(function(card) {
      card.addEventListener('click', function() {
        CairnPanel.openRfc(card.getAttribute('data-rfc-id'));
      });
    });

    // SWAT 2026-06-07 (UXIA): post-render loadDetail loop dropped -- meta now
    // renders synchronously from filter-endpoint inline payload (revision,
    // category, updated_at, responders, vote_tally are all in the primary
    // response). loadDetail() function definition kept for future wave
    // open/closed state work (D quick-win, deferred to follow-on SWAT).
  },

  _seedsCollapsed: true,

  _toggleSeeds: function() {
    CairnPanel._seedsCollapsed = !CairnPanel._seedsCollapsed;
    CairnPanel.renderPanel();
  },

  _renderCard: function(rfc) {
    var rfcId = rfc.rfc_id || rfc.id || '';
    var shortId = rfcId.replace(/-.*$/, '').replace(/^RFC-/, '');
    var statusColor = Cairn.stageColors[rfc.status] || 'var(--text-secondary)';
    var taskHit = (CairnPanel._taskIndex || {})[rfcId.toUpperCase()];

    // Use data attribute for click handling (no inline JS)
    var html = '<div class="cairn-card" data-rfc-id="' + Panels.esc(rfcId) + '" id="cairn-card-' + Panels.esc(rfcId) + '">';
    html += '<div class="cairn-card-header">';
    html += '<span class="cairn-card-id" style="color:' + statusColor + '">' + Panels.esc(shortId) + '</span>';
    html += '<span class="cairn-card-status" style="background:' + statusColor + '">' + Panels.esc(rfc.status || '--') + '</span>';
    // B: revision chip (only when >1 -- r1 is noise).
    if (rfc.revision && rfc.revision > 1) {
      html += '<span class="cairn-card-rev" title="solidplan revision" style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(210,168,255,0.2);color:#d2a8ff;font-family:JetBrains Mono,monospace">r' + rfc.revision + '</span>';
    }
    // E: category badge (A/B/C from RFC157 taxonomy).
    if (rfc.category) {
      html += '<span class="cairn-card-cat" title="category" style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(210,153,34,0.2);color:#d29922;font-weight:600">' + Panels.esc(rfc.category) + '</span>';
    }
    if (taskHit && taskHit.total > 0) {
      // Per-card task counter -- "open/total". Sticky-stateful: shows even
      // when open=0 (RFC stays Active until status leaves ratified).
      html += '<span class="cairn-card-tasks" title="Open tasks / total tasks referencing this RFC" style="margin-left:auto;font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(88,166,255,0.18);color:#58a6ff;font-family:JetBrains Mono,monospace">' + taskHit.open + '/' + taskHit.total + ' tasks</span>';
    }
    html += '</div>';
    html += '<div class="cairn-card-title">' + Panels.esc(rfc.title || 'Untitled') + '</div>';

    // Meta row -- rendered synchronously from filter-endpoint inline payload
    // (was previously async detail fetch with "loading detail..." placeholder).
    html += '<div class="cairn-card-meta" id="cairn-meta-' + Panels.esc(rfcId) + '">';
    html += CairnPanel._renderMeta(rfc);
    html += '</div>';

    html += '</div>';
    return html;
  },

  _renderSeedCard: function(seed) {
    var id = seed.id || '';
    var html = '<div class="cairn-card cairn-card-seed">';
    html += '<div class="cairn-card-header">';
    html += '<span class="cairn-card-id" style="color:' + Cairn.stageColors.seed + '">' + Panels.esc(id.replace(/^SEED-/, '').substring(0, 6)) + '</span>';
    html += '</div>';
    html += '<div class="cairn-card-title">' + Panels.esc(seed.title || 'Untitled') + '</div>';
    html += '</div>';
    return html;
  },

  _renderMeta: function(rfc) {
    // SWAT 2026-06-07 (UXIA): now accepts the rich filter-endpoint payload
    // (rfc) instead of the detail-fetch shape. Inline fields: wave_count,
    // response_count, responders[{node_id,stance}], vote_tally, updated_at.
    var waves = rfc.wave_count || 0;
    var responses = rfc.response_count || 0;
    var responders = rfc.responders || [];

    var html = '';

    // Wave count
    html += '<span class="cairn-meta-item">📋 ' + waves + ' wave' + (waves !== 1 ? 's' : '') + '</span>';

    // Response count
    html += '<span class="cairn-meta-item">💬 ' + responses + ' response' + (responses !== 1 ? 's' : '') + '</span>';

    // C: stance distribution mini-bar (compact "4✓ 1~" form, before badges).
    var stanceTxt = CairnPanel._stanceDistHtml(responders);
    if (stanceTxt) {
      html += '<span class="cairn-meta-item cairn-stance-dist" title="stance distribution" style="font-family:JetBrains Mono,monospace">' + stanceTxt + '</span>';
    }

    // Responder badges (per-node with stance icon)
    if (responders.length) {
      html += '<span class="cairn-meta-responders">';
      responders.forEach(function(r) {
        var nodeId = r.node_id || '';
        var color = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[nodeId]) || 'var(--text-secondary)';
        var stance = r.stance || 'responded';
        var icon = Cairn.stanceIcons[stance] || '•';
        html += '<span class="cairn-responder" style="color:' + color + '" title="' + Panels.esc(nodeId) + ': ' + Panels.esc(stance) + '">' + icon + Panels.esc(nodeId.substring(0, 3)) + '</span>';
      });
      html += '</span>';
    }

    // Votes -- filter payload vote_tally shape: {approve:N, reject:N} (or empty).
    var votes = rfc.vote_tally || {};
    var approve = votes.approve || 0;
    var reject = votes.reject || 0;
    if (approve || reject) {
      html += '<span class="cairn-meta-item">🗳 ' + approve + '✓ ' + reject + '✕</span>';
    }

    // A: relative updated_at -- newest activity signal at a glance.
    var rel = CairnPanel._relTime(rfc.updated_at);
    if (rel) {
      html += '<span class="cairn-meta-item cairn-meta-updated" title="' + Panels.esc(rfc.updated_at || '') + '" style="color:var(--text-secondary,#8b949e)">⏱ ' + rel + '</span>';
    }

    return html;
  },

  _updateCard: function(rfcId, detail) {
    var metaEl = document.getElementById('cairn-meta-' + rfcId);
    if (metaEl) {
      metaEl.innerHTML = CairnPanel._renderMeta(detail);
    }
  },

  // OPERATOR-directive 2026-06-01: safety-net auto-refresh while the Cairn tab
  // is active. Coordinator emits only 8 of ~22 cairn tool events (KB
  // cairn-ui-sync-contract); periodic forced refresh catches anything SSE
  // missed without requiring the user to switch tabs. 10s cadence: tight
  // enough for "lock-step" perception, loose enough to not hammer the API.
  _autoRefreshTimer: null,
  _startAutoRefresh: function() {
    CairnPanel._stopAutoRefresh();
    CairnPanel._autoRefreshTimer = setInterval(function() {
      if (typeof App === 'undefined' || App.currentTab !== 'cairn-panel') {
        CairnPanel._stopAutoRefresh();
        return;
      }
      CairnPanel.load().then(function() {
        if (App.currentTab === 'cairn-panel') CairnPanel.renderPanel();
      }).catch(function() { /* non-critical */ });
    }, 10000);
  },
  _stopAutoRefresh: function() {
    if (CairnPanel._autoRefreshTimer) {
      clearInterval(CairnPanel._autoRefreshTimer);
      CairnPanel._autoRefreshTimer = null;
    }
  }
};
