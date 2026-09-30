/* CAIRN board and RFC detail extensions */
Object.assign(Cairn, {
  // Lifecycle stage order for transition bar
  STAGE_ORDER: ['seed', 'ideation', 'in_round', 'ratified', 'shipped'],

  // Board column stages (lifecycle stages excluding 'seed' -- seeds render in their own tray;
  // RFC578: 'shipped' also excluded -- renders as collapsible section ABOVE the kanban,
  // mirroring the seeds tray pattern. Removes 96-item visual dominance from active kanban.)
  boardStages: ['ideation', 'in_round', 'ratified'],

  // SWAT-superdash-perf-F: dirty-check signature for renderBoard()'s 3 possible
  // output branches (main kanban, shipped-full-cards, seed-full-cards). Shared
  // across all 3 since only one is ever rendered/visible at a time (mutually
  // exclusive early-returns) -- see each branch's own comment near its
  // `body.innerHTML = html` call.
  _lastBoardRenderSig: null,

  // ── PRECEDENCE RULE (RFC587-B4.2 breadcrumb, ref: ZBPRIME #60832 + v2.2 design scratch) ──
  // CANONICAL source for RFC task done/total counts is the SERVER-side trail FK-rollup
  // emitted in `cairn_trail` (rfc.tasks block). The client MUST NOT re-derive these
  // counts via title-regex/keyword scans of the task list -- that path is retired.
  // Order of trust (highest → lowest):
  //   1. rfc.tasks {done, total} from /api/cairn/trail   ← canonical
  //   2. (no fallback) -- absence of the block = binding-gap signal, NOT cause to regress
  //      to client-side derivation. Render the gap explicitly via the binding-gap tooltip.
  // Any future "I'll just rebuild taskIndex client-side" instinct is a regression; the
  // FK-rollup is the contract. Grep anchor: `PRECEDENCE RULE`.
  //
  // The server-side rollup:
  // cairn-trail server-side LEFT JOIN (tasks UNION ALL tasks_archive) ON ref_rfc_id
  // emits per-RFC {tasks: {done, total}} block (omit-if-zero = binding-gap signal).
  // Render reads rfc.tasks directly; the fragile title-regex `_buildTaskIndex` (and
  // the cached taskIndex + parallel taskP wiring in cairn-cache.js / cairn.js) are
  // retired. Post-FF-i+ii the rollup includes archived-done tasks, so the binding-gap
  // tooltip now covers two cases: (a) true-unbound (no row references this rfc_id),
  // (b) data-residual (rows exist but `project` field doesn't match RFC-id pattern,
  // e.g. RFC017-class; SWAT-FF-iii filed for GLOB narrowing polish).
  shippedTrayOpen: false,
  toggleShippedTray() {
    Cairn.shippedTrayOpen = !Cairn.shippedTrayOpen;
    Cairn.renderBoard();
  },

  // Tag/domain abbreviations for card display. Cards have ~80-100px of horizontal
  // space for the category chip; longer labels overflow. Keys case-insensitive.
  //
  // (UXIA 2026-06-04, OPERATOR audit) The coordinator's cairn_seed/cairn_rfc
  // path accepts free-form `domain/*` tags with no validation, producing ~35
  // distinct domain strings in cairn.db (life-services, fleet-infra, discipline,
  // etc). This display-layer map buckets every active raw domain into one of
  // 8 canonical labels; hover title attribute keeps the raw value for precision.
  // Source-layer canonicalization (extending valid_domains in cairn.py) is a
  // separate follow-on.
  //
  // Bucket rationale:
  //   LIFE    - attentiveness, message responsiveness, lifecycle
  //   GOV     - process, governance, coordination-as-activity, discipline
  //   INFRA   - hosting, fleet ops, observability, reliability
  //   COORD   - the coordinator MCP server itself
  //   ARCH    - architecture, topology, identity
  //   SEC     - security
  //   UX      - user-facing surfaces (dashboard)
  //   TOOLS   - dev tooling, scripts, testing, git workflow (default)
  tagAbbreviations: {
    // LIFE
    'LIFE-SERVICES': 'LIFE', 'BREATHBUS': 'LIFE', 'SKILLS': 'LIFE',
    'LIFECYCLE': 'LIFE', 'MOLT': 'LIFE', 'BREATHING': 'LIFE',
    'COMMS': 'LIFE', 'MESSAGING': 'LIFE',
    // GOV
    'PROCESS': 'GOV', 'GOVERNANCE': 'GOV', 'POLICY': 'GOV',
    'COORDINATION': 'GOV', 'DISCIPLINE': 'GOV', 'SAFETY': 'GOV',
    'VERIFICATION': 'GOV',
    // INFRA
    'INFRASTRUCTURE': 'INFRA', 'FLEET-INFRA': 'INFRA', 'FLEET-OPS': 'INFRA',
    'OPS': 'INFRA', 'OPERATIONS': 'INFRA', 'OBSERVABILITY': 'INFRA',
    'RELIABILITY': 'INFRA', 'STABILITY': 'INFRA', 'SMOKE-HARNESS': 'INFRA',
    // COORD
    'COORDINATOR': 'COORD',
    // ARCH
    'ARCHITECTURE': 'ARCH', 'TOPOLOGY': 'ARCH', 'IDENTITY': 'ARCH',
    'AUTH': 'ARCH',
    // SEC
    'SECURITY': 'SEC',
    // UX
    'UX': 'UX', 'SUPERDASH': 'UX',
    // TOOLING (explicit listing for clarity; unknowns fall through to raw key)
    'TOOLING': 'TOOLS', 'CAIRN': 'TOOLS', 'SCRIPTS': 'TOOLS',
    'SWATTER': 'TOOLS', 'CODECRETE': 'TOOLS',
    'GAMES': 'TOOLS', 'DOCUMENTATION': 'TOOLS',
    'GIT': 'TOOLS', 'GIT-HYGIENE': 'TOOLS', 'GIT-HOOKS': 'TOOLS',
    'TESTING': 'TOOLS'
  },

  // SWAT-20260611-0007: canonical-domain labels fetched live from
  // /api/canonical-domains (token -> OPERATOR-facing label). Populated by
  // ensureCanonicalDomains(); null until loaded or if the endpoint is absent.
  canonicalDomainLabels: null,

  abbreviateTag(label) {
    if (!label) return '';
    // API-first: if the raw value IS a canonical domain token, use the live
    // label from /api/canonical-domains. Otherwise fall back to the static
    // bucket map (pre-migration sprawl values + endpoint-unavailable). This
    // makes the chips zero-regression today and auto-correct once the stored
    // `domain` field is migrated to the canonical tokens.
    var token = String(label).toLowerCase();
    if (Cairn.canonicalDomainLabels && Cairn.canonicalDomainLabels[token]) {
      return Cairn.canonicalDomainLabels[token];
    }
    var key = String(label).toUpperCase();
    return Cairn.tagAbbreviations[key] || key;
  },

  // SWAT-20260611-0007: fetch the canonical 9-domain set once and cache it as a
  // token -> label map. Fire-and-forget from loadBoard; on success re-renders the
  // board so the filter chips pick up the live canonical labels. Any failure
  // leaves canonicalDomainLabels null, so abbreviateTag transparently uses the
  // static bucket map (today's behavior) -- no spinner, no broken chips.
  _canonicalDomainsLoading: false,
  async ensureCanonicalDomains() {
    if (Cairn.canonicalDomainLabels || Cairn._canonicalDomainsLoading) return;
    if (!window.API || typeof API.canonicalDomains !== 'function') return;
    Cairn._canonicalDomainsLoading = true;
    try {
      var data = await API.canonicalDomains();
      if (data && Array.isArray(data.domains) && data.domains.length) {
        var map = {};
        data.domains.forEach(function(d) {
          if (d && d.token) map[String(d.token).toLowerCase()] = d.label || d.token;
        });
        Cairn.canonicalDomainLabels = map;
        if ((Cairn.view === 'board' || Cairn.activeTab === 'board') && Cairn.trailData) {
          Cairn.renderBoard();
        }
      }
    } catch (e) {
      try { console.warn('[cairn] canonical-domains load failed; using static map:', e); } catch (_) {}
    } finally {
      Cairn._canonicalDomainsLoading = false;
    }
  },

  // Wave badge renderer (OPERATOR direction 2026-05-29 iter-2):
  // visual weight scales with deliberation depth. 0 waves = dim blue "0"
  // (visible-but-de-emphasized). 1-4 waves = repeated 🌊 icons so 3/4 wave
  // RFCs stand out as deeply-discussed. 5+ caps display at 4 + "+N" overflow.
  // Renders inline HTML; caller must already trust the count (it's a number).
  renderWaveBadge(count) {
    var n = Number(count) || 0;
    if (n === 0) {
      return '<span class="cairn-card-wave cairn-card-wave-zero" title="No waves opened">0</span>';
    }
    if (n <= 4) {
      return '<span class="cairn-card-wave" title="' + n + ' wave' + (n === 1 ? '' : 's') + '">' + '🌊'.repeat(n) + '</span>';
    }
    return '<span class="cairn-card-wave" title="' + n + ' waves">🌊🌊🌊🌊<span class="cairn-card-wave-overflow">+' + (n - 4) + '</span></span>';
  },

  // Board sort state
  boardSort: 'modified',

  // Centralized status normalizer -- maps legacy API values to canonical stages
  normalizeStage(status) {
    if (status === 'rfc') return 'ideation';
    return status;
  },

  // Normalize trail data: ensure columns use canonical stage names + flatten card shape.
  // Card shape (?fields=card) nests counts under rfc.counts; promote to flat so existing
  // renderer paths reading rfc.wave_count etc. keep working. Author/date fields stay undefined
  // when card shape is in use -- renderer guards those chips with truthy checks.
  normalizeTrail(data) {
    if (data && data.columns) {
      // Remap 'rfc' column key to 'ideation' if API still uses old name
      if (data.columns.rfc && !data.columns.ideation) {
        data.columns.ideation = data.columns.rfc;
        delete data.columns.rfc;
      }
      // Hoist nested counts (card shape) to flat fields the renderer expects
      Object.keys(data.columns).forEach(function(stage) {
        (data.columns[stage] || []).forEach(function(rfc) {
          if (rfc && rfc.counts) {
            if (rfc.wave_count == null) rfc.wave_count = rfc.counts.wave_count;
            if (rfc.response_count == null) rfc.response_count = rfc.counts.response_count;
            if (rfc.vote_tally == null) rfc.vote_tally = rfc.counts.vote_tally;
          }
        });
      });
    }
    return data;
  },

  renderBoard() {
    Cairn.view = 'board';
    var body = document.getElementById('cairn-body');
    var filters = document.getElementById('cairn-filters');
    if (!Cairn.trailData) { body.innerHTML = '<div class="cairn-empty">No data</div>'; return; }

    // Filter bar: domain chips + status chips
    // Chips render in the same abbreviated form used on RFC cards (Cairn.abbreviateTag),
    // so search-bar labels match card category badges 1:1. Derived dynamically from
    // current trail data -- chip set stays self-consistent with what's actually rendered.
    var _abbrevSet = {};
    if (Cairn.trailData && Cairn.trailData.columns) {
      Object.keys(Cairn.trailData.columns).forEach(function(stage) {
        (Cairn.trailData.columns[stage] || []).forEach(function(rfc) {
          var ab = Cairn.abbreviateTag(rfc.domain || '');
          if (ab) _abbrevSet[ab] = true;
        });
      });
    }
    var _chipAbbrevs = Object.keys(_abbrevSet).sort();
    var filterHtml = '<div class="cairn-search-bar"><input type="text" id="cairn-search-input" class="cairn-search-input" placeholder="Search CAIRN…" /><button class="cairn-btn cairn-btn-search" onclick="Cairn.doSearch()">🔍</button></div><div class="cairn-chips">';
    _chipAbbrevs.forEach(function(d) {
      var active = Cairn.activeFilters.indexOf(d) >= 0 ? ' active' : '';
      filterHtml += '<button class="cairn-chip' + active + '" data-domain="' + d + '">' + d + '</button>';
    });
    filterHtml += '<button class="cairn-chip cairn-chip-clear" onclick="Cairn.clearFilters()">↺</button>';
    filterHtml += '</div>';

    // Status filter row removed (OPERATOR 2026-06-10): board already segregates by stage,
    // freeing room for domain chips to wrap. Cairn.statusFilter remains defined for
    // any programmatic callers but is no longer surfaced as a UI control.
    //
    // OPERATOR-reported bug (2026-07-02): renderBoard() fires on every silent
    // auto-refresh (8s SSE-debounced board refresh, CairnPanel's 10s poll, etc
    // -- see SWAT-20260628-0008 history above). Rebuilding filters.innerHTML
    // unconditionally replaced #cairn-search-input with a blank one, wiping
    // any in-progress typed search text mid-keystroke. Capture+restore the
    // input's value/focus/cursor across the rebuild -- same pattern already
    // used for per-column scrollTop preservation in refreshBoardSilent().
    var _prevSearchInput = document.getElementById('cairn-search-input');
    var _prevSearchValue = _prevSearchInput ? _prevSearchInput.value : '';
    var _prevSearchHadFocus = _prevSearchInput && document.activeElement === _prevSearchInput;
    var _prevSearchSelStart = _prevSearchHadFocus ? _prevSearchInput.selectionStart : null;
    var _prevSearchSelEnd = _prevSearchHadFocus ? _prevSearchInput.selectionEnd : null;

    filters.innerHTML = filterHtml;

    // Wire filter clicks
    filters.querySelectorAll('.cairn-chip[data-domain]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var d = chip.getAttribute('data-domain');
        var idx = Cairn.activeFilters.indexOf(d);
        if (idx >= 0) Cairn.activeFilters.splice(idx, 1);
        else Cairn.activeFilters.push(d);
        Cairn.renderBoard();
      });
    });
    var _si = document.getElementById('cairn-search-input');
    if (_si) {
      _si.addEventListener('keydown', function(e) { if (e.key === 'Enter') Cairn.doSearch(); });
      if (_prevSearchValue) _si.value = _prevSearchValue;
      if (_prevSearchHadFocus) {
        _si.focus();
        try { _si.setSelectionRange(_prevSearchSelStart, _prevSearchSelEnd); } catch (eSel) { /* non-critical */ }
      }
    }

    // Collect all RFCs from trail data columns
    // API uses: id, title, status, domain, author, tags, signal_counts, star_count
    var allRfcs = [];
    var trail = Cairn.trailData;
    if (trail.columns) {
      Object.keys(trail.columns).forEach(function(stage) {
        (trail.columns[stage] || []).forEach(function(rfc) {
          rfc.rfc_id = rfc.rfc_id || rfc.id;
          rfc.author_id = rfc.author_id || rfc.author;
          rfc.signals = rfc.signals || rfc.signal_counts || {};
          rfc._stage = Cairn.normalizeStage(stage);
          allRfcs.push(rfc);
        });
      });
    } else if (trail.trail) {
      allRfcs = trail.trail.filter(function(r) {
        var skip = ['archived', 'deferred', 'superseded'];
        return skip.indexOf(r.status) === -1;
      }).map(function(r) {
        r.rfc_id = r.rfc_id || r.id;
        r.author_id = r.author_id || r.author;
        r.signals = r.signals || r.signal_counts || {};
        r._stage = Cairn.normalizeStage(r.status);
        return r;
      });
    }

    // Apply filters -- match on abbreviated form so chip labels (e.g. "LIFE", "TOOLS")
    // align with the bucket abbreviation rendered on RFC cards.
    var rfcs = allRfcs;
    if (Cairn.activeFilters.length) {
      rfcs = rfcs.filter(function(r) { return Cairn.activeFilters.indexOf(Cairn.abbreviateTag(r.domain || '')) >= 0; });
    }
    if (Cairn.statusFilter) {
      rfcs = rfcs.filter(function(r) { return r._stage === Cairn.statusFilter; });
    }

    // Group by stage -- separate seeds + shipped from board lifecycle stages.
    // RFC578: shipped now renders as a collapsible section above the kanban (mirrors
    // seeds tray pattern); only ideation/in_round/ratified live in the kanban columns.
    var grouped = {};
    var seeds = [];
    var shipped = [];
    Cairn.boardStages.forEach(function(s) { grouped[s] = []; });
    rfcs.forEach(function(r) {
      var s = r._stage || r.status;
      if (s === 'seed') { seeds.push(r); }
      else if (s === 'shipped') { shipped.push(r); }
      else if (grouped[s]) { grouped[s].push(r); }
    });

    // Sort within each column (and seeds)
    var sortKey = Cairn.boardSort || 'modified';
    var sortFn = function(a, b) {
      if (sortKey === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortKey === 'author') return (a.author_id || '').localeCompare(b.author_id || '');
      if (sortKey === 'created') return (b.created_at || '').localeCompare(a.created_at || '');
      if (sortKey === 'modified') return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
      return 0;
    };
    Object.keys(grouped).forEach(function(stage) { grouped[stage].sort(sortFn); });
    seeds.sort(sortFn);
    shipped.sort(sortFn);

    // Clear stale status filter if it references a stage not on the board (allow seed + shipped pass-through)
    if (Cairn.statusFilter && Cairn.boardStages.indexOf(Cairn.statusFilter) < 0 && Cairn.statusFilter !== 'seed' && Cairn.statusFilter !== 'shipped') {
      Cairn.statusFilter = null;
    }

    // Summary bar (above the board content)
    var boardTotal = allRfcs.length - seeds.length - shipped.length;
    var inRound = (grouped['in_round'] || []).length;
    var _sk = Cairn.boardSort || 'modified';
    var html = '<div class="cairn-summary">';
    html += '<button class="cairn-btn cairn-btn-refresh" onclick="Cairn.forceRefreshBoard()" title="Force refresh">🔄</button>';
    html += '<button class="cairn-btn cairn-btn-pipeline" onclick="Cairn.renderLifecycle()">📊 Pipeline View</button>';
    html += '<span>' + boardTotal + ' active</span>';
    if (seeds.length) html += '<span>🌱 ' + seeds.length + ' seed' + (seeds.length !== 1 ? 's' : '') + '</span>';
    if (shipped.length) html += '<span>🚢 ' + shipped.length + ' shipped</span>';
    html += '<span>⚠️ ' + inRound + ' in active rounds</span>';
    html += '<label style="margin-left:auto;display:flex;align-items:center;gap:4px"><span>Sort:</span>';
    html += '<select class="cairn-sort-select" onchange="Cairn.boardSort=this.value;Cairn.renderBoard()">';
    html += '<option value="title"' + (_sk==='title'?' selected':'') + '>Name</option>';
    html += '<option value="author"' + (_sk==='author'?' selected':'') + '>Author</option>';
    html += '<option value="created"' + (_sk==='created'?' selected':'') + '>Date Created</option>';
    html += '<option value="modified"' + (_sk==='modified'?' selected':'') + '>Last Modified</option>';
    html += '</select></label>';
    html += '</div>';

    // Collapsible seeds tray (above the kanban board)
    if (seeds.length && Cairn.statusFilter !== 'seed') {
      var trayOpen = Cairn.seedsTrayOpen || false;
      html += '<div class="cairn-seeds-tray' + (trayOpen ? ' open' : '') + '">';
      html += '<div class="cairn-seeds-tray-header" onclick="Cairn.toggleSeedsTray()">';
      html += '<span class="cairn-seeds-tray-toggle">' + (trayOpen ? '▼' : '▶') + '</span>';
      html += '<span class="cairn-seeds-tray-icon">🌱</span>';
      html += '<span class="cairn-seeds-tray-label">Seeds</span>';
      html += '<span class="cairn-seeds-tray-count">' + seeds.length + '</span>';
      html += '</div>';
      if (trayOpen) {
        html += '<div class="cairn-seeds-tray-items">';
        seeds.forEach(function(seed) {
          var seedId = (seed.rfc_id || '').replace(/^SEED-/i, '');
          html += '<div class="cairn-seed-chip" data-rfc="' + Cairn.esc(seed.rfc_id) + '">';
          html += '<span class="cairn-seed-chip-id">' + Cairn.esc(seedId.substring(0, 8)) + '</span>';
          html += '<span class="cairn-seed-chip-title">' + Cairn.esc(seed.title || 'Untitled') + '</span>';
          if (seed.author_id) html += '<span class="cairn-seed-chip-author">@' + Cairn.esc(seed.author_id) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // RFC578: Shipped tray (collapsible, above the kanban board, default-collapsed).
    // Mirrors the seeds tray pattern; surfaces shipped ledger without 96-item column
    // dominating the active kanban view.
    if (shipped.length && Cairn.statusFilter !== 'shipped' && Cairn.statusFilter !== 'seed') {
      var shippedOpen = Cairn.shippedTrayOpen || false;
      var shippedColor = Cairn.stageColors.shipped;
      html += '<div class="cairn-seeds-tray cairn-shipped-tray' + (shippedOpen ? ' open' : '') + '">';
      html += '<div class="cairn-seeds-tray-header" onclick="Cairn.toggleShippedTray()">';
      html += '<span class="cairn-seeds-tray-toggle">' + (shippedOpen ? '▼' : '▶') + '</span>';
      html += '<span class="cairn-seeds-tray-icon">🚢</span>';
      html += '<span class="cairn-seeds-tray-label">Shipped</span>';
      html += '<span class="cairn-seeds-tray-count" style="background:hsla(100,50%,45%,0.18);color:' + shippedColor + '">' + shipped.length + '</span>';
      html += '</div>';
      if (shippedOpen) {
        html += '<div class="cairn-seeds-tray-items">';
        shipped.forEach(function(s) {
          var sid = (s.rfc_id || '').replace(/^(RFC|SEED)-/i, '');
          html += '<div class="cairn-seed-chip cairn-shipped-chip" data-rfc="' + Cairn.esc(s.rfc_id) + '">';
          html += '<span class="cairn-seed-chip-id" style="color:' + shippedColor + '">' + Cairn.esc(sid) + '</span>';
          html += '<span class="cairn-seed-chip-title">' + Cairn.esc(s.title || 'Untitled') + '</span>';
          if (s.author_id) html += '<span class="cairn-seed-chip-author">@' + Cairn.esc(s.author_id) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // If status filter is 'shipped', show shipped as full cards (mirrors seeds full grid)
    if (Cairn.statusFilter === 'shipped') {
      html += '<div class="cairn-seeds-full">';
      html += '<div class="cairn-seeds-full-header">';
      html += '<span class="cairn-seeds-tray-icon">🚢</span>';
      html += '<span class="cairn-seeds-tray-label">All Shipped</span>';
      html += '<span class="cairn-seeds-tray-count" style="background:hsla(100,50%,45%,0.18);color:' + Cairn.stageColors.shipped + '">' + shipped.length + '</span>';
      html += '</div>';
      html += '<div class="cairn-seeds-full-grid">';
      shipped.forEach(function(rfc) {
        var displayId = (rfc.rfc_id || '').replace(/^(RFC|SEED)-/i, '');
        html += '<div class="cairn-card" data-rfc="' + Cairn.esc(rfc.rfc_id) + '">';
        html += '<div class="cairn-card-top">';
        html += '<div class="cairn-card-title-row">' + Cairn.esc(rfc.title) + '</div>';
        if (rfc.star_count) html += '<span class="cairn-card-badges"><span class="cairn-badge cairn-badge-star">⭐' + rfc.star_count + '</span></span>';
        html += '</div>';
        html += '<div class="cairn-card-meta">';
        html += '<span class="cairn-card-id-badge" style="color:' + Cairn.stageColors.shipped + '" title="' + Cairn.esc(rfc.rfc_id) + '">' + Cairn.esc(displayId) + '</span>';
        html += '<div class="cairn-card-meta-center">';
        if (rfc.author_id) html += '<span class="cairn-card-author">@' + Cairn.esc(rfc.author_id) + '</span>';
        html += '</div>';
        var domainLabel = Cairn.esc(rfc.domain || '');
        if (domainLabel) html += '<span class="cairn-card-category" title="' + domainLabel + '">' + Cairn.abbreviateTag(domainLabel) + '</span>';
        html += '</div></div>';
      });
      html += '</div></div>';
      // SWAT-superdash-perf-F: same dirty-check gate as the main board path below.
      if (body.querySelector('.cairn-card') && html === Cairn._lastBoardRenderSig) return;
      Cairn._lastBoardRenderSig = html;
      body.innerHTML = html;
      body.querySelectorAll('.cairn-card').forEach(function(card) {
        card.addEventListener('click', function() { Cairn.loadForum(card.getAttribute('data-rfc')); });
      });
      return;
    }

    // If status filter is 'seed', show seeds as full cards instead of the board
    if (Cairn.statusFilter === 'seed') {
      html += '<div class="cairn-seeds-full">';
      html += '<div class="cairn-seeds-full-header">';
      html += '<span class="cairn-seeds-tray-icon">🌱</span>';
      html += '<span class="cairn-seeds-tray-label">All Seeds</span>';
      html += '<span class="cairn-seeds-tray-count">' + seeds.length + '</span>';
      html += '</div>';
      html += '<div class="cairn-seeds-full-grid">';
      seeds.forEach(function(seed) {
        var seedId = (seed.rfc_id || '').replace(/^SEED-/i, '');
        html += '<div class="cairn-card" data-rfc="' + Cairn.esc(seed.rfc_id) + '">';
        html += '<div class="cairn-card-top">';
        html += '<div class="cairn-card-title-row">' + Cairn.esc(seed.title) + '</div>';
        if (seed.star_count) html += '<span class="cairn-card-badges"><span class="cairn-badge cairn-badge-star">⭐' + seed.star_count + '</span></span>';
        html += '</div>';
        var previewTags = (seed.tags || []).filter(function(t) { return !t.startsWith('domain/') && !t.startsWith('type/'); }).map(function(t) { return t.replace(/^priority\//, '⚡'); });
        if (previewTags.length) html += '<div class="cairn-card-preview">' + Cairn.esc(previewTags.join(' · ')) + '</div>';
        // Three-segment meta (seeds: no wave badge -- seeds never have waves).
        html += '<div class="cairn-card-meta">';
        html += '<span class="cairn-card-id-badge" style="color:' + Cairn.stageColors.seed + '" title="' + Cairn.esc(seed.rfc_id) + '">' + Cairn.esc(seedId) + '</span>';
        html += '<div class="cairn-card-meta-center">';
        if (seed.author_id) html += '<span class="cairn-card-author">@' + Cairn.esc(seed.author_id) + '</span>';
        html += '</div>';
        var domainLabel = Cairn.esc(seed.domain || '');
        if (domainLabel) html += '<span class="cairn-card-category" title="' + domainLabel + '">' + Cairn.abbreviateTag(domainLabel) + '</span>';
        html += '</div></div>';
      });
      html += '</div></div>';
      // SWAT-superdash-perf-F: same dirty-check gate as the main board path below.
      if (body.querySelector('.cairn-card') && html === Cairn._lastBoardRenderSig) return;
      Cairn._lastBoardRenderSig = html;
      body.innerHTML = html;
      body.querySelectorAll('.cairn-card').forEach(function(card) {
        card.addEventListener('click', function() { Cairn.loadForum(card.getAttribute('data-rfc')); });
      });
      return;
    }

    // Render kanban columns (3 lifecycle stages: ideation/in_round/ratified; seed+shipped render as trays).
    // RFC578: Ratified column is doubled-width with inline per-card task affordance
    // (N of M complete + progress bar) -- surfaces build-progress without doctrine push-up.
    html += '<div class="cairn-kanban">';
    Cairn.boardStages.forEach(function(stage) {
      var items = grouped[stage];
      var color = Cairn.stageColors[stage];
      var label = Cairn.stageLabels[stage];
      var isRatified = (stage === 'ratified');
      var colClass = 'cairn-column' + (isRatified ? ' cairn-column-wide' : '');

      html += '<div class="' + colClass + '">';
      html += '<div class="cairn-col-header" style="--col-color:' + color + '">';
      html += '<span class="cairn-col-dot" style="background:' + color + '"></span>';
      html += '<span class="cairn-col-label">' + label + '</span>';
      html += '<span class="cairn-col-count">' + items.length + '</span>';
      html += '</div>';

      html += '<div class="cairn-col-items">';
      if (!items.length) {
        html += '<div class="cairn-empty">--</div>';
      }
      items.forEach(function(rfc) {
        var signals = rfc.signals || {};
        var signalTotal = (signals.support || 0) + (signals.nuance || 0) + (signals.object || 0);
        // Extract short display ID (e.g., "RFC-001" → "001", "SEED-A3F" → "A3F")
        var displayId = (rfc.rfc_id || '').replace(/^(RFC|SEED)-/i, '');

        // SWAT-20260615-0014: electric-border accent for ratified RFC cards in the
        // "almost there" band (>=70% and <100% task completion), gated behind
        // ?electric=1 (Cairn.electricEnabled). prefers-reduced-motion is honored in
        // css/electric-border.css. 100% cards intentionally excluded (shipped-soon,
        // not in-flight); the 0%/unbound state never qualifies.
        var electricClass = '';
        if (Cairn.electricEnabled && isRatified) {
          var _et = rfc.tasks;
          var _etot = (_et && typeof _et.total === 'number') ? _et.total : 0;
          var _edone = (_et && typeof _et.done === 'number') ? _et.done : 0;
          var _epct = _etot > 0 ? Math.round((_edone / _etot) * 100) : 0;
          if (_epct >= 70 && _epct < 100) electricClass = ' electric-border';
        }
        html += '<div class="cairn-card' + electricClass + '" data-rfc="' + Cairn.esc(rfc.rfc_id) + '">';

        // Top row: title + star badge (waves move to bottom-center per iter-2)
        html += '<div class="cairn-card-top">';
        html += '<div class="cairn-card-title-row">' + Cairn.esc(rfc.title) + '</div>';
        if (rfc.star_count) html += '<span class="cairn-card-badges"><span class="cairn-badge cairn-badge-star">⭐' + rfc.star_count + '</span></span>';
        html += '</div>';

        // Description area: short_description if present, else tags-preview fallback
        var shortDesc = (rfc.short_description || '').trim();
        if (shortDesc) {
          html += '<div class="cairn-card-short-desc">' + Cairn.esc(shortDesc) + '</div>';
        } else {
          var previewTags = (rfc.tags || []).filter(function(t) { return !t.startsWith('domain/') && !t.startsWith('type/'); }).map(function(t) { return t.replace(/^priority\//, '⚡'); });
          if (previewTags.length) {
            html += '<div class="cairn-card-preview">' + Cairn.esc(previewTags.join(' · ')) + '</div>';
          }
        }

        // SWAT-20260611-0009 + SWAT-FF-i+ii: per-RFC task progress affordance on Ratified cards.
        // Reads server-emitted `rfc.tasks: {done, total}` (FK-keyed via ref_rfc_id, with archived
        // tasks UNION ALL'd post-FF-i). Omit-if-zero from server: when `rfc.tasks` is absent we
        // render the binding-gap state -- now covers true-unbound (no rows reference rfc_id) +
        // data-residual (rows exist but `project` field doesn't match RFC-id pattern). User action
        // is the same for both: file/bind a task or fix the project field.
        //
        // SWAT-20260627-0007 W3 gate-blindness fix (2026-07-01): when server emits
        // `rfc.open_ship_gates > 0`, an OPEN ship-gate blocks actual shipping even if all bound
        // tasks are done. RFC257x1 exemplar showed unqualified "100%" while a ship-gate remained
        // open, misleading OPERATOR. Render gate-blocked state distinctly: text becomes
        // "N of M · 🚫 gate" (instead of "N of M · 100%"), thermo fill amber-warning colored,
        // shimmer preserved to draw the eye.
        if (isRatified) {
          var tasks = rfc.tasks;
          var total = (tasks && typeof tasks.total === 'number') ? tasks.total : 0;
          var done = (tasks && typeof tasks.done === 'number') ? tasks.done : 0;
          var pct = total > 0 ? Math.round((done / total) * 100) : 0;
          var openShipGates = (typeof rfc.open_ship_gates === 'number') ? rfc.open_ship_gates : 0;
          var isGateBlocked = (openShipGates > 0 && pct >= 100);
          if (total === 0) {
            html += '<div class="cairn-card-tasks" title="No bound tasks; SWAT-shipped work may be unbound (binding-gap signal)">';
            html += '<div class="cairn-card-tasks-thermo is-empty">';
            html += '<div class="cairn-card-tasks-thermo-fill" data-pct="0" style="width:0%;background:' + color + '"></div>';
            html += '<div class="cairn-card-tasks-thermo-text">ratified<span class="pct">awaiting task bind</span></div>';
            html += '</div>';
            html += '</div>';
          } else {
            // SWAT-20260610-0037: amber→green color-shift via --prog-mix custom prop
            // (CSS uses color-mix(in oklab, var(--warning) (100-pct)%, var(--success) pct%)
            // blended over the domain hue base via background-color + background-image
            // gradient stack). Shimmer on partial (0<pct<100) via .is-shimmering class.
            // SWAT-20260612-0013 (baoyu): when total<=8, render per-task discrete dots in
            // the overlay pill (●●●○○ · 60%) for stronger per-task affordance; falls
            // back to "X of Y tasks · Z%" text when total>8 (dot overflow risk).
            // SWAT-20260627-0007 W3: gate-blocked state suppresses "100%" text + caps thermo
            // visual at 90% + forces amber-warning color, so an all-tasks-done-but-gate-open
            // RFC never renders unqualified "100%" (see block-level comment above).
            var shimmerClass = ((pct > 0 && pct < 100) || isGateBlocked) ? ' is-shimmering' : '';
            var useDots = total <= 8;
            var pctBadge;
            if (isGateBlocked) {
              pctBadge = '<span class="pct" title="' + openShipGates + ' open ship-gate' + (openShipGates === 1 ? '' : 's') + ' blocks shipping">🚫 gate</span>';
            } else {
              pctBadge = '<span class="pct">' + pct + '%</span>';
            }
            var overlayInner;
            if (useDots) {
              var dotsHtml = '';
              for (var di = 0; di < total; di++) {
                dotsHtml += '<span class="dot' + (di < done ? ' is-done' : '') + '"></span>';
              }
              overlayInner = '<span class="dots" aria-label="' + done + ' of ' + total + ' tasks">' + dotsHtml + '</span>' + pctBadge;
            } else {
              overlayInner = done + ' of ' + total + ' tasks' + pctBadge;
            }
            var fillPct = isGateBlocked ? 90 : pct;
            var fillColor = isGateBlocked ? 'var(--warning)' : color;
            var tooltip = isGateBlocked
              ? done + ' of ' + total + ' tasks complete BUT ' + openShipGates + ' open ship-gate' + (openShipGates === 1 ? '' : 's') + ' -- not shipped'
              : done + ' of ' + total + ' tasks complete (' + pct + '%)';
            html += '<div class="cairn-card-tasks" title="' + tooltip + '">';
            html += '<div class="cairn-card-tasks-thermo">';
            html += '<div class="cairn-card-tasks-thermo-fill' + shimmerClass + '" data-pct="' + fillPct + '" style="width:' + fillPct + '%;background-color:' + fillColor + ';--prog-pct:' + fillPct + '%"></div>';
            html += '<div class="cairn-card-tasks-thermo-text">' + overlayInner + '</div>';
            html += '</div>';
            html += '</div>';
          }
        }

        // Bottom three-segment meta (OPERATOR iter-2 2026-05-29):
        // left=ID | center=@author + wave-icons | right=tag.
        // Title/desc above get max breathing room; this row stays compact.
        html += '<div class="cairn-card-meta">';
        html += '<span class="cairn-card-id-badge" title="' + Cairn.esc(rfc.rfc_id) + '">' + Cairn.esc(displayId) + '</span>';
        html += '<div class="cairn-card-meta-center">';
        if (rfc.author_id) html += '<span class="cairn-card-author">@' + Cairn.esc(rfc.author_id) + '</span>';
        html += Cairn.renderWaveBadge(rfc.wave_count);
        if (rfc.response_count) html += '<span class="cairn-card-responses" title="' + rfc.response_count + ' response' + (rfc.response_count === 1 ? '' : 's') + ' across ' + (rfc.wave_count || 0) + ' wave' + ((rfc.wave_count || 0) === 1 ? '' : 's') + '">' + rfc.response_count + '\uD83D\uDCAC</span>';
        html += '</div>';
        var domainLabel = Cairn.esc(rfc.domain || '');
        var domainClass = domainLabel ? ' cairn-cat-' + domainLabel.toLowerCase().replace(/[^a-z]/g, '') : '';
        if (domainLabel) html += '<span class="cairn-card-category' + domainClass + '" title="' + domainLabel + '">' + Cairn.abbreviateTag(domainLabel) + '</span>';
        html += '</div>';

        // Dependency field (SWAT-20260701-0001, OPERATOR request): shows which
        // RFCs this one depends on / consolidates, sourced server-side from
        // related_rfcs + consolidates/ tags (cairn.py get_trail). Omit when empty
        // -- absence means "no known deps", not a binding gap.
        if (rfc.depends_on && rfc.depends_on.length) {
          html += '<div class="cairn-card-depends" title="Depends on / consolidates">per ' + Cairn.esc(rfc.depends_on.join(', ')) + '</div>';
        }

        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';

    // SWAT-superdash-perf-F: dirty-check gate matching the proven pattern in
    // taskboard.js/bus-panel.js. renderBoard() previously did a full
    // teardown+rebuild+re-wire (all card click listeners) on EVERY silent
    // auto-refresh (8s SSE-debounced + CairnPanel's 10s poll -- see the
    // OPERATOR-reported bug comment above), even when the rendered content
    // was byte-identical to the prior tick. The worst user-visible symptoms
    // (scroll jump, search-input wipe) were already patched via capture/
    // restore wrappers in refreshBoardSilent()/renderBoard() above, but the
    // underlying wasted rebuild + listener re-attachment on every tick
    // remained. Skip the innerHTML replace entirely when nothing changed.
    var domIsOurs = !!body.querySelector('.cairn-card, .cairn-seed-chip, .cairn-empty');
    var unchanged = domIsOurs && (html === Cairn._lastBoardRenderSig);
    Cairn._lastBoardRenderSig = html;
    if (unchanged) return;

    body.innerHTML = html;

    // Wire card clicks (kanban cards + seed chips + shipped chips)
    body.querySelectorAll('.cairn-card, .cairn-seed-chip').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.getAttribute('data-rfc');
        Cairn.loadForum(id);
      });
    });
  },

  seedsTrayOpen: false,
  toggleSeedsTray() {
    Cairn.seedsTrayOpen = !Cairn.seedsTrayOpen;
    Cairn.renderBoard();
  },

  renderDetail(rfc) {
    Cairn.view = 'detail';
    Cairn.selectedRfc = rfc;
    var body = document.getElementById('cairn-body');
    var detailColor = Cairn.stageColors[Cairn.normalizeStage(rfc.status)] || 'hsl(0,0%,60%)';

    var html = '<div class="cairn-detail">';

    // SWAT-superdash-perf-F: renderDetail() is re-invoked LIVE via SSE when the
    // currently-open RFC receives an update elsewhere (see cairn-cache.js's
    // Layer 5 courtesy re-render: Cairn.loadForum(id, {forceFresh:true}) ->
    // renderDetail()). Unlike the wave-collapse state (already safe -- persisted
    // in Cairn._waveCollapsed/_synthCollapsed JS objects, not the DOM, so it
    // survives a full rebuild), the "Add commentary" textarea and scroll
    // position had NO preservation at all: a live update from someone else
    // while a user is mid-typing a note would silently wipe their unsaved text.
    // Same capture-before/restore-after technique already proven for the
    // search input in renderBoard() above.
    var _prevNoteInput = document.getElementById('cairn-note-text');
    var _prevNoteValue = _prevNoteInput ? _prevNoteInput.value : '';
    var _prevNoteHadFocus = _prevNoteInput && document.activeElement === _prevNoteInput;
    var _prevNoteSelStart = _prevNoteHadFocus ? _prevNoteInput.selectionStart : null;
    var _prevNoteSelEnd = _prevNoteHadFocus ? _prevNoteInput.selectionEnd : null;
    var _prevBodyScrollTop = body ? body.scrollTop : 0;


    // Sticky-head: pane-freezes nav + archive banner + header above the scrolling body+waves (OPERATOR-direct 2026-06-14, UXIA).
    html += '<div class="cairn-detail-sticky-head">';

    // Nav back
    html += '<div class="cairn-detail-nav">';
    html += '<button class="cairn-btn-back" onclick="Cairn.loadBoard()">← Board</button>';
    html += '<span class="cairn-detail-stage" style="color:' + detailColor + '">' + (Cairn.stageLabels[Cairn.normalizeStage(rfc.status)] || rfc.status) + '</span>';
    html += '</div>';

    // Archive reason banner -- prominent display for archived/superseded/cancelled/deferred items
    var archiveStatuses = ['archived', 'superseded', 'cancelled', 'deferred'];
    if (archiveStatuses.indexOf(rfc.status) !== -1) {
      var archiveReason = '';
      var archiveActor = '';
      var archiveDate = '';
      var archiveCategory = rfc.status;
      // Find the most recent audit entry that transitioned TO this archived state
      var audit = rfc.audit || [];
      for (var i = audit.length - 1; i >= 0; i--) {
        if (audit[i].to_state === rfc.status) {
          archiveReason = audit[i].reason || '';
          archiveActor = audit[i].actor_id || '';
          archiveDate = audit[i].audited_at || '';
          break;
        }
      }
      var categoryIcons = { archived: '📦', superseded: '🔄', cancelled: '❌', deferred: '⏸️' };
      var categoryIcon = categoryIcons[archiveCategory] || '📦';

      html += '<div class="cairn-archive-banner" data-testid="archive-banner">';
      html += '<div class="cairn-archive-banner-icon">' + categoryIcon + '</div>';
      html += '<div class="cairn-archive-banner-content">';
      html += '<div class="cairn-archive-banner-title">' + Cairn.esc(archiveCategory.charAt(0).toUpperCase() + archiveCategory.slice(1)) + '</div>';
      if (archiveReason) {
        html += '<div class="cairn-archive-banner-reason" data-testid="archive-reason">' + Cairn.esc(archiveReason) + '</div>';
      }
      if (rfc.superseded_by) {
        html += '<div class="cairn-archive-banner-superseded">Superseded by: <a class="cairn-archive-banner-link" data-testid="superseded-link" onclick="Cairn.loadForum(\'' + Cairn.escJs(rfc.superseded_by) + '\')">' + Cairn.esc(rfc.superseded_by) + '</a></div>';
      }
      if (archiveActor || archiveDate) {
        html += '<div class="cairn-archive-banner-meta">';
        if (archiveActor) html += '<span>by @' + Cairn.esc(archiveActor) + '</span>';
        if (archiveDate) html += '<span> · ' + Cairn.formatDate(archiveDate) + '</span>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // Header
    html += '<div class="cairn-detail-header">';
    var detailDisplayId = (rfc.rfc_id || '').replace(/^(RFC|SEED)-/i, '');
    html += '<h2 class="cairn-detail-title">' + Cairn.esc(rfc.title) + ' <span class="cairn-detail-id-badge">' + Cairn.esc(detailDisplayId) + '</span></h2>';
    html += '<div class="cairn-detail-meta">';
    html += '<span class="cairn-tag-chip">' + Cairn.esc(rfc.domain || '') + '</span>';
    html += '<span class="cairn-meta-author">by @' + Cairn.esc(rfc.author_id || '') + '</span>';
    html += '<span class="cairn-meta-date">' + Cairn.formatDate(rfc.created_at) + '</span>';
    html += '</div>';
    if (rfc.tags && rfc.tags.length) {
      html += '<div class="cairn-detail-tags">';
      rfc.tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
    // /cairn-detail-sticky-head
    html += '</div>';

    // Body
    html += '<div class="cairn-detail-body">' + Cairn.renderRfcBodyWithSynthesisCollapse(rfc.body || rfc.problem || '') + '</div>';

    // Waves (collapsible -- LIVE expanded by default, closed collapsed)
    var waves = rfc.waves || [];
    if (waves.length) {
      Cairn._waveCollapsed = Cairn._waveCollapsed || {};
      Cairn._synthCollapsed = Cairn._synthCollapsed || {};
      waves.forEach(function(wave) {
        var waveOpen = !wave.closed_at;
        var waveSynthesized = !waveOpen && wave.synthesis && wave.synthesis.trim();
        var waveKey = rfc.rfc_id + '-w' + wave.round_num;
        var isCollapsed = Cairn._waveCollapsed[waveKey] !== undefined
          ? Cairn._waveCollapsed[waveKey]
          : !waveOpen; // closed waves default collapsed
        var responses = wave.responses || [];
        html += '<div class="cairn-wave' + (waveOpen ? ' cairn-wave-active' : '') + (waveSynthesized ? ' cairn-wave-synthesized-state cairn-wave-compact' : '') + (isCollapsed ? ' collapsed' : '') + '" data-wave-key="' + Cairn.esc(waveKey) + '">';
        html += '<div class="cairn-wave-header">';
        html += '<span class="cairn-wave-toggle">▼</span>';
        html += '<span class="cairn-wave-num">Wave ' + wave.round_num + '</span>';
        // SWAT-0007: drop the [mode] tag on synthesized waves -- it's noise on the
        // compact summary row; keep it only while a wave is still being deliberated.
        if (!waveSynthesized) html += '<span class="cairn-wave-mode">[' + Cairn.esc(wave.mode || 'standard') + ']</span>';
        if (waveOpen) html += '<span class="cairn-wave-live">● LIVE</span>';
        else if (waveSynthesized) html += '<span class="cairn-wave-synthesized-badge">✓ SYNTHESIZED</span>';
        html += '<span class="cairn-wave-resp-count">' + responses.length + ' response' + (responses.length !== 1 ? 's' : '') + '</span>';
        html += '</div>';

        // SWAT-0007: for closed+synthesized waves, surface the FULL synthesis ALWAYS --
        // rendered OUTSIDE the collapsible body so every wave's outcome reads at a glance
        // in a compact stacked summary. Only the prompt + responses live inside the
        // collapsible body (collapsed by default = the de-clutter). Open/LIVE waves keep
        // prompt-first ordering inside the body as before.
        if (waveSynthesized) {
          var synthKey = waveKey + '-synth';
          var synthCollapsed = Cairn._synthCollapsed[synthKey] || false;
          html += '<div class="cairn-wave-synthesis cairn-wave-synthesis-always' + (synthCollapsed ? ' collapsed' : '') + '" data-synth-key="' + Cairn.esc(synthKey) + '">';
          html += '<div class="cairn-wave-synthesis-label">';
          html += '<span class="cairn-wave-toggle">▼</span>';
          html += '<span>📝 Synthesis</span>';
          html += '</div>';
          html += '<div class="cairn-wave-synthesis-content">' + Cairn.renderMd(wave.synthesis) + '</div>';
          html += '</div>';
        }

        html += '<div class="cairn-wave-body">';

        html += '<div class="cairn-wave-prompt">' + Cairn.renderMd(wave.prompt || '') + '</div>';

        // Responses
        if (responses.length) {
          responses.forEach(function(resp) {
            html += Cairn.renderResponse(rfc, resp);
          });
        } else {
          html += '<div class="cairn-empty">No responses yet</div>';
        }

        // Fallback: if wave still has synthesis but we didn't render it above (e.g. open wave
        // that somehow has synthesis), render it at the tail so it isn't lost.
        if (!waveSynthesized && wave.synthesis && wave.synthesis.trim()) {
          html += '<div class="cairn-wave-synthesis">';
          html += '<div class="cairn-wave-synthesis-label">📝 Synthesis</div>';
          html += '<div class="cairn-wave-synthesis-content">' + Cairn.renderMd(wave.synthesis) + '</div>';
          html += '</div>';
        }
        html += '</div>'; // .cairn-wave-body

        // SWAT-0007: the 240-char collapsed preview is retired for synthesized waves --
        // the full synthesis is now always-visible above (outside the body). Keep the
        // preview only as a fallback for any closed wave WITHOUT synthesis (rare).
        if (wave.synthesis && wave.synthesis.trim() && !waveOpen && !waveSynthesized) {
          html += '<div class="cairn-wave-synthesis-preview">';
          html += '<span class="cairn-wave-synthesis-preview-icon">📝</span>';
          var synthPreview = wave.synthesis.replace(/[#*_`\[\]]/g, '').substring(0, 240);
          if (wave.synthesis.length > 240) synthPreview += '…';
          html += '<span class="cairn-wave-synthesis-preview-text">' + Cairn.esc(synthPreview) + '</span>';
          html += '</div>';
        }

        html += '</div>';
      });
    }

    // Solidplan section (first-class, between waves and action bar)
    if (rfc.solidplan) {
      html += '<div class="cairn-solidplan">';
      html += '<div class="cairn-solidplan-header">';
      html += '<span class="cairn-solidplan-icon">📋</span>';
      html += '<span class="cairn-solidplan-label">Solidplan</span>';
      html += '<span class="cairn-solidplan-meta">by @' + Cairn.esc(rfc.solidplan_author || '') + ' · ' + Cairn.formatDate(rfc.solidplan_at) + '</span>';
      html += '<span class="cairn-wave-toggle">▼</span>';
      html += '</div>';
      html += '<div class="cairn-solidplan-body">' + Cairn.renderMd(rfc.solidplan) + '</div>';
      html += '</div>';
    }

    // OPERATOR action bar -- contextual transition buttons
    var normalizedStatus = Cairn.normalizeStage(rfc.status);
    var stageIdx = Cairn.STAGE_ORDER.indexOf(normalizedStatus);
    var isArchived = ['archived', 'deferred', 'superseded', 'cancelled'].indexOf(rfc.status) !== -1;
    var rfcIdJs = Cairn.escJs(rfc.rfc_id);

    html += '<div class="cairn-action-bar">';

    if (isArchived) {
      // Archived items: show restore button
      html += '<button class="cairn-btn cairn-btn-restore" onclick="Cairn.actionRestore(\'' + rfcIdJs + '\')" data-rfc-action="' + Cairn.esc(rfc.rfc_id) + '">↩ Restore</button>';
    } else if (stageIdx >= 0) {
      // Backward button (demote)
      if (stageIdx > 0) {
        var prevStage = Cairn.STAGE_ORDER[stageIdx - 1];
        var prevLabel = Cairn.stageLabels[prevStage] || prevStage;
        html += '<button class="cairn-btn cairn-btn-demote" onclick="Cairn.actionTransition(\'' + rfcIdJs + '\',\'' + prevStage + '\')" data-rfc-action="' + Cairn.esc(rfc.rfc_id) + '">← ' + Cairn.esc(prevLabel) + '</button>';
      }

      // Stage dots
      html += '<span class="cairn-stage-dots">';
      Cairn.STAGE_ORDER.forEach(function(s, i) {
        var dotClass = i === stageIdx ? 'cairn-dot-active' : (i < stageIdx ? 'cairn-dot-done' : 'cairn-dot-future');
        html += '<span class="cairn-dot ' + dotClass + '" title="' + Cairn.esc(Cairn.stageLabels[s] || s) + '" style="--dot-color:' + Cairn.stageColors[s] + '"></span>';
      });
      html += '</span>';

      // Forward button (promote)
      if (stageIdx < Cairn.STAGE_ORDER.length - 1) {
        var nextStage = Cairn.STAGE_ORDER[stageIdx + 1];
        var nextLabel = Cairn.stageLabels[nextStage] || nextStage;
        html += '<button class="cairn-btn cairn-btn-primary cairn-btn-promote" onclick="Cairn.actionTransition(\'' + rfcIdJs + '\',\'' + nextStage + '\')" data-rfc-action="' + Cairn.esc(rfc.rfc_id) + '">' + Cairn.esc(nextLabel) + ' →</button>';
      }

      // Archive button (separate from progression)
      html += '<button class="cairn-btn cairn-btn-archive" onclick="Cairn.actionTransition(\'' + rfcIdJs + '\',\'archived\')" data-rfc-action="' + Cairn.esc(rfc.rfc_id) + '" title="Archive">📦</button>';
    }

    html += '</div>';

    // OPERATOR notes section
    html += '<div class="cairn-notes-section">';
    html += '<h3 class="cairn-notes-title">OPERATOR Notes</h3>';
    var notes = rfc.operator_notes || [];
    if (notes.length) {
      notes.forEach(function(note) {
        html += '<div class="cairn-operator-note">';
        html += '<div class="cairn-note-meta"><span class="cairn-note-author">★ ' + Cairn.esc(note.author_id || 'OPERATOR') + '</span>';
        html += '<span class="cairn-note-date">' + Cairn.formatDate(note.created_at) + '</span></div>';
        html += '<div class="cairn-note-body">' + Cairn.renderMd(note.body || '') + '</div>';
        html += '</div>';
      });
    } else {
      html += '<div class="cairn-empty">No notes yet</div>';
    }
    html += '<div class="cairn-note-input">';
    html += '<textarea id="cairn-note-text" class="cairn-note-textarea" placeholder="Add commentary…" rows="3"></textarea>';
    html += '<button class="cairn-btn cairn-btn-primary" onclick="Cairn.addNote(\'' + Cairn.escJs(rfc.rfc_id) + '\')">Post Note</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    body.innerHTML = html;

    // Restore the "Add commentary" textarea's unsaved text + cursor/focus, and
    // the detail pane's scroll position, across the rebuild triggered above.
    // Only restore text if there IS unsaved text -- an empty prior value means
    // either nothing was typed or a note was just successfully posted (which
    // itself triggers a re-render with a fresh empty textarea; don't fight that).
    if (_prevNoteValue) {
      var _newNoteInput = document.getElementById('cairn-note-text');
      if (_newNoteInput) {
        _newNoteInput.value = _prevNoteValue;
        if (_prevNoteHadFocus) {
          _newNoteInput.focus();
          if (_prevNoteSelStart != null) {
            _newNoteInput.setSelectionRange(_prevNoteSelStart, _prevNoteSelEnd);
          }
        }
      }
    }
    if (body) body.scrollTop = _prevBodyScrollTop;

    // Wire collapsible wave headers
    body.querySelectorAll('.cairn-wave[data-wave-key] .cairn-wave-header').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var wave = hdr.closest('.cairn-wave');
        if (wave) {
          wave.classList.toggle('collapsed');
          var key = wave.getAttribute('data-wave-key');
          Cairn._waveCollapsed = Cairn._waveCollapsed || {};
          Cairn._waveCollapsed[key] = wave.classList.contains('collapsed');
        }
      });
    });

    // Wire collapsible wave-synthesis sub-frames (nested; independent of wave collapse)
    body.querySelectorAll('.cairn-wave-synthesis-always[data-synth-key] .cairn-wave-synthesis-label').forEach(function(lbl) {
      lbl.addEventListener('click', function(e) {
        e.stopPropagation();
        var synth = lbl.closest('.cairn-wave-synthesis-always');
        if (synth) {
          synth.classList.toggle('collapsed');
          var key = synth.getAttribute('data-synth-key');
          Cairn._synthCollapsed = Cairn._synthCollapsed || {};
          Cairn._synthCollapsed[key] = synth.classList.contains('collapsed');
        }
      });
    });

    // Wire collapsible solidplan header
    var spHeader = body.querySelector('.cairn-solidplan-header');
    if (spHeader) {
      spHeader.addEventListener('click', function() {
        spHeader.closest('.cairn-solidplan').classList.toggle('collapsed');
      });
    }

    // Wire collapsible legacy synthesis sections inside RFC body
    body.querySelectorAll('.cairn-body-synthesis-section .cairn-body-synthesis-header').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var section = hdr.closest('.cairn-body-synthesis-section');
        if (section) section.classList.toggle('collapsed');
      });
    });
  },

  renderResponse(rfc, resp) {
    var stanceClass = 'cairn-stance-' + (resp.stance || 'neutral');
    var respId = resp.id || resp.response_id || 0;
    var signals = resp.signals || {};

    var html = '<div class="cairn-response">';
    html += '<div class="cairn-resp-header">';
    html += '<span class="cairn-resp-author">@' + Cairn.esc(resp.author_id || '') + '</span>';
    html += '<span class="cairn-resp-stance ' + stanceClass + '">[' + Cairn.esc(resp.stance || '?') + ']</span>';
    if (resp.is_starred) html += '<span class="cairn-star">⭐</span>';
    // Signal counts
    var sigHtml = '';
    if (signals.support) sigHtml += '👍' + signals.support + ' ';
    if (signals.nuance) sigHtml += '🤔' + signals.nuance + ' ';
    if (signals.object) sigHtml += '👎' + signals.object + ' ';
    html += '<span class="cairn-resp-signals">' + sigHtml + '</span>';
    html += '</div>';
    html += '<div class="cairn-resp-body">' + Cairn.renderMd(resp.body || '') + '</div>';

    // Comments thread
    if (resp.comments && resp.comments.length) {
      resp.comments.forEach(function(c) {
        var frameClass = c.is_operator_frame ? ' cairn-operator-frame' : '';
        html += '<div class="cairn-comment' + frameClass + '">';
        html += '<span class="cairn-comment-author">' + (c.is_operator_frame ? '★ ' : '└─ ') + Cairn.esc(c.author_id || '') + ':</span> ';
        html += '<div class="cairn-comment-body">' + Cairn.renderMd(c.body || '') + '</div>';
        html += '</div>';
      });
    }

    // Interaction buttons (signals on this response)
    if (respId) {
      html += '<div class="cairn-resp-actions">';
      Cairn.stances.forEach(function(stance) {
        html += '<button class="cairn-action-btn cairn-signal-' + stance + '" ';
        html += 'onclick="Cairn.sendSignal(' + respId + ',\'' + stance + '\')" ';
        html += 'title="' + stance + '">' + Cairn.stanceIcons[stance] + '</button>';
      });
      // Star button (OPERATOR-only -- shown to all, backend enforces)
      html += '<button class="cairn-action-btn cairn-signal-star" ';
      html += 'onclick="Cairn.sendStar(\'response\',' + respId + ')" title="Star (OPERATOR)">⭐</button>';
      html += '<button class="cairn-action-btn cairn-signal-frame" onclick="Cairn.sendFrame(' + respId + ')" title="Frame (OPERATOR)">🖼️</button>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  setOperatorToken() {
    var token = prompt('Enter OPERATOR token:');
    if (token) {
      localStorage.setItem('cairn_operator_token', token);
      Cairn.toast('🔑 Token saved');
    }
  },
});
