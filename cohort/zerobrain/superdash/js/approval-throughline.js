/* Superdash v2 -- Approval Throughline (RFC540 narrow-v1)
 *
 * UXIA-lane impl of RFC540 (ratified). Surfaces per-RFC OPERATOR approval
 * state IN the ACTIVE RFCS card (NOT a separate panel). Fold-rule operates
 * on approval_events. API endpoint may not yet exist (sibling tasks
 * rfc540-schema/rfc540-tool deferred per RFC414 P1 "let n=1 finish before
 * n=2 lands") -- this module degrades to mock-data + ratify_at fallback
 * until real events land.
 *
 * Falsifiability primitive (load-bearing, from solidplan):
 *   "A PM reading the throughline can answer 'is X approved within this
 *    RFC's scope' without routing to OPERATOR -- in <=30s, with click-
 *    through to source evidence for each approval-event."
 *
 * Fold-rule (5-step, from solidplan):
 *   1. Ratify event absent -> '*' (unapproved)
 *   2. Apply events in order to {approved, qualifiers, scope_excludes}
 *   3. Most-recent revoke OR scope-narrowing -> 'warn' glyph
 *   4. Else qualifiers.length > 0 -> 'qualified' (green with superscript)
 *   5. Else -> 'approved' (plain green)
 */

var ApprovalThroughline = {
  _cache: {},          // rfc_id -> {events: [...], cachedAt: ms}
  _inheritanceCache: {}, // RFC540p2 followup-7b: rfc_id -> {data: {parent_rfc_id, parent_inheritance_state, inherited_targeting_events}, cachedAt: ms}
  _cacheTtlMs: 30000,  // 30s
  _pending: null,      // in-flight fetch promise
  _apiAvailable: null, // null=unknown, true/false after first probe

  /* ---------- MOCK DATA (used until /api/cairn/approval_events lands) ----------
   * Hand-curated against current in-flight RFCs to make the UI demonstrable
   * pre-API-landing. Remove when API_AVAILABLE flips true.
   */
  MOCK: {
    'RFC540': [
      {
        id: 1, rfc_id: 'RFC540', ts: '2026-06-06T02:07:00Z',
        event_type: 'ratify', source_kind: 'ratify', source_msg_id: null,
        qualifier_text: 'Narrow-v1 (OPERATOR-approval-axis only) ratified per audit chain.',
        scope_delta_json: null, author: 'OPERATOR', is_revocation: false, qualifier_idx: 0
      }
    ],
    'RFC414': [
      {
        id: 2, rfc_id: 'RFC414', ts: '2026-06-06T01:48:00Z',
        event_type: 'ratify', source_kind: 'ratify', source_msg_id: 2488,
        qualifier_text: 'RFC414 ratified via audit 2488. UXIA P4 folded into P2 mechanism.',
        scope_delta_json: null, author: 'OPERATOR', is_revocation: false, qualifier_idx: 0
      },
      {
        id: 3, rfc_id: 'RFC414', ts: '2026-06-06T01:58:00Z',
        event_type: 'qualifier_add', source_kind: 'operator_direct', source_msg_id: 2490,
        qualifier_text: 'P4 measurement-default subsumed into P2 (correct subsumption per OPERATOR).',
        scope_delta_json: null, author: 'OPERATOR', is_revocation: false, qualifier_idx: 1
      }
    ]
  },

  /* RFC540p2 followup-7b: mock inheritance data for known RFCs.
   * Hand-curated to make cross-RFC chip rendering demonstrable pre-API-deploy.
   * Removed once /api/cairn/approval_events?include_inheritance=1 is live and
   * cohort confirms graph populated via item-2 wire + 7c backfill. */
  MOCK_INHERITANCE: {
    'RFC540p2': {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: true,
        parent_has_events: true,
        parent_active_qualifiers_count: 1,
        parent_qualifier_summary: '1 active qualifier (narrow->RFC540p2)',
        advisory_only: true
      },
      inherited_targeting_events: [
        {
          event_type: 'qualifier_add',
          scope_delta_json: { scope_op: 'narrow', target: { kind: 'rfc', id: 'RFC540p2' } },
          is_currently_effective: true,
          is_revocation: false,
          author: 'TEMPO',
          ts: '2026-06-06T17:50:00Z'
        }
      ]
    },
    'RFC540p3': {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: true,
        parent_has_events: true,
        parent_active_qualifiers_count: 1,
        parent_qualifier_summary: '1 active qualifier (narrow->RFC540p3)',
        advisory_only: true
      },
      inherited_targeting_events: [
        {
          event_type: 'qualifier_add',
          scope_delta_json: { scope_op: 'narrow', target: { kind: 'rfc', id: 'RFC540p3' } },
          is_currently_effective: true,
          is_revocation: false,
          author: 'TEMPO',
          ts: '2026-06-06T18:30:00Z'
        }
      ]
    }
  },

  /* fold(events) -> {glyph, state, color, tooltip, qualifierCount}
   * Pure function over chronologically-ordered events. */
  fold: function(events) {
    if (!events || !events.length) {
      return { glyph: '*', state: 'unapproved', color: 'var(--text-tertiary)',
               tooltip: 'No approval events recorded', qualifierCount: 0 };
    }

    // Ensure chronological order (defensive; API contract says ts ASC).
    var sorted = events.slice().sort(function(a, b) {
      return (new Date(a.ts).getTime()) - (new Date(b.ts).getTime());
    });

    var approved = false;
    var qualifiers = [];
    var scopeExcludes = [];
    var lastRatifyTs = null;
    var hasRevocation = false;
    var hasScopeNarrow = false;
    var lastEventDesc = '';

    sorted.forEach(function(e) {
      var t = e.event_type;
      if (t === 'ratify') {
        approved = true;
        lastRatifyTs = e.ts;
        hasRevocation = false; // re-ratify clears revocation
      } else if (t === 'qualifier_add' || t === 'approve_conditional') {
        qualifiers.push(e);
        var sd = e.scope_delta_json;
        if (sd) {
          try { var parsed = typeof sd === 'string' ? JSON.parse(sd) : sd;
                if (parsed && parsed.scope_op === 'narrow') hasScopeNarrow = true;
                if (parsed && parsed.scope_op === 'exclude') scopeExcludes.push(parsed.target);
          } catch(err) {}
        }
      } else if (t === 'revoke') {
        hasRevocation = true;
      } else if (t === 'defer') {
        // defer is advisory; UI surfaces in tooltip but doesn't change glyph alone
      }
      lastEventDesc = t;
    });

    // Step 1: ratify absent -> unapproved
    if (!approved) {
      return { glyph: '*', state: 'unapproved', color: 'var(--text-tertiary)',
               tooltip: 'Not yet ratified (' + sorted.length + ' pre-event' +
                        (sorted.length === 1 ? '' : 's') + ')',
               qualifierCount: 0 };
    }

    // Step 3: revoke or scope-narrow -> warn
    if (hasRevocation || hasScopeNarrow) {
      return { glyph: '\u26A0', state: 'warn', color: 'var(--warning)',
               tooltip: 'Ratified ' + ApprovalThroughline._timeAgo(lastRatifyTs) +
                        '; ' + (hasRevocation ? 'REVOKED' : 'scope narrowed') +
                        '; ' + qualifiers.length + ' qualifier' +
                        (qualifiers.length === 1 ? '' : 's'),
               qualifierCount: qualifiers.length };
    }

    // Step 4: qualifiers -> ratified-with-N
    if (qualifiers.length > 0) {
      return { glyph: '\u2713', state: 'qualified', color: 'var(--success)',
               tooltip: 'Ratified ' + ApprovalThroughline._timeAgo(lastRatifyTs) +
                        '; ' + qualifiers.length + ' qualifier' +
                        (qualifiers.length === 1 ? '' : 's'),
               qualifierCount: qualifiers.length };
    }

    // Step 5: clean ratify
    return { glyph: '\u2713', state: 'approved', color: 'var(--success)',
             tooltip: 'Ratified ' + ApprovalThroughline._timeAgo(lastRatifyTs) +
                      '; no qualifiers',
             qualifierCount: 0 };
  },

  /* Render the header glyph as HTML (safe to inject). */
  glyphHtml: function(rfcId, foldResult) {
    var supScript = foldResult.qualifierCount > 0 ?
      '<sup class="approval-glyph-sup">' + foldResult.qualifierCount + '</sup>' : '';
    return '<span class="approval-glyph approval-glyph-' + foldResult.state + '"' +
           ' data-rfc="' + ApprovalThroughline._esc(rfcId) + '"' +
           ' title="' + ApprovalThroughline._esc(foldResult.tooltip) + '"' +
           ' role="button" aria-label="Approval throughline for ' +
           ApprovalThroughline._esc(rfcId) + ': ' +
           ApprovalThroughline._esc(foldResult.tooltip) + '"' +
           '>' + foldResult.glyph + supScript + '</span>';
  },

  /* Render expanded throughline thread into a container element.
   *
   * Optional 4th arg `inheritance` is the per-RFC enrichment shape from
   * /api/cairn/approval_events?include_inheritance=1:
   *   { parent_rfc_id, parent_inheritance_state, inherited_targeting_events }
   * When provided, an inheritance chip row is rendered alongside the
   * existing scope chip row. Backward-compatible: undefined/null skips it.
   */
  renderExpanded: function(rfcId, events, container, inheritance) {
    if (!container) return;
    if (!events || !events.length) {
      container.innerHTML = '<div class="throughline-empty">No approval events recorded for ' +
                            ApprovalThroughline._esc(rfcId) + '. Ratify or add qualifier to start the thread.</div>';
      return;
    }
    var sorted = events.slice().sort(function(a, b) {
      return (new Date(a.ts).getTime()) - (new Date(b.ts).getTime());
    });
    var html = '<div class="throughline-thread">';
    sorted.forEach(function(e) {
      var glyph = ApprovalThroughline._eventGlyph(e.event_type);
      var linkUrl = ApprovalThroughline._sourceUrl(e);
      var linkChar = linkUrl ? '\u21AA' : '\u00B7'; // hookarrow or middot
      html += '<div class="throughline-event throughline-event-' +
              ApprovalThroughline._esc(e.event_type) + '">';
      html += '<span class="throughline-ts">' + ApprovalThroughline._fmtTs(e.ts) + '</span>';
      html += '<span class="throughline-eg">' + glyph + '</span>';
      html += '<span class="throughline-author">@' + ApprovalThroughline._esc(e.author) + '</span>';
      html += '<span class="throughline-ctx">' +
              ApprovalThroughline._esc(e.qualifier_text || e.event_type) + '</span>';
      if (linkUrl) {
        html += '<a class="throughline-link" href="' + ApprovalThroughline._esc(linkUrl) +
                '" title="Open source evidence" aria-label="Open source evidence">' + linkChar + '</a>';
      } else {
        html += '<span class="throughline-link throughline-link-none" title="No source link">' + linkChar + '</span>';
      }
      html += '</div>';
    });
    html += '</div>';
    // RFC540p2 followup-7b: inheritance chip row (cross-RFC conflict-loud)
    var inhHtml = ApprovalThroughline.renderInheritanceChips(rfcId, inheritance);
    if (inhHtml) html += inhHtml;
    // Chip row (scope-graph outline placeholder until inheritance lane lands)
    html += '<div class="throughline-chips">';
    html += '<span class="throughline-chip" title="Scope: tasks with ref_rfc_id=' +
            ApprovalThroughline._esc(rfcId) + ' (count pending API)">' +
            '\uFF3B tasks \uFF3D</span>';
    html += '<span class="throughline-chip" title="Scope: child-RFCs with parent_rfc=' +
            ApprovalThroughline._esc(rfcId) + ' (count pending API)">' +
            '\uFF3B child-RFCs \uFF3D</span>';
    html += '</div>';
    container.innerHTML = html;
  },

  /* RFC540p2 followup-7b: render cross-RFC inheritance chips per rev-2 §appendix.
   *
   * Pure function -- returns HTML string (or '' when no inheritance to surface).
   * Consumes the per-RFC enrichment shape from include_inheritance=1:
   *   {
   *     parent_rfc_id: string|null,
   *     parent_inheritance_state: {
   *       // sub-case (a) base/patch fields:
   *       parent_has_own_ratify, parent_has_events,
   *       parent_active_qualifiers_count, parent_qualifier_summary,
   *       advisory_only,
   *       // OR sub-case (c) expansion fields:
   *       inheritance_blocked, inheritance_blocked_reason,
   *       override_reason, parent_rfc_id_present
   *     } | null,
   *     inherited_targeting_events: [{event_type, scope_delta_json,
   *       is_currently_effective, is_revocation, ...}, ...]
   *   }
   *
   * Renders one chip per surfaced inheritance signal, sorted by severity:
   *   1. expansion `inheritance_blocked: true`            -> RED   "blocked"
   *   2. expansion `override_reason: <reason>`            -> BLUE  "override: <reason>"
   *   3. each currently-effective inherited revoke        -> RED   "inherited revoke"
   *   4. each currently-effective inherited scope_narrow  -> ORANGE "inherited narrow"
   *   5. parent_active_qualifiers > 0 (NOT advisory)      -> AMBER "N parent qualifier(s)"
   *   6. parent_active_qualifiers > 0 (advisory_only)     -> MUTED "N parent qualifier(s) (advisory)"
   *
   * Inputs:
   *   rfcId        -- string, the RFC whose row this renders
   *   inheritance  -- object|null|undefined per shape above
   *
   * Returns:
   *   HTML string for a <div class="throughline-chips throughline-chips-inheritance">
   *   wrapper containing 0+ chips, OR '' when there is nothing to render
   *   (no inheritance data, no surfaced signals).
   */
  renderInheritanceChips: function(rfcId, inheritance) {
    if (!inheritance) return '';
    var chips = [];
    var state = inheritance.parent_inheritance_state || null;
    var inherited = inheritance.inherited_targeting_events || [];

    // Sub-case (c): expansion-child blocked or overridden.
    if (state && Object.prototype.hasOwnProperty.call(state, 'inheritance_blocked')) {
      if (state.inheritance_blocked === true) {
        chips.push({
          severity: 'blocked',
          glyph: '\u26D4',  // no-entry
          label: 'inheritance blocked',
          tooltip: state.inheritance_blocked_reason ||
                   'Expansion child does not auto-inherit parent ratify'
        });
      } else if (state.override_reason) {
        var overrideLabel = state.override_reason === 'child_own_ratify' ?
              'override: child has own ratify' :
              state.override_reason === 'parent_extend_targeting_child' ?
              'override: parent extend qualifier' :
              'override: ' + state.override_reason;
        chips.push({
          severity: 'override',
          glyph: '\u21B3',  // downwards-arrow-with-tip-rightwards
          label: overrideLabel,
          tooltip: 'Expansion-child inheritance bypassed via ' + state.override_reason
        });
      }
    }

    // Sub-case (b): inherited targeting events (revokes + scope_narrow ops).
    inherited.forEach(function(e) {
      if (!e || !e.is_currently_effective) return;
      var parentLabel = inheritance.parent_rfc_id || '?';
      var isRevoke = e.event_type === 'revoke' || e.is_revocation === true;
      if (isRevoke) {
        chips.push({
          severity: 'revoke',
          glyph: '\u00D7',  // multiplication sign
          label: 'inherited revoke',
          tooltip: 'Parent ' + parentLabel +
                   ' has currently-effective revoke targeting ' + rfcId
        });
        return;
      }
      var op = ApprovalThroughline._inhScopeOp(e.scope_delta_json);
      if (op === 'narrow') {
        chips.push({
          severity: 'narrow',
          glyph: '\u26A0',  // warning sign
          label: 'inherited narrow',
          tooltip: 'Parent ' + parentLabel +
                   ' has currently-effective scope_narrow targeting ' + rfcId
        });
      } else if (op === 'exclude') {
        chips.push({
          severity: 'narrow',
          glyph: '\u26A0',
          label: 'inherited exclude',
          tooltip: 'Parent ' + parentLabel +
                   ' has currently-effective scope_exclude targeting ' + rfcId
        });
      }
    });

    // Sub-case (a): base/patch child with parent active-qualifier count.
    if (state && Object.prototype.hasOwnProperty.call(state, 'parent_active_qualifiers_count')) {
      var count = state.parent_active_qualifiers_count || 0;
      if (count > 0) {
        var advisory = state.advisory_only === true;
        var summary = state.parent_qualifier_summary || (count + ' active qualifier' + (count === 1 ? '' : 's'));
        if (advisory) {
          chips.push({
            severity: 'advisory',
            glyph: '\u24D8',  // circled latin small letter i
            label: count + ' parent qualifier' + (count === 1 ? '' : 's') + ' (advisory)',
            tooltip: 'Parent ' + (inheritance.parent_rfc_id || '?') + ' state: ' + summary +
                     '. Advisory only -- child has its own ratify.'
          });
        } else {
          chips.push({
            severity: 'qualifier',
            glyph: '\u26A0',
            label: count + ' parent qualifier' + (count === 1 ? '' : 's'),
            tooltip: 'Parent ' + (inheritance.parent_rfc_id || '?') + ' state: ' + summary +
                     '. Load-bearing -- child has no own ratify.'
          });
        }
      }
    }

    if (!chips.length) return '';

    var html = '<div class="throughline-chips throughline-chips-inheritance"' +
               ' data-inheritance-for="' + ApprovalThroughline._esc(rfcId) + '">';
    chips.forEach(function(c) {
      html += '<span class="throughline-chip throughline-chip-inh throughline-chip-inh-' +
              ApprovalThroughline._esc(c.severity) + '"' +
              ' title="' + ApprovalThroughline._esc(c.tooltip) + '"' +
              ' aria-label="' + ApprovalThroughline._esc(c.label) + '">' +
              '<span class="throughline-chip-glyph" aria-hidden="true">' + c.glyph + '</span> ' +
              ApprovalThroughline._esc(c.label) +
              '</span>';
    });
    html += '</div>';
    return html;
  },

  _inhScopeOp: function(scopeDeltaJson) {
    if (!scopeDeltaJson) return null;
    var sd = scopeDeltaJson;
    if (typeof sd === 'string') {
      try { sd = JSON.parse(sd); } catch (e) { return null; }
    }
    return (sd && sd.scope_op) || null;
  },

  /* fetchEvents(rfcIds, cb) -> cb({rfc_id: [events]})
   * Graceful fallback: if API returns null (404 / not yet implemented),
   * uses MOCK data for known RFCs, returns empty for others. */
  fetchEvents: function(rfcIds, cb) {
    if (!rfcIds || !rfcIds.length) { cb({}); return; }

    // Cache hit short-circuit
    var now = Date.now();
    var allCached = rfcIds.every(function(id) {
      var c = ApprovalThroughline._cache[id];
      return c && (now - c.cachedAt) < ApprovalThroughline._cacheTtlMs;
    });
    if (allCached) {
      var out = {};
      rfcIds.forEach(function(id) { out[id] = ApprovalThroughline._cache[id].events; });
      cb(out);
      return;
    }

    var endpoint = '/api/cairn/approval_events?rfc_ids=' +
                   encodeURIComponent(rfcIds.join(','));
    if (typeof API === 'undefined' || !API.get) {
      ApprovalThroughline._applyFallback(rfcIds, cb);
      return;
    }
    API.get(endpoint).then(function(resp) {
      if (!resp || resp.error) {
        ApprovalThroughline._apiAvailable = false;
        ApprovalThroughline._applyFallback(rfcIds, cb);
        return;
      }
      ApprovalThroughline._apiAvailable = true;
      var byRfc = resp.events_by_rfc || {};
      var out = {};
      rfcIds.forEach(function(id) {
        var events = byRfc[id] || [];
        ApprovalThroughline._cache[id] = { events: events, cachedAt: now };
        out[id] = events;
      });
      cb(out);
    }).catch(function() {
      ApprovalThroughline._apiAvailable = false;
      ApprovalThroughline._applyFallback(rfcIds, cb);
    });
  },

  /* RFC540p2 followup-7b: fetchEventsWithInheritance(rfcIds, cb)
   *  cb({ events: {rfc_id: [...]}, inheritance: {rfc_id: {...}} })
   *
   * Hits /api/cairn/approval_events?rfc_ids=...&include_inheritance=1 and
   * parses the grouped {rfcs:{<id>:{events, parent_rfc_id,
   * parent_inheritance_state, inherited_targeting_events}}, count:N} shape.
   * Caches events to _cache (shared with fetchEvents) and inheritance to
   * _inheritanceCache. Graceful fallback to MOCK + MOCK_INHERITANCE when API
   * returns null / 404 / error.
   */
  fetchEventsWithInheritance: function(rfcIds, cb) {
    if (!rfcIds || !rfcIds.length) { cb({ events: {}, inheritance: {} }); return; }

    var now = Date.now();
    var allCached = rfcIds.every(function(id) {
      var c = ApprovalThroughline._cache[id];
      var ic = ApprovalThroughline._inheritanceCache[id];
      return c && ic && (now - c.cachedAt) < ApprovalThroughline._cacheTtlMs &&
             (now - ic.cachedAt) < ApprovalThroughline._cacheTtlMs;
    });
    if (allCached) {
      var evOut = {}, inhOut = {};
      rfcIds.forEach(function(id) {
        evOut[id] = ApprovalThroughline._cache[id].events;
        inhOut[id] = ApprovalThroughline._inheritanceCache[id].data;
      });
      cb({ events: evOut, inheritance: inhOut });
      return;
    }

    var endpoint = '/api/cairn/approval_events?include_inheritance=1&rfc_ids=' +
                   encodeURIComponent(rfcIds.join(','));
    if (typeof API === 'undefined' || !API.get) {
      ApprovalThroughline._applyInheritanceFallback(rfcIds, cb);
      return;
    }
    API.get(endpoint).then(function(resp) {
      if (!resp || resp.error || !resp.rfcs) {
        ApprovalThroughline._apiAvailable = false;
        ApprovalThroughline._applyInheritanceFallback(rfcIds, cb);
        return;
      }
      ApprovalThroughline._apiAvailable = true;
      var evOut = {}, inhOut = {};
      rfcIds.forEach(function(id) {
        var entry = resp.rfcs[id] || {};
        var events = entry.events || [];
        var inh = {
          parent_rfc_id: entry.parent_rfc_id || null,
          parent_inheritance_state: entry.parent_inheritance_state || null,
          inherited_targeting_events: entry.inherited_targeting_events || []
        };
        ApprovalThroughline._cache[id] = { events: events, cachedAt: now };
        ApprovalThroughline._inheritanceCache[id] = { data: inh, cachedAt: now };
        evOut[id] = events;
        inhOut[id] = inh;
      });
      cb({ events: evOut, inheritance: inhOut });
    }).catch(function() {
      ApprovalThroughline._apiAvailable = false;
      ApprovalThroughline._applyInheritanceFallback(rfcIds, cb);
    });
  },

  _applyInheritanceFallback: function(rfcIds, cb) {
    var evOut = {}, inhOut = {};
    var now = Date.now();
    rfcIds.forEach(function(id) {
      var events = ApprovalThroughline.MOCK[id] || [];
      var inh = ApprovalThroughline.MOCK_INHERITANCE[id] || {
        parent_rfc_id: null, parent_inheritance_state: null,
        inherited_targeting_events: []
      };
      ApprovalThroughline._cache[id] = { events: events, cachedAt: now };
      ApprovalThroughline._inheritanceCache[id] = { data: inh, cachedAt: now };
      evOut[id] = events;
      inhOut[id] = inh;
    });
    cb({ events: evOut, inheritance: inhOut });
  },

  /* Direct accessor for tests/probes -- bypasses cache + fetch */
  _mockFor: function(rfcId) {
    return ApprovalThroughline.MOCK[rfcId] || [];
  },

  _applyFallback: function(rfcIds, cb) {
    var out = {};
    var now = Date.now();
    rfcIds.forEach(function(id) {
      var events = ApprovalThroughline.MOCK[id] || [];
      ApprovalThroughline._cache[id] = { events: events, cachedAt: now };
      out[id] = events;
    });
    cb(out);
  },

  _eventGlyph: function(eventType) {
    var map = {
      ratify: '\u2713',
      approve_conditional: '\u29BE',  // circled bullet
      qualifier_add: '\u002B',         // plus
      revoke: '\u00D7',                // multiplication sign
      defer: '\u2026'                  // ellipsis
    };
    return map[eventType] || '\u2022';
  },

  _sourceUrl: function(e) {
    if (e.source_kind === 'ratify') return '#/audit/ratify/' + encodeURIComponent(e.rfc_id);
    if (e.source_msg_id) return '#/msg/' + encodeURIComponent(e.source_msg_id);
    return null;
  },

  _timeAgo: function(ts) {
    if (!ts) return 'unknown time';
    var now = Date.now();
    var t = new Date(ts).getTime();
    var s = Math.max(0, (now - t) / 1000);
    if (s < 60) return Math.floor(s) + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 14) return Math.floor(s / 86400) + 'd ago';
    return Math.floor(s / (86400 * 7)) + 'w ago';
  },

  _fmtTs: function(ts) {
    if (!ts) return '?';
    try {
      var d = new Date(ts);
      return d.toISOString().slice(5, 16).replace('T', ' ');
    } catch(e) { return ts; }
  },

  _esc: function(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};

// Expose for probe + integration tests
if (typeof window !== 'undefined') window.ApprovalThroughline = ApprovalThroughline;
if (typeof module !== 'undefined' && module.exports) module.exports = ApprovalThroughline;
