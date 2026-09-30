/* Superdash v2 -- Active RFCs Intel Panel
 *
 * STICKY-STATEFUL predicate (OPERATOR 2026-06-06, UXIA-converged with 3
 * clarifications; same shape as main-panel CairnPanel):
 *   entry = rfc.status='ratified' AND ANY task ever referenced this RFC
 *   exit  = rfc.status leaves ratified (e.g., -> shipped)
 * Once promoted into Active, a ratified RFC STAYS visible until ship --
 * does NOT drop off when all referencing tasks happen to complete pre-ship.
 *
 * Data flow:
 *   1. Subscribe to /api/tasks?include_completed=true  (all tasks ever)
 *   2. Subscribe to /api/cairn/filter?status=ratified  (ratified RFCs only)
 *   3. Extract RFC IDs from task_id+title via regex (includes x-suffix)
 *   4. Intersect: render only ratified RFCs with any task reference
 *
 * Prior shape (active-task-only, broader status set) shipped 01:35 PDT --
 * superseded 23:23 PDT for fleet-wide consistency with main panel. The
 * approval-throughline rendering below is preserved (RFC540 lane).
 */

var CairnRecent = {
  _reg: null,
  _tasksData: null,
  _rfcsData: null,
  _approvalEvents: {},   // RFC540: rfc_id -> [events] cache from ApprovalThroughline.fetchEvents
  _approvalInheritance: {},  // RFC540p2 followup-7b: rfc_id -> inheritance metadata for cross-RFC chip render
  _expanded: {},         // RFC540: rfc_id -> bool (which throughlines are expanded)
  // DRAGON 2026-06-06 [extended UXIA 2026-06-10]: `[xpc]\d+` suffix covers
  // x/c first-class + legacy-historical p per rfc-suffix-taxonomy-x-vs-c-vs-swat
  // (xN=expansion, cN=change, pN=retired-historical). Prior `0*(\d+)` shape
  // lost x-suffix entirely; prior `[xp]` missed c-suffix (RFC232c1, RFC497c1).
  _RFC_REGEX: /\bRFC\d{2,4}(?:[xpc]\d+)?\b/gi,

  // SWAT 2026-06-07 (UXIA): meta-density quick wins A/B/C/E/F.
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

  // SWAT 2026-06-09 (UXIA, bundled-quickwin J): surfaces cairn_list_active.vote_tally
  // as colored counts. Ratification-progress signal at a glance (e.g.,
  // RFC017 vote_tally={approve:6} = 6/6 ratification gate met without DM'ing PM).
  // Sub-council Superdash+UX (QUATTRO co-steward) SUPPORT-all on shape: distinct
  // mini-bar from stance-dist, grouped in the lifecycle-progress cluster (adjacent
  // to W-state chip on meta-line). Format: ✓N (approve) / ✗N (reject) / ~N (abstain).
  _voteTallyHtml: function(tally) {
    if (!tally || typeof tally !== 'object') return '';
    var approve = tally.approve || 0;
    var reject = tally.reject || 0;
    var abstain = tally.abstain || 0;
    if (!approve && !reject && !abstain) return '';
    var parts = [];
    if (approve) parts.push('<span style="color:#3fb950">✓' + approve + '</span>');
    if (reject)  parts.push('<span style="color:#f85149">✗' + reject + '</span>');
    if (abstain) parts.push('<span style="color:#8b949e">~' + abstain + '</span>');
    return parts.join('/');
  },

  init: function() {
    if (typeof FleetState === 'undefined') return;
    CairnRecent._reg = Components.registerPanel({
      endpoints: [
        // Use the SHARED registered cairn filter (covers ideation+rfc+in_round+ratified) and
        // client-filter to ratified-only below. Reusing the registered endpoint avoids a second
        // poll stream and dedups with cairn-panel.js. Bug history (2026-06-06, UXIA): previously
        // registered '/api/cairn/filter?status=ratified&limit=50' which was NOT in
        // FleetState.ENDPOINTS, so polling never auto-started and the panel was stuck on Loading.
        '/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30',
        // include_completed=true is required for sticky-stateful: once a task references an RFC,
        // the RFC stays Active until status leaves 'ratified', even after the task moves to done.
        // Registered separately in datastore.js ENDPOINTS so subscribe() auto-starts polling.
        '/api/tasks?include_completed=true'
      ],
      onData: function(data) {
        CairnRecent._rfcsData = data['/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30'];
        CairnRecent._tasksData = data['/api/tasks?include_completed=true'];
        CairnRecent.render();
      }
    });
  },

  // Build set of RFC IDs ever referenced by any task (sticky-stateful entry
  // trigger). Task status NOT filtered -- once a task is sent, the RFC stays
  // Active until status leaves ratified.
  _everReferencedRfcSet: function() {
    var set = {};
    var tasks = (CairnRecent._tasksData && CairnRecent._tasksData.tasks) || [];
    tasks.forEach(function(t) {
      // Space-separated to prevent boundary false-positive (DRAGON note).
      var blob = (t.task_id || '') + ' ' + (t.project || '') + ' ' + (t.title || '');
      var m;
      CairnRecent._RFC_REGEX.lastIndex = 0;
      while ((m = CairnRecent._RFC_REGEX.exec(blob)) !== null) {
        set[m[0].toUpperCase()] = true;
      }
    });
    return set;
  },

  render: function() {
    var el = document.getElementById('cairn-recent');
    if (!el) return;

    var items = (CairnRecent._rfcsData && CairnRecent._rfcsData.items) || [];
    // Ratified-only per sticky-stateful predicate. Coordinator may still
    // return broader rows if the filter param isn't honored, so we re-filter
    // defensively here.
    var ratified = items.filter(function(r) {
      return (r.status || '').toLowerCase() === 'ratified';
    });

    // SWAT 2026-06-08 (UXIA): in_round RFCs are pre-implementation (no task
    // refs yet by definition), so sticky-stateful predicate excludes them.
    // Surface separately as compact "Voting (N)" strip above the Active list
    // -- different semantic class (being-decided vs being-executed). OPERATOR
    // would otherwise click through to the main "Cairn -- RFCs" tab to see
    // currently-voting RFCs, defeating the at-a-glance intel-card purpose.
    var inRound = items.filter(function(r) {
      return (r.status || '').toLowerCase() === 'in_round';
    });
    // Sort voting by updated_at desc -- match Active section convention.
    inRound.sort(function(a, b) {
      return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    });

    // SWAT 2026-06-09 (UXIA, bundled-quickwin I): pre-vote design churn was
    // 100% hidden (only ratified+task-ref and in_round rendered). Surface
    // ideation+rfc-stage RFCs as a compact "Drafting (N)" amber chip-strip
    // above the Voting strip, completing the lifecycle ladder OPERATOR scans:
    //   seed -> [Drafting] (ideation,rfc) -> [Voting] (in_round) -> [Active] (ratified+task-ref) -> shipped
    // Sub-council Superdash+UX (QUATTRO co-steward) SUPPORT on label "Drafting"
    // (gerund-parallel to "Voting") + amber color `#d29922` (re-uses IDEA color
    // for convention-consistency, warm/in-flux semantically distinct from cool/
    // locked-in green Voting).
    var drafting = items.filter(function(r) {
      var s = (r.status || '').toLowerCase();
      return s === 'ideation' || s === 'rfc';
    });
    drafting.sort(function(a, b) {
      return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    });

    if (!CairnRecent._tasksData) {
      el.innerHTML = '<div class="loading-text">Loading...</div>';
      return;
    }
    var refSet = CairnRecent._everReferencedRfcSet();

    var active = ratified.filter(function(r) {
      return refSet[(r.rfc_id || '').toUpperCase()];
    });

    // F: sort by updated_at desc -- newest activity first.
    active.sort(function(a, b) {
      return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    });

    // SWAT 2026-06-09 (UXIA, bundled-quickwin Gap #9): empty-state predicate
    // widened to include drafting. Previously triggered "No active RFCs"
    // message DESPITE fleet activity when no ratified+task-ref RFCs existed,
    // hiding ideation/rfc/in_round-stage churn entirely. Now considers all
    // three render-sections before declaring panel empty.
    if (!active.length && !inRound.length && !drafting.length) {
      el.innerHTML = '<div class="empty-text">No active RFCs (lifecycle: ideation/rfc surface as Drafting, in_round as Voting, ratified+task-ref as Active)</div>';
      return;
    }

    var stageColors = {
      ideation: '#d29922',
      rfc: '#58a6ff',
      in_round: '#3fb950',
      ratified: '#d2a8ff'
    };
    var stageLabels = {
      ideation: 'IDEA',
      rfc: 'RFC',
      in_round: 'VOTING',
      ratified: 'RATIFIED'
    };

    var visible = active.slice(0, 8);
    var rfcIds = visible.map(function(r) { return r.rfc_id || ''; }).filter(Boolean);

    // RFC540: fetch approval events (graceful fallback to mock if API not yet live).
    // RFC540p2 followup-7b: use fetchEventsWithInheritance to also load
    // parent_inheritance_state + inherited_targeting_events for cross-RFC chips.
    if (typeof ApprovalThroughline !== 'undefined') {
      if (typeof ApprovalThroughline.fetchEventsWithInheritance === 'function') {
        ApprovalThroughline.fetchEventsWithInheritance(rfcIds, function(resp) {
          CairnRecent._approvalEvents = (resp && resp.events) || {};
          CairnRecent._approvalInheritance = (resp && resp.inheritance) || {};
          CairnRecent._renderCards(el, visible, inRound, drafting, stageColors, stageLabels);
        });
      } else {
        ApprovalThroughline.fetchEvents(rfcIds, function(byRfc) {
          CairnRecent._approvalEvents = byRfc || {};
          CairnRecent._renderCards(el, visible, inRound, drafting, stageColors, stageLabels);
        });
      }
    } else {
      CairnRecent._renderCards(el, visible, inRound, drafting, stageColors, stageLabels);
    }
  },

  // SWAT 2026-06-09 (UXIA, bundled-quickwin I): "Drafting (N)" compact chip-
  // strip for ideation+rfc-stage RFCs. Amber palette (`#d29922`) mirrors
  // stage IDEA color (warm/in-flux semantics). Mirrors _votingStripHtml shape
  // for visual coherence. Click on chip opens forum (same affordance as Voting).
  _draftingStripHtml: function(drafting) {
    if (!drafting || !drafting.length) return '';
    var chips = drafting.slice(0, 6).map(function(r) {
      var rfcId = r.rfc_id || '';
      var title = r.title || '';
      var stage = (r.status || '').toLowerCase();
      var stageLabel = (stage === 'ideation') ? 'IDEA' : 'RFC';
      var tooltip = rfcId + ' [' + stageLabel + '] -- ' + title;
      return '<span class="cairn-recent-drafting-chip" data-rfc="' + Components.esc(rfcId) +
        '" title="' + Components.esc(tooltip) + '" style="display:inline-block;font-size:11px;padding:2px 7px;margin:0 4px 4px 0;border-radius:3px;background:rgba(210,153,34,0.15);color:#d29922;font-family:JetBrains Mono,monospace;cursor:pointer;border:1px solid rgba(210,153,34,0.3)">' +
        Components.esc(rfcId) + '</span>';
    }).join('');
    var overflow = drafting.length > 6 ? '<span style="font-size:10px;color:var(--text-secondary,#8b949e);margin-left:2px">+' + (drafting.length - 6) + '</span>' : '';
    return '<div class="cairn-recent-drafting" style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(48,54,61,0.5)">' +
      '<div class="cairn-recent-drafting-label" style="font-size:10px;color:var(--text-secondary,#8b949e);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Drafting (' + drafting.length + ')</div>' +
      chips + overflow + '</div>';
  },

  _votingStripHtml: function(inRound) {
    if (!inRound || !inRound.length) return '';
    var chips = inRound.slice(0, 6).map(function(r) {
      var rfcId = r.rfc_id || '';
      var title = r.title || '';
      var waves = r.wave_count || 0;
      var responses = r.response_count || 0;
      var tooltip = rfcId + ' -- ' + title + ' (' + waves + 'w / ' + responses + 'r)';
      return '<span class="cairn-recent-voting-chip" data-rfc="' + Components.esc(rfcId) +
        '" title="' + Components.esc(tooltip) + '" style="display:inline-block;font-size:11px;padding:2px 7px;margin:0 4px 4px 0;border-radius:3px;background:rgba(63,185,113,0.15);color:#3fb950;font-family:JetBrains Mono,monospace;cursor:pointer;border:1px solid rgba(63,185,113,0.3)">' +
        Components.esc(rfcId) + '</span>';
    }).join('');
    var overflow = inRound.length > 6 ? '<span style="font-size:10px;color:var(--text-secondary,#8b949e);margin-left:2px">+' + (inRound.length - 6) + '</span>' : '';
    return '<div class="cairn-recent-voting" style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(48,54,61,0.5)">' +
      '<div class="cairn-recent-voting-label" style="font-size:10px;color:var(--text-secondary,#8b949e);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Voting (' + inRound.length + ')</div>' +
      chips + overflow + '</div>';
  },

  _renderCards: function(el, visible, inRound, drafting, stageColors, stageLabels) {
    var html = CairnRecent._draftingStripHtml(drafting);
    html += CairnRecent._votingStripHtml(inRound);
    visible.forEach(function(rfc) {
      var color = stageColors[rfc.status] || '#8b949e';
      var label = stageLabels[rfc.status] || rfc.status;
      var waves = rfc.wave_count || 0;
      var responses = rfc.response_count || 0;
      var rfcId = rfc.rfc_id || '';

      // RFC540: compute approval glyph via fold-rule on events (or empty -> '*').
      var events = CairnRecent._approvalEvents[rfcId] || [];
      var glyphHtml = '';
      if (typeof ApprovalThroughline !== 'undefined') {
        var fold = ApprovalThroughline.fold(events);
        glyphHtml = ApprovalThroughline.glyphHtml(rfcId, fold);
      }

      var isExpanded = !!CairnRecent._expanded[rfcId];

      html += '<div class="cairn-recent-item" data-rfc="' + Components.esc(rfcId) + '">';
      html += '<div class="cairn-recent-header">';
      html += glyphHtml;
      html += '<span class="cairn-recent-stage" style="color:' + color + '">' + label + '</span>';
      html += '<span class="cairn-recent-id">' + Components.esc(rfcId) + '</span>';
      // B: revision chip (only when >1 -- r1 is noise).
      if (rfc.revision && rfc.revision > 1) {
        html += '<span class="cairn-recent-rev" title="solidplan revision" style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(210,168,255,0.18);color:#d2a8ff;font-family:JetBrains Mono,monospace;margin-left:4px">r' + rfc.revision + '</span>';
      }
      // E: category badge (A/B/C from RFC157 taxonomy).
      if (rfc.category) {
        html += '<span class="cairn-recent-cat" title="category" style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(210,153,34,0.2);color:#d29922;font-weight:600;margin-left:4px">' + Components.esc(rfc.category) + '</span>';
      }
      // SWAT 2026-06-09 (UXIA, bundled-quickwin L): domain badge alongside
      // category badge (same row, both taxonomy-style metadata per Superdash+UX
      // sub-council QUATTRO co-steward call: category = type-axis, domain =
      // subject-axis; group together as chip-row pattern).
      if (rfc.domain) {
        html += '<span class="cairn-recent-domain" title="domain" style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(88,166,255,0.15);color:#58a6ff;font-family:JetBrains Mono,monospace;margin-left:4px">' + Components.esc(rfc.domain) + '</span>';
      }
      html += '</div>';
      html += '<div class="cairn-recent-title" data-open-forum="1">' + Components.esc(rfc.title || '') + '</div>';
      html += '<div class="cairn-recent-meta">';
      // SWAT 2026-06-08 (UXIA, wave-state-breakout, bundled with NIMBUS coord
      // SQL): when latest_wave_status + latest_wave_round_num both present
      // (NULL on seed-stage RFCs with no waves), render "W{N} {status}" chip
      // in place of the bare "Xw / Xr" total. Three states: open=green,
      // synthesized=purple, closed=muted. Preserves existing total as fallback
      // when fields absent (backward-compat with pre-coord-deploy payload).
      var lws = rfc.latest_wave_status;
      var lwn = rfc.latest_wave_round_num;
      if (lws && lwn) {
        var waveStateColor = (lws === 'open') ? '#3fb950'
                           : (lws === 'synthesized') ? '#d2a8ff'
                           : '#8b949e';
        html += '<span class="cairn-recent-wavestate" title="latest wave: round ' + lwn + ', status ' + lws + '" style="color:' + waveStateColor + ';font-family:JetBrains Mono,monospace">W' + lwn + ' ' + lws + '</span>';
        html += '<span style="color:var(--text-secondary,#8b949e);font-size:10px"> · ' + responses + 'r' + (waves > 1 ? ' / ' + waves + 'w' : '') + '</span>';
      } else {
        html += '<span>' + waves + 'w / ' + responses + 'r</span>';
      }
      // C: stance distribution mini-bar (compact).
      var stanceTxt = CairnRecent._stanceDistHtml(rfc.responders);
      if (stanceTxt) {
        html += '<span class="cairn-recent-stances" title="stance distribution">' + stanceTxt + '</span>';
      }
      // SWAT 2026-06-09 (UXIA, bundled-quickwin J): vote_tally ratification-
      // progress chip. Distinct from stance-dist (qualitative wave-response
      // positions) per Superdash+UX sub-council QUATTRO co-steward call:
      // vote_tally = quantitative ratification count (approve/reject/abstain).
      // Placed adjacent to W-state in lifecycle-progress cluster; renders only
      // when tally non-empty (most ratified RFCs have vote tallies).
      var voteTxt = CairnRecent._voteTallyHtml(rfc.vote_tally);
      if (voteTxt) {
        html += '<span class="cairn-recent-vote" title="vote tally" style="font-family:JetBrains Mono,monospace;margin-left:6px">' + voteTxt + '</span>';
      }
      // SWAT 2026-06-09 (UXIA, bundled-quickwin K): council_firing_count chip.
      // High-signal liveness marker per Superdash+UX sub-council QUATTRO co-
      // steward call: `C{N}` minimal-form (scales semantically with count,
      // colorblind/accessibility-friendly vs emoji-based alternatives).
      // Renders only when count > 0.
      var cfc = rfc.council_firing_count || 0;
      if (cfc > 0) {
        html += '<span class="cairn-recent-council" title="' + cfc + ' council firing(s)" style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(210,168,255,0.15);color:#d2a8ff;font-family:JetBrains Mono,monospace;margin-left:6px">C' + cfc + '</span>';
      }
      // A: relative updated_at -- newest activity signal at a glance.
      var rel = CairnRecent._relTime(rfc.updated_at);
      if (rel) {
        html += '<span class="cairn-recent-updated" title="' + Components.esc(rfc.updated_at || '') + '" style="color:var(--text-secondary,#8b949e)">⏱ ' + rel + '</span>';
      }
      html += '<span class="cairn-recent-author">@' + Components.esc(rfc.author_id || '') + '</span>';
      html += '</div>';
      html += '<div class="cairn-recent-throughline" data-throughline-for="' +
              Components.esc(rfcId) + '"' + (isExpanded ? '' : ' hidden') + '></div>';
      html += '</div>';
    });

    el.innerHTML = html;

    // Approval-glyph click -> toggle expand throughline (NOT open forum).
    el.querySelectorAll('.approval-glyph[data-rfc]').forEach(function(g) {
      g.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var rfcId = g.getAttribute('data-rfc');
        CairnRecent._toggleThroughline(rfcId);
      });
    });

    // Title (or anywhere else in card not glyph/throughline) -> open forum.
    el.querySelectorAll('.cairn-recent-item[data-rfc]').forEach(function(item) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function(ev) {
        if (ev.target.closest('.approval-glyph')) return;
        if (ev.target.closest('.cairn-recent-throughline')) return;
        var rfcId = item.getAttribute('data-rfc');
        if (rfcId && typeof Cairn !== 'undefined' && Cairn.toggle && Cairn.loadForum) {
          Cairn.toggle();
          Cairn.loadForum(rfcId);
        }
      });
    });

    // Voting chip click -> open forum (same as Active card title click).
    el.querySelectorAll('.cairn-recent-voting-chip[data-rfc]').forEach(function(chip) {
      chip.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var rfcId = chip.getAttribute('data-rfc');
        if (rfcId && typeof Cairn !== 'undefined' && Cairn.toggle && Cairn.loadForum) {
          Cairn.toggle();
          Cairn.loadForum(rfcId);
        }
      });
    });

    // SWAT 2026-06-09 (UXIA, bundled-quickwin I): Drafting chip click -> open
    // forum (mirrors Voting-chip affordance).
    el.querySelectorAll('.cairn-recent-drafting-chip[data-rfc]').forEach(function(chip) {
      chip.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var rfcId = chip.getAttribute('data-rfc');
        if (rfcId && typeof Cairn !== 'undefined' && Cairn.toggle && Cairn.loadForum) {
          Cairn.toggle();
          Cairn.loadForum(rfcId);
        }
      });
    });

    // Render any throughlines that should be visible.
    Object.keys(CairnRecent._expanded).forEach(function(rfcId) {
      if (CairnRecent._expanded[rfcId]) CairnRecent._renderThroughline(rfcId);
    });
  },

  _toggleThroughline: function(rfcId) {
    CairnRecent._expanded[rfcId] = !CairnRecent._expanded[rfcId];
    var container = document.querySelector(
      '.cairn-recent-throughline[data-throughline-for="' + rfcId + '"]');
    if (!container) return;
    if (CairnRecent._expanded[rfcId]) {
      container.removeAttribute('hidden');
      CairnRecent._renderThroughline(rfcId);
    } else {
      container.setAttribute('hidden', 'hidden');
      container.innerHTML = '';
    }
  },

  _renderThroughline: function(rfcId) {
    var container = document.querySelector(
      '.cairn-recent-throughline[data-throughline-for="' + rfcId + '"]');
    if (!container) return;
    var events = CairnRecent._approvalEvents[rfcId] || [];
    var inheritance = CairnRecent._approvalInheritance[rfcId] || null;
    if (typeof ApprovalThroughline !== 'undefined') {
      ApprovalThroughline.renderExpanded(rfcId, events, container, inheritance);
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', CairnRecent.init);
} else {
  CairnRecent.init();
}
