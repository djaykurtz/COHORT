/* Superdash v2 -- CAIRN Drawer (RFC Lifecycle + Knowledge Engine)
 * Live API integration (S3/S4 backend on PROD :8420).
 * Three tiers: Ideation (kanban+forum) | Scratch (ephemeral feed) | KB (curated knowledge)
 */

var Cairn = {
  open: false,
  view: 'board',
  activeTab: 'board',
  selectedRfc: null,
  activeFilters: [],
  statusFilter: null,
  trailData: null,
  scratchData: null,
  kbData: null,
  kbTagFilter: null,
  forumCache: {},
  loading: false,
  scratchRefreshTimer: null,
  hideEmptySeeds: false,

  // SWAT-20260615-0014: electric-border accent on near-complete RFC cards is an
  // opt-in OPERATOR A/B exploration. Read the ?electric=1 query-param once at
  // load; cairn-board gates the .electric-border class on this flag.
  electricEnabled: (function () {
    try { return new URLSearchParams(window.location.search).get('electric') === '1'; }
    catch (e) { return false; }
  })(),

  stages: ['seed', 'ideation', 'in_round', 'ratified', 'shipped'],
  stageLabels: {
    seed: 'Seeds', ideation: 'Ideation', in_round: 'In Round',
    ratified: 'Ratified', shipped: 'Shipped'
  },
  stageColors: {
    seed: 'hsl(200, 70%, 55%)',
    ideation: 'hsl(180, 60%, 50%)',
    in_round: 'hsl(270, 65%, 65%)',
    ratified: 'hsl(150, 60%, 50%)',
    shipped: 'hsl(100, 50%, 45%)'
  },
  domains: ['security', 'automation', 'integration', 'infrastructure', 'process', 'tooling'],
  domainColors: {
    GOVE: 'hsl(0, 70%, 60%)',
    TOOL: 'hsl(160, 60%, 48%)',
    INFR: 'hsl(270, 60%, 62%)',
    PROC: 'hsl(25, 90%, 55%)',
    SECU: 'hsl(20, 55%, 35%)',
    AUTO: 'hsl(200, 70%, 55%)',
    INTE: 'hsl(180, 60%, 50%)',
    security: 'hsl(20, 55%, 35%)',
    automation: 'hsl(200, 70%, 55%)',
    integration: 'hsl(180, 60%, 50%)',
    infrastructure: 'hsl(270, 60%, 62%)',
    process: 'hsl(25, 90%, 55%)',
    tooling: 'hsl(160, 60%, 48%)',
    governance: 'hsl(0, 70%, 60%)',
    architecture: 'hsl(340, 60%, 55%)',
    breathbus: 'hsl(280, 50%, 55%)'
  },
  stances: ['support', 'object', 'nuance', 'defer'],
  stanceIcons: { support: '👍', object: '👎', nuance: '🤔', defer: '⏸️' },

  // ───── DRAWER TOGGLE ─────
  _toggling: false,
  toggle(e) {
    if (e) { e.stopPropagation(); e.stopImmediatePropagation(); }
    if (Cairn._toggling) return;
    Cairn._toggling = true;
    setTimeout(function() { Cairn._toggling = false; }, 350);

    var drawer = document.getElementById('cairn-drawer');
    var overlay = document.getElementById('cairn-overlay');

    // Sync open state with actual DOM to prevent drift
    var isActuallyOpen = drawer.classList.contains('open');
    if (Cairn.open !== isActuallyOpen) {
      Cairn.open = isActuallyOpen;
    }

    Cairn.open = !Cairn.open;
    if (Cairn.open) {
      overlay.classList.add('visible');
      drawer.offsetHeight; // force reflow before transition
      drawer.classList.add('open');
      // Defer content load -- DOM writes during transform transition cancel the animation
      setTimeout(function() {
        try { Cairn.switchTab(Cairn.activeTab); } catch(err) { console.error('[Cairn] switchTab error:', err); }
      }, 60);
    } else {
      drawer.classList.remove('open');
      overlay.classList.remove('visible');
      Cairn.selectedRfc = null;
      Cairn.view = 'board';
      Cairn.stopScratchRefresh();
    }
  },

  // ───── TAB SWITCHING ─────
  switchTab(tab) {
    Cairn.activeTab = tab;
    // Update tab button states
    document.querySelectorAll('.cairn-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    // Show/hide filter bar (only for board tab)
    var filters = document.getElementById('cairn-filters');
    filters.style.display = tab === 'board' ? '' : 'none';
    // Stop scratch auto-refresh if leaving scratch tab
    if (tab !== 'scratch') Cairn.stopScratchRefresh();

    if (tab === 'board') {
      Cairn.loadBoard();
    } else if (tab === 'scratch') {
      Cairn.loadScratch();
    } else if (tab === 'kb') {
      Cairn.loadKb();
    } else if (tab === 'archive') {
      Cairn.loadArchive();
    }
  },

  // ───── DATA LOADING ─────
  async enrichWaveCounts(rfcs) {
    // Fetch wave counts for in_round RFCs (lightweight enrichment)
    var active = rfcs.filter(function(r) { return r._stage === 'in_round' || r._stage === 'ideation'; });
    var promises = active.slice(0, 10).map(function(rfc) {
      return API.cairnForum(rfc.rfc_id).then(function(data) {
        if (data && data.waves) rfc.wave_count = data.waves.length;
      }).catch(function() {});
    });
    await Promise.all(promises);
  },

  // Resolve a short ID prefix (e.g. "RFC-30C580") to full slugified ID
  async resolveShortId(prefix) {
    // Use cached trail data if available, otherwise fetch it
    var data = Cairn.trailData;
    if (!data || !data.columns) {
      data = await API.cairnTrail();
      if (data && data.columns) {
        if (Cairn.normalizeTrail) data = Cairn.normalizeTrail(data);
        Cairn.trailData = data;
      }
    }
    if (!data || !data.columns) return null;
    var cols = data.columns;
    var allItems = [].concat(cols.seed || [], cols.ideation || [], cols.in_round || [], cols.ratified || [], cols.shipped || []);
    var upperPrefix = prefix.toUpperCase();
    var matches = allItems.filter(function(item) {
      return (item.id || '').toUpperCase().indexOf(upperPrefix) === 0;
    });
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) return matches[0].id; // Best match: first hit
    return null;
  },

  async loadBoard() {
    Cairn.view = 'board';
    Cairn.setLoading(true);
    // SWAT-20260611-0009: per-RFC `tasks: {done, total}` is now embedded in the
    // trail payload (server-side LEFT JOIN); no parallel /api/tasks fetch needed.
    var data = await API.cairnTrail();
    Cairn.setLoading(false);
    if (!data || data.error) {
      Cairn.renderError('Failed to load trail: ' + (data ? data.error : 'network error'));
      return;
    }
    Cairn.trailData = Cairn.normalizeTrail(data);
    Cairn.renderBoard();
  },

  // Courtesy auto-refresh path (SSE poll -> cairn-cache Layer-5). Unlike
  // loadBoard(), this does NOT call setLoading() -- setLoading blanks
  // #cairn-body to a spinner during the fetch, which under the permanent 10s
  // poll churn made the board "turn black + refresh" every ~10s (OPERATOR P1,
  // SWAT-20260628). It also preserves the scroll position of EACH kanban
  // column (.cairn-col-items scroll internally; the body barely scrolls), so
  // scrolling the Ratified column no longer jumps to the top on every event.
  // Data is fetched FIRST, then a single synchronous renderBoard() swap with
  // scroll capture/restore around it -> no spinner gap, no visible blank.
  async refreshBoardSilent() {
    if (Cairn.view !== 'board' || !Cairn.open) return;
    if (document.querySelector('.cairn-detail')) return;
    var data = await API.cairnTrail();
    // On failure keep the current board intact (no blank, no error screen).
    if (!data || data.error) return;
    // User may have navigated away or opened a detail during the await.
    if (Cairn.view !== 'board' || !Cairn.open || document.querySelector('.cairn-detail')) return;

    // Capture scroll positions immediately before the synchronous DOM swap.
    var oldCols = document.querySelectorAll('#cairn-body .cairn-col-items');
    var savedTops = [];
    for (var i = 0; i < oldCols.length; i++) savedTops[i] = oldCols[i].scrollTop;
    var kanban = document.querySelector('#cairn-body .cairn-kanban');
    var savedLeft = kanban ? kanban.scrollLeft : 0;
    var bodyEl = document.getElementById('cairn-body');
    var savedBodyTop = bodyEl ? bodyEl.scrollTop : 0;

    Cairn.trailData = Cairn.normalizeTrail(data);
    Cairn.renderBoard();

    // Restore scroll positions on the freshly-rendered DOM (column order is
    // stable: Cairn.boardStages). scrollTop is clamped if content shrank.
    var newCols = document.querySelectorAll('#cairn-body .cairn-col-items');
    for (var j = 0; j < newCols.length; j++) {
      if (savedTops[j] != null) newCols[j].scrollTop = savedTops[j];
    }
    var newKanban = document.querySelector('#cairn-body .cairn-kanban');
    if (newKanban) newKanban.scrollLeft = savedLeft;
    if (bodyEl) bodyEl.scrollTop = savedBodyTop;
  },

  async loadForum(rfcId) {
    Cairn.setLoading(true);
    var data = await API.cairnForum(rfcId);
    Cairn.setLoading(false);
    if (!data || data.error) {
      Cairn.renderError('Failed to load forum: ' + (data ? data.error : 'network error'));
      return;
    }
    // Normalize: merge rfc fields to top level, attach waves
    var rfc = data.rfc || data;
    rfc.rfc_id = rfc.rfc_id || rfc.id || rfcId;
    rfc.author_id = rfc.author_id || rfc.author;
    rfc.waves = data.waves || rfc.waves || [];
    rfc.votes = data.votes || rfc.votes || {};
    Cairn.forumCache[rfcId] = rfc;
    Cairn.selectedRfc = rfc;
    Cairn.renderDetail(rfc);
  },

  setLoading(on) {
    Cairn.loading = on;
    var body = document.getElementById('cairn-body');
    if (on && body) {
      body.innerHTML = '<div class="cairn-loading"><span class="cairn-spinner"></span> Loading…</div>';
    }
  },

  renderError(msg) {
    var body = document.getElementById('cairn-body');
    body.innerHTML = '<div class="cairn-error">' + Cairn.esc(msg) + '</div>';
  },

  // ───── LAYER 1: COMMAND CENTER (Kanban Board) ─────
  

  // ───── LAYER 2: RFC DETAIL (Forum View) ─────
  

  

  // ───── LAYER 3: INTERACTIONS (live API) ─────
  async sendSignal(responseId, signal) {
    var result = await API.operatorSignal(responseId, signal);
    if (result && !result.error) {
      Cairn.toast(Cairn.stanceIcons[signal] + ' Signal recorded');
      if (Cairn.selectedRfc) {
        if (typeof CairnCache !== 'undefined') CairnCache.invalidate(CairnCache.STORES.forums, Cairn.selectedRfc.rfc_id).catch(function() {});
        Cairn.loadForum(Cairn.selectedRfc.rfc_id);
      }
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
    }
  },

  async sendStar(targetType, targetId) {
    var result = await API.operatorStar(targetType, String(targetId));
    if (result && !result.error) {
      Cairn.toast('⭐ Starred');
      if (Cairn.selectedRfc) {
        if (typeof CairnCache !== 'undefined') CairnCache.invalidate(CairnCache.STORES.forums, Cairn.selectedRfc.rfc_id).catch(function() {});
        Cairn.loadForum(Cairn.selectedRfc.rfc_id);
      }
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
    }
  },

  async sendFrame(responseId) {
    var body = prompt('OPERATOR frame comment:');
    if (!body) return;
    var result = await API.operatorFrame(responseId, body);
    if (result && !result.error) {
      Cairn.toast('🖼️ Frame added');
      if (Cairn.selectedRfc) {
        if (typeof CairnCache !== 'undefined') CairnCache.invalidate(CairnCache.STORES.forums, Cairn.selectedRfc.rfc_id).catch(function() {});
        Cairn.loadForum(Cairn.selectedRfc.rfc_id);
      }
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
    }
  },

  async respondToWave(rfcId, roundNum) {
    var stanceEl = document.getElementById('cairn-respond-stance');
    var bodyEl = document.getElementById('cairn-respond-body');
    if (!bodyEl || !bodyEl.value.trim()) { Cairn.toast('⚠️ Response body required', true); return; }
    var stance = stanceEl ? stanceEl.value : 'support';
    var result = await API.operatorRespond(rfcId, roundNum, bodyEl.value.trim(), stance);
    if (result && !result.error) {
      Cairn.toast('✓ Response submitted');
      if (typeof CairnCache !== 'undefined') CairnCache.invalidate(CairnCache.STORES.forums, rfcId).catch(function() {});
      Cairn.loadForum(rfcId);
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
    }
  },

  

  async actionTransition(rfcId, newState) {
    // Disable buttons for this RFC while pending
    document.querySelectorAll('[data-rfc-action="' + rfcId + '"]').forEach(function(btn) {
      btn.disabled = true;
      btn.classList.add('cairn-btn-pending');
    });

    // Optimistic update: move item locally before API call
    var snapshot = null;
    if (Cairn.trailData && Cairn.trailData.columns) {
      snapshot = JSON.parse(JSON.stringify(Cairn.trailData.columns));
      var item = null;
      var oldStage = null;
      // Find and remove from current column
      Object.keys(Cairn.trailData.columns).forEach(function(stage) {
        var col = Cairn.trailData.columns[stage];
        for (var i = 0; i < col.length; i++) {
          if ((col[i].id || col[i].rfc_id) === rfcId) {
            item = col.splice(i, 1)[0];
            oldStage = stage;
            break;
          }
        }
      });
      // Add to new column
      if (item) {
        var targetCol = Cairn.normalizeStage(newState);
        if (!Cairn.trailData.columns[targetCol]) Cairn.trailData.columns[targetCol] = [];
        item.status = newState;
        item._stage = targetCol;
        Cairn.trailData.columns[targetCol].push(item);
        Cairn.renderBoard();
      }
    }

    var result = await (newState === 'ratified' ? API.operatorRatify(rfcId) : API.cairnTransition(rfcId, newState));
    if (result && !result.error) {
      Cairn.toast('✓ Transitioned to ' + (Cairn.stageLabels[newState] || newState));
      // Update IndexedDB cache with optimistic state
      if (typeof CairnCache !== 'undefined' && CairnCache.putTrail) {
        CairnCache.putTrail(Cairn.trailData).catch(function() {});
      }
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
      // Revert optimistic update
      if (snapshot && Cairn.trailData) {
        Cairn.trailData.columns = snapshot;
        Cairn.renderBoard();
      }
      // Re-enable buttons on failure
      document.querySelectorAll('[data-rfc-action="' + rfcId + '"]').forEach(function(btn) {
        btn.disabled = false;
        btn.classList.remove('cairn-btn-pending');
      });
    }
  },

  async actionRestore(rfcId) {
    // Restore archived item -- use seed as default restore target
    document.querySelectorAll('[data-rfc-action="' + rfcId + '"]').forEach(function(btn) {
      btn.disabled = true;
      btn.classList.add('cairn-btn-pending');
    });
    var result = await API.cairnTransition(rfcId, 'seed', 'Restored from archive');
    if (result && !result.error) {
      Cairn.toast('↩ Restored to Seeds');
      Cairn.loadBoard(true);
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
      document.querySelectorAll('[data-rfc-action="' + rfcId + '"]').forEach(function(btn) {
        btn.disabled = false;
        btn.classList.remove('cairn-btn-pending');
      });
    }
  },

  async addNote(rfcId) {
    var el = document.getElementById('cairn-note-text');
    if (!el || !el.value.trim()) { Cairn.toast('⚠️ Note cannot be empty', true); return; }
    var result = await API.operatorPostComment(rfcId, el.value.trim());
    if (result && !result.error) {
      Cairn.toast('✓ Note added');
      el.value = '';
      // Invalidate cache so loadForum fetches fresh data with new note
      if (typeof CairnCache !== 'undefined') {
        CairnCache.invalidate(CairnCache.STORES.forums, rfcId).catch(function() {});
      }
      Cairn.loadForum(rfcId);
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Failed'), true);
    }
  },

  // ───── SEARCH ─────
  async search(query) {
    if (!query) return;
    // Direct-ID navigation: if query looks like an RFC or seed ID, resolve full ID via prefix match
    var idMatch = query.trim().match(/^(RFC|SEED)[-‐]?([A-Za-z0-9]+)$/i);
    if (idMatch) {
      var base = idMatch[1].toUpperCase();
      var num = idMatch[2].toUpperCase();
      // Try both "RFC-307" and "RFC307" since IDs may or may not have a hyphen
      var fullId = await Cairn.resolveShortId(base + '-' + num) || await Cairn.resolveShortId(base + num);
      if (fullId) {
        Cairn.loadForum(fullId);
        return;
      }
      // If not found in trail, fall through to regular search
    }
    Cairn.view = 'search';
    Cairn.setLoading(true);
    var data = await API.cairnSearch(query);
    Cairn.setLoading(false);
    var body = document.getElementById('cairn-body');
    if (!data || data.error) {
      body.innerHTML = '<div class="cairn-error">Search failed: ' + Cairn.esc(data ? data.error : 'network') + '</div>';
      return;
    }
    var results = data.results || [];
    var html = '<div class="cairn-search-results">';
    html += '<div class="cairn-detail-nav"><button class="cairn-btn-back" onclick="Cairn.loadBoard()">← Board</button>';
    html += '<span>' + results.length + ' results for "' + Cairn.esc(query) + '"</span></div>';
    results.forEach(function(r) {
      var itemId = r.id || r.rfc_id || '';
      var itemType = r.type || 'seed';
      html += '<div class="cairn-card" data-item-id="' + Cairn.esc(itemId) + '" data-item-type="' + Cairn.esc(itemType) + '">';
      html += '<div class="cairn-card-title">' + Cairn.esc(r.title || r.snippet || '') + '</div>';
      html += '<div class="cairn-card-bottom"><span>' + Cairn.esc(itemType) + '</span></div>';
      html += '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.cairn-card[data-item-id]').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.getAttribute('data-item-id');
        var type = (card.getAttribute('data-item-type') || '').toLowerCase();
        if (!id) return;
        // Route by item type -- forum endpoint only serves RFC-table items.
        // Without this, seeds/scratch/kb fall through to loadForum and 404
        // with the masked "network error (no cached data)" message
        // (real error surfacing is the paired fix in cairn-cache.js).
        if (type === 'kb') {
          if (typeof Cairn.loadKbDetail === 'function') Cairn.loadKbDetail(id);
          else Cairn.loadKb();
          return;
        }
        if (type === 'scratch') {
          if (typeof Cairn.toast === 'function') Cairn.toast('Scratch entry -- no detail view yet. Use scratch tab.', false);
          if (typeof Cairn.loadScratch === 'function') Cairn.loadScratch();
          return;
        }
        // seed / ideation / in_round / ratified / shipped / deferred / superseded / archived -> real RFC
        // Seeds live in the rfcs table; loadForum works for them (same as board seed-chip path).
        Cairn.loadForum(id);
      });
    });
  },

  // ───── FILTER HELPERS ─────
  clearFilters() {
    Cairn.activeFilters = [];
    Cairn.renderBoard();
  },

  clearStatusFilter() {
    Cairn.statusFilter = null;
    Cairn.renderBoard();
  },

  // ───── UTILITIES ─────
  toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'cairn-toast' + (isError ? ' cairn-toast-error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.classList.add('cairn-toast-show'); }, 10);
    setTimeout(function() { el.remove(); }, 2500);
  },

  sanitizeHtml(html) {
    // Strip script tags, event handlers, and javascript: URIs
    var clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    clean = clean.replace(/javascript\s*:/gi, '');
    clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    clean = clean.replace(/<object[\s\S]*?<\/object>/gi, '');
    clean = clean.replace(/<embed[\s\S]*?>/gi, '');
    return clean;
  },

  renderMd(text) {
    if (!text) return '';
    // Normalize literal \n sequences to real newlines (API sometimes returns escaped)
    var normalized = text.replace(/\\n/g, '\n');
    if (typeof marked !== 'undefined' && marked.parse) {
      return '<div class="cairn-markdown md-rendered">' + Cairn.sanitizeHtml(marked.parse(normalized)) + '</div>';
    }
    // Fallback: at least respect line breaks
    return '<div class="cairn-markdown"><pre>' + Cairn.esc(normalized) + '</pre></div>';
  },

  // RFC body render with collapsible legacy synthesis sections.
  // Targets pre-2026-06-01-fix auto-appended "## Wave N Synthesis" headings in RFC bodies.
  // Wraps each matched heading + following siblings (up to next H2) in a collapsed-by-default section.
  // Per DRAGON architect-CONCUR: literal `Wave \d+ Synthesis` regex only (v1 conservative scope),
  // always-collapsed (no per-RFC persist), synthesis-shape only (no broader appendage classification).
  renderRfcBodyWithSynthesisCollapse(text) {
    var rendered = Cairn.renderMd(text);
    if (!rendered) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = rendered;
    var root = tmp.querySelector('.cairn-markdown') || tmp;
    var children = Array.from(root.children);
    var synthRegex = /^Wave \d+ Synthesis$/;
    var anyMatched = false;
    var result = '';
    var i = 0;
    while (i < children.length) {
      var el = children[i];
      if (el.tagName === 'H2' && synthRegex.test(el.textContent.trim())) {
        anyMatched = true;
        var headingText = el.textContent.trim();
        var inner = '';
        i++;
        while (i < children.length && children[i].tagName !== 'H2') {
          inner += children[i].outerHTML;
          i++;
        }
        result += '<div class="cairn-body-synthesis-section collapsed">' +
                    '<div class="cairn-body-synthesis-header">' +
                      '<span class="cairn-wave-toggle">▼</span>' +
                      '<span class="cairn-body-synthesis-label">📜 ' + Cairn.esc(headingText) + ' <em class="cairn-body-synthesis-legacy-tag">(legacy / collapsed)</em></span>' +
                    '</div>' +
                    '<div class="cairn-body-synthesis-body">' + inner + '</div>' +
                  '</div>';
      } else {
        result += el.outerHTML;
        i++;
      }
    }
    if (!anyMatched) return rendered; // no-op fast path preserves original wrapper
    // Debug stub: emit a one-liner so any future "synthesis rendered un-wrapped in the wild"
    // bug-hunt has a fast "did the regex match?" signal without spelunking.
    // Per DRAGON review feedback. Gated on Cairn._debugSynthCollapse for noise control.
    if (Cairn._debugSynthCollapse) {
      try { console.debug('[cairn:synth-collapse] matched ' + (rendered.match(/<h2[^>]*>Wave \d+ Synthesis<\/h2>/g) || []).length + ' synthesis heading(s)'); } catch (e) {}
    }
    return '<div class="cairn-markdown md-rendered">' + result + '</div>';
  },

  esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  },

  escJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  },

  formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  relTime(iso) {
    if (!iso) return '';
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  // ───── SCRATCH FEED (Tier 1: Ephemeral) ─────
  

  

  

  

  

  // ───── ARCHIVE BROWSER ─────
  archiveData: null,
  archiveFilter: 'all',

  async loadArchive() {
    Cairn.view = 'archive';
    Cairn.setLoading(true);
    var filters = document.getElementById('cairn-filters');
    filters.style.display = 'none';
    try {
      var data = await API.get('/api/cairn/search?query=SEED OR RFC&scope=seeds,rfcs&limit=500');
      if (data && data.results) {
        Cairn.archiveData = data.results.filter(function(item) {
          var status = (item.status || '').toLowerCase();
          return status === 'archived' || status === 'deferred' || status === 'superseded' || status === 'cancelled';
        });
        Cairn.archiveData.sort(function(a, b) {
          return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
        });
      } else {
        Cairn.archiveData = [];
      }
    } catch(e) {
      Cairn.archiveData = [];
    }
    Cairn.setLoading(false);
    Cairn.renderArchive();
  },

  renderArchive() {
    var body = document.getElementById('cairn-body');
    var items = Cairn.archiveData || [];

    // Filter
    if (Cairn.archiveFilter !== 'all') {
      items = items.filter(function(i) { return i.status === Cairn.archiveFilter; });
    }

    var html = '<div class="cairn-archive">';
    // Header + filter chips
    html += '<div class="cairn-archive-header">';
    html += '<span class="cairn-archive-title">📦 Archived Seeds & RFCs</span>';
    html += '<span class="cairn-archive-count">' + items.length + ' items</span>';
    html += '</div>';

    html += '<div class="cairn-archive-filters">';
    var filters = ['all', 'archived', 'deferred', 'superseded', 'cancelled'];
    filters.forEach(function(f) {
      var active = Cairn.archiveFilter === f ? ' active' : '';
      var label = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
      html += '<button class="cairn-chip cairn-chip-archive' + active + '" onclick="Cairn.setArchiveFilter(\'' + f + '\')">' + label + '</button>';
    });
    html += '</div>';

    if (!items.length) {
      html += '<div class="cairn-empty">No archived items' + (Cairn.archiveFilter !== 'all' ? ' with status "' + Cairn.archiveFilter + '"' : '') + '</div>';
    } else {
      html += '<div class="cairn-archive-list">';
      items.forEach(function(item) {
        var id = item.rfc_id || item.id || '';
        var title = item.title || 'Untitled';
        var author = item.author_id || item.author || '';
        var status = item.status || 'archived';
        var date = item.updated_at || item.created_at || '';
        var dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

        var archiveDisplayId = id.replace(/^(RFC|SEED)-/i, '');
        html += '<div class="cairn-archive-item" onclick="Cairn.loadForum(\'' + Cairn.escJs(id) + '\')">';
        html += '<div class="cairn-archive-item-header">';
        html += '<span class="cairn-archive-item-id">' + Cairn.esc(archiveDisplayId) + '</span>';
        html += '<span class="cairn-archive-item-status cairn-badge-' + status + '">' + status + '</span>';
        html += '</div>';
        html += '<div class="cairn-archive-item-title">' + Cairn.esc(title) + '</div>';
        html += '<div class="cairn-archive-item-meta">';
        if (author) html += '<span class="cairn-archive-item-author">@' + Cairn.esc(author) + '</span>';
        if (dateStr) html += '<span class="cairn-archive-item-date">' + dateStr + '</span>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    body.innerHTML = html;
  },

  setArchiveFilter(filter) {
    Cairn.archiveFilter = filter;
    Cairn.renderArchive();
  },

  // ───── KB BROWSER (Tier 2: Curated) ─────
  

  

  async loadKbDetail(slug) {
    Cairn.setLoading(true);
    var data = await API.cairnKbDetail(slug);
    Cairn.setLoading(false);
    if (!data || data.error) {
      Cairn.renderError('Failed to load article: ' + (data ? data.error : 'network'));
      return;
    }
    Cairn._kbEditMode = false;
    Cairn._kbCurrentArticle = data;
    Cairn.renderKbDetail(data);
  },  renderKbDetail(article) {
    var body = document.getElementById('cairn-body');
    var editing = Cairn._kbEditMode;
    var html = '<div class="cairn-kb-detail">';
    html += '<div class="cairn-kb-detail-nav">';
    html += '<button class="cairn-btn-back" onclick="Cairn.loadKb()">← Back to Docs</button>';
    if (!editing && article.status !== 'archived') {
      html += '<button class="cairn-btn-edit" onclick="Cairn.enterKbEdit()">✏️ Edit</button>';
    }
    html += '</div>';
    html += '<div class="cairn-kb-detail-header">';
    if (editing) {
      html += '<input id="cairn-kb-title-editor" class="cairn-kb-title-editor" value="' + Cairn.esc(article.title || 'Untitled').replace(/"/g, '&quot;') + '" />';
    } else {
      html += '<h2 class="cairn-kb-detail-title">' + Cairn.esc(article.title || 'Untitled') + '</h2>';
    }
    html += '<div class="cairn-kb-detail-meta">';
    html += '<span class="cairn-kb-detail-author">@' + Cairn.esc(article.author_id || '') + '</span>';
    if (article.updated_at) html += '<span class="cairn-kb-detail-date">' + new Date(article.updated_at).toLocaleDateString() + '</span>';
    if (article.status) html += '<span class="cairn-kb-detail-status cairn-badge-' + article.status + '">' + Cairn.esc(article.status) + '</span>';
    html += '</div>';
    var tags = article.tags ? (Array.isArray(article.tags) ? article.tags : article.tags.split(',')) : [];
    if (tags.length) {
      html += '<div class="cairn-kb-detail-tags">';
      tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t.trim()) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
    var content = article.content || article.body || '';
    if (editing) {
      html += '<div class="cairn-kb-edit-area">';
      html += '<textarea id="cairn-kb-editor" class="cairn-kb-editor">' + Cairn.esc(content) + '</textarea>';
      html += '<div class="cairn-kb-edit-actions">';
      html += '<input id="cairn-kb-edit-summary" class="cairn-kb-edit-summary" placeholder="Edit summary (optional)" />';
      html += '<button class="cairn-btn-save" onclick="Cairn.saveKbEdit()">💾 Save</button>';
      html += '<button class="cairn-btn-cancel" onclick="Cairn.cancelKbEdit()">Cancel</button>';
      html += '</div>';
      html += '</div>';
    } else {
      html += '<div class="cairn-kb-detail-content">' + Cairn.renderMd(content) + '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    if (editing) {
      var editor = document.getElementById('cairn-kb-editor');
      if (editor) { editor.focus(); editor.setSelectionRange(0, 0); }
    }
  },  enterKbEdit() {
    Cairn._kbEditMode = true;
    if (Cairn._kbCurrentArticle) Cairn.renderKbDetail(Cairn._kbCurrentArticle);
  },  cancelKbEdit() {
    Cairn._kbEditMode = false;
    if (Cairn._kbCurrentArticle) Cairn.renderKbDetail(Cairn._kbCurrentArticle);
  },  async saveKbEdit() {
    var editor = document.getElementById('cairn-kb-editor');
    var summaryInput = document.getElementById('cairn-kb-edit-summary');
    var titleInput = document.getElementById('cairn-kb-title-editor');
    if (!editor || !Cairn._kbCurrentArticle) return;
    var newContent = editor.value;
    var newTitle = titleInput ? titleInput.value.trim() : null;
    var summary = summaryInput ? summaryInput.value.trim() : '';
    var slug = Cairn._kbCurrentArticle.slug;
    if (!slug) { Cairn.toast('No article slug'); return; }
    var saveBtn = document.querySelector('.cairn-btn-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    var result = await API.cairnKbEdit(slug, newContent, summary || 'Edited via superdash', newTitle);
    if (result && !result.error) {
      Cairn._kbEditMode = false;
      if (typeof CairnCache !== 'undefined') {
        CairnCache.invalidate(CairnCache.STORES.kb, slug).catch(function() {});
        CairnCache.invalidate(CairnCache.STORES.kbList, 'latest').catch(function() {});
      }
      // Re-fetch to update local state -- trust server 200 OK as success
      var verified = await API.cairnKbDetail(slug);
      if (verified && verified.content) {
        Cairn._kbCurrentArticle = verified;
      } else {
        Cairn._kbCurrentArticle.content = newContent;
        if (newTitle) Cairn._kbCurrentArticle.title = newTitle;
      }
      Cairn.toast('✅ Article saved');
      Cairn.renderKbDetail(Cairn._kbCurrentArticle);
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Save failed'), true);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; }
    }
  },async loadComments(rfcId) {
    var list = document.getElementById('cairn-commentary-list');
    if (!list) return;
    try {
      var data = await API.operatorGetComments(rfcId);
      if (!data || data.error) {
        list.innerHTML = '<div class="cairn-empty">Comments unavailable</div>';
        return;
      }
      var comments = data.comments || data || [];
      if (!Array.isArray(comments)) comments = [];
      if (!comments.length) {
        list.innerHTML = '<div class="cairn-empty">No commentary yet</div>';
        return;
      }
      var html = '';
      comments.forEach(function(c) {
        html += '<div class="cairn-comment">';
        html += '<div class="cairn-comment-meta">';
        html += '<span class="cairn-comment-author">OPERATOR</span>';
        html += '<span class="cairn-comment-date">' + Cairn.formatDate(c.created_at) + '</span>';
        html += '</div>';
        html += '<div class="cairn-comment-body">' + Cairn.renderMd(c.content || c.body || '') + '</div>';
        html += '</div>';
      });
      list.innerHTML = html;
    } catch (e) {
      list.innerHTML = '<div class="cairn-empty">Failed to load comments</div>';
    }
  },  async postComment(rfcId) {
    var input = document.getElementById('cairn-comment-input');
    if (!input) return;
    var content = input.value.trim();
    if (!content) { Cairn.toast('Enter a comment first'); return; }
    var token = localStorage.getItem('cairn_operator_token');
    if (!token) { Cairn.setOperatorToken(); return; }
    try {
      var result = await API.operatorPostComment(rfcId, content);
      if (result && !result.error) {
        input.value = '';
        Cairn.toast('Comment posted');
        // Invalidate cache so fresh data includes new comment
        if (typeof CairnCache !== 'undefined') {
          CairnCache.invalidate(CairnCache.STORES.forums, rfcId).catch(function() {});
        }
        Cairn.loadComments(rfcId);
      } else {
        Cairn.toast('Failed: ' + (result ? result.error : 'unknown'));
      }
    } catch (e) {
      Cairn.toast('Error posting comment');
    }
  },

  

  

  truncate(str, max) {
    if (!str || str.length <= max) return str || '';
    return str.slice(0, max) + '…';
  }
};
