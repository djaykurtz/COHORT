/* B4 Phase Vocab + Render Helpers (RFC587-B4 render-axis)
 *
 * Design spec: cairn scratch 06110606UXIA-rfc587-b4-design-v (v2.2)
 *              cairn scratch 06110552UXIA-rfc587-b4-design-v2-1-tri-axis (v2.1 D)
 * Impl plan:   cairn scratch 06111350UXIA-rfc587-b4-implplan-v0 (Batch-1, -2)
 *
 * AC-B4.10  PHASE_LABELS const decoupling (DRAGON altitude-flag 5)
 * AC-B4.7   10-token strict-vocab + client-side console.warn
 *           (server silent-exclusion in get_resilience_incidents is SoT;
 *            client warn is defense-in-depth dev-only signal)
 * AC-B4.4   Border-convention RED-solid/YELLOW-dashed/GREEN-dotted
 *           (PHASE_TIER map + phaseTierClass helper; CSS in
 *           css/phase-badge.css)
 * AC-B4.9   MOLT-ABORTED dedicated render + retry-molt action affordance
 *           (renderMoltAbortedBadge -- molt-glyph + retry button with
 *           data-action="retry-molt" + data-node-id; consumer wires click)
 *
 * AC-B4.2 IS NOT IN THIS MODULE: B4.2 is FK-rollup data-source precedence
 * (cairn-board.js trail rollup).
 */
(function() {
  'use strict';

  // --- B4.10: PHASE_LABELS const (single source of truth for display labels) ---
  // Token keys are CONTRACT (must match coord-side resilience event emitter
  // schema in get_resilience_incidents); values are DISPLAY labels (mutable
  // here without touching contract or render call-sites).
  var PHASE_LABELS = {
    HEALTHY:     'HEALTHY',
    WATCH:       'WATCH',
    DEGRADED:    'DEGRADED',
    SLOW_BOOT:   'SLOW BOOT',
    FLAG_DRIFT:  'FLAG DRIFT',
    MOLT_FAILED: 'MOLT-ABORTED',
    AUTH_WALL:   'AUTH WALL',
    BRICKED:     'BRICKED',
    DOUBLE_BOOT: 'DOUBLE BOOT',
    AUDIT_ACK:   'AUDIT ACK'
  };

  // Canonical token list (10-token strict-vocab union per AC-B4.7).
  // Frozen to detect accidental mutation in dev. Order matches PHASE_LABELS
  // declaration above.
  var B4_PHASE_VOCAB = Object.freeze([
    'HEALTHY', 'WATCH', 'DEGRADED', 'SLOW_BOOT', 'FLAG_DRIFT',
    'MOLT_FAILED', 'AUTH_WALL', 'BRICKED', 'DOUBLE_BOOT', 'AUDIT_ACK'
  ]);

  // --- B4.4: tier mapping for border-convention (red/yellow/green) ---
  // Mirrors css/phase-badge.css. Single source of truth for which phases
  // get which border style. RED = operator-actionable, YELLOW = degraded
  // but self-healing-possible, GREEN = nominal.
  var PHASE_TIER = Object.freeze({
    BRICKED:     'red',
    MOLT_FAILED: 'red',
    AUTH_WALL:   'red',
    DOUBLE_BOOT: 'red',
    DEGRADED:    'yellow',
    FLAG_DRIFT:  'yellow',
    SLOW_BOOT:   'yellow',
    AUDIT_ACK:   'yellow',
    HEALTHY:     'green',
    WATCH:       'green'
  });

  function phaseTierClass(token) {
    var tier = PHASE_TIER[token];
    return tier ? ('phase-badge--' + tier) : 'phase-badge--yellow';
  }

  // --- B4.7: client-side defense-in-depth warn (dev signal only) ---
  // Server-side silent-exclusion in get_resilience_incidents is the SoT;
  // this warn surfaces vocab-drift to dev consoles without blocking render.
  // Caller decides fallback render token (typically the raw token string
  // pass-through). We don't throw.
  function _isKnownToken(token) {
    return Object.prototype.hasOwnProperty.call(PHASE_LABELS, token);
  }

  function renderPhaseLabel(token) {
    if (_isKnownToken(token)) return PHASE_LABELS[token];
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[B4.7] out-of-vocab phase token: ' + JSON.stringify(token) +
        ' (expected one of ' + B4_PHASE_VOCAB.join(',') + '). ' +
        'Server-side silent-exclusion is SoT; raw token passed through.'
      );
    }
    return String(token == null ? '' : token);
  }

  // --- B4.9: MOLT-ABORTED dedicated render + retry-molt action affordance ---
  // Returns an HTML string for a phase-badge--molt-aborted element. The
  // retry button carries data-action="retry-molt" + data-node-id; consumer
  // code wires the click handler against the coord MOLT-request API. The
  // button is rendered disabled if `retryDisabled` truthy (e.g., a retry
  // is already in-flight or the node lacks retry-eligibility per backend).
  //
  // Standalone single-MOLT_FAILED badge. The general renderPhaseBadge()
  // below handles the non-MOLT_FAILED tokens via phaseTierClass().
  function renderMoltAbortedBadge(nodeId, opts) {
    opts = opts || {};
    var label = PHASE_LABELS.MOLT_FAILED;  // 'MOLT-ABORTED' per B4.10 const
    var disabled = opts.retryDisabled ? ' disabled' : '';
    var safeNode = String(nodeId == null ? '' : nodeId).replace(/[^A-Za-z0-9_\-]/g, '');
    return (
      '<span class="phase-badge phase-badge--red phase-badge--molt-aborted">' +
        '<span class="phase-badge-glyph" aria-hidden="true">⎌</span>' +
        '<span class="phase-badge-label">' + label + '</span>' +
        '<button type="button" class="phase-retry-action" ' +
          'data-action="retry-molt" data-node-id="' + safeNode + '"' + disabled + '>' +
          'RETRY MOLT' +
        '</button>' +
      '</span>'
    );
  }

  // General phase-badge renderer (non-MOLT_FAILED). Uses PHASE_TIER
  // for border-convention class + PHASE_LABELS for display text.
  // Caller is responsible for HTML-escaping if it injects user data.
  function renderPhaseBadge(token) {
    if (token === 'MOLT_FAILED') return renderMoltAbortedBadge(null, {});
    var cls = phaseTierClass(token);
    var label = renderPhaseLabel(token);
    return (
      '<span class="phase-badge ' + cls + '">' +
        '<span class="phase-badge-label">' + label + '</span>' +
      '</span>'
    );
  }

  // --- Module export ---
  window.PhaseVocab = {
    PHASE_LABELS: PHASE_LABELS,
    B4_PHASE_VOCAB: B4_PHASE_VOCAB,
    PHASE_TIER: PHASE_TIER,
    phaseTierClass: phaseTierClass,
    renderPhaseLabel: renderPhaseLabel,
    renderPhaseBadge: renderPhaseBadge,
    renderMoltAbortedBadge: renderMoltAbortedBadge
  };
})();
