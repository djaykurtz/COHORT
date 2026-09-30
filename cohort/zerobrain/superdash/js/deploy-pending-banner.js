/* Superdash v2 -- deploy-status footer pill (SWAT-20260604-0017 lineage)
 *
 * Polls /api/deploy_status (live git lookup) and updates the compact "Deploy:"
 * pill in the footer status-bar (#status-deploy) on every poll. Formats:
 *    <sha> ✓     served tree in sync with master
 *    <sha> ▼N    served tree is N commits BEHIND master (a promote is pending)
 *    <sha> ▲N    served tree is N commits AHEAD of master (unmerged branch served)
 *    <sha> Δ     drift detected but commit counts unavailable
 *    --          status unknown / endpoint unreachable
 *
 * The intrusive top-of-page deploy-pending banner was removed 2026-06-22
 * (OPERATOR: deploy state is a footer-pill signal, not a page-spanning
 * announcement). Promote instructions live in docs/SUPERDASH-DEPLOY-DISCIPLINE.md.
 *
 * Distinct from js/deploy.js (separate "fleet-wide last-deploy.json" widget)
 * and js/version-stamp.js (colors #status-build from /api/version).
 */
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 30000;
  var ENDPOINT = '/api/deploy_status';

  var pillEl = null;
  var lastDrift = null;
  var pollTimer = null;

  function $(id) { return document.getElementById(id); }

  function fmtPill(s) {
    if (!s) return '--';
    if (!s.deploy_sha_short) return '?';
    if (s.drift) {
      var behind = (typeof s.deploy_behind === 'number') ? s.deploy_behind : 0;
      var ahead = (typeof s.deploy_ahead === 'number') ? s.deploy_ahead : 0;
      if (behind > 0) return s.deploy_sha_short + ' \u25BC' + behind; // ▼ behind master
      if (ahead > 0) return s.deploy_sha_short + ' \u25B2' + ahead;   // ▲ ahead of master
      return s.deploy_sha_short + ' \u0394';                          // Δ drift, no count
    }
    return s.deploy_sha_short + ' \u2713';                            // ✓ in sync
  }

  function render(s) {
    if (pillEl) {
      pillEl.textContent = fmtPill(s);
      pillEl.className = 'status-value';
      if (!s) {
        pillEl.classList.add('status-unknown');
      } else if (s.drift) {
        pillEl.classList.add('status-warn');
      } else {
        pillEl.classList.add('status-ok');
      }
    }
    // Log only on transitions to avoid noisy console.
    var driftNow = !!(s && s.drift);
    if (lastDrift !== null && lastDrift !== driftNow) {
      try {
        console.info('[deploy-status] drift ' +
          (driftNow ? 'DETECTED' : 'CLEARED'), s);
      } catch (e) { /* console may be absent */ }
    }
    lastDrift = driftNow;
  }

  function poll() {
    fetch(ENDPOINT, { cache: 'no-store' })
      .then(function (resp) {
        if (!resp.ok) { throw new Error('HTTP ' + resp.status); }
        return resp.json();
      })
      .then(render)
      .catch(function (err) {
        // Soft-fail: show "--" in pill. Don't escalate (non-vital module).
        try { console.warn('[deploy-status] poll failed:', err); } catch (e) {}
        render(null);
      });
  }

  function start() {
    pillEl = $('status-deploy');
    if (!pillEl) return;
    poll();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Expose for diagnostics / manual refresh from console.
  // (Legacy alias window.DeployPendingBanner kept for any saved console snippets.)
  // SWAT-candidate finding A/B (superdash resource-efficiency pass, 2026-08):
  // pollTimer was a plain closure var with no external stop/start access, so
  // PerfGuard could never pause it on hidden-tab.
  window.DeployStatusPill = {
    poll: poll,
    state: function () { return { lastDrift: lastDrift }; },
    stop: function () { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } },
    start: function () { if (!pollTimer && pillEl) { poll(); pollTimer = setInterval(poll, POLL_INTERVAL_MS); } },
    isActive: function () { return !!pollTimer; }
  };
  window.DeployPendingBanner = window.DeployStatusPill;
})();
