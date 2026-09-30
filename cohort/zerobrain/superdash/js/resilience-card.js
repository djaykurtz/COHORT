/* RFC587-B4 -- Resilience Card render panel
 *
 * Renders #resilience-card from /api/resilience_incidents (B4.1 SHIPPED).
 * Uses ResilienceIncidents wrapper (js/resilience-incidents.js) for fetch +
 * PhaseVocab.renderPhaseBadge() (js/phase-vocab.js) for per-phase badges
 * (AC-B4.4 border-grammar already implemented there).
 *
 * Feature-flag dual gate:
 *   window.RESILIENCE_CARD_ENABLED === true     OR
 *   localStorage.resilienceCard === '1'
 * Off-state: card.style.display='none', no fetch.
 *
 * Server-side flag B4_RESILIENCE_QUERY_ENABLED (default-ON) handles the
 * backend side; this is the client-side feature-flag for the widget itself.
 *
 * Provenance: UXIA, 2026-06-13 (TEMPO #67840 ship-now drive; cosign =
 * PM-nod + LIVE :8430 Playwright GREEN per TEMPO #67845).
 */
var ResilienceCard = {
  _data: null,
  _lastFetchTs: null,
  _pollTimer: null,
  _POLL_MS: (typeof window !== 'undefined' && window.ResilienceIncidents)
    ? window.ResilienceIncidents._POLL_MS : 30000,

  isEnabled: function () {
    if (typeof window !== 'undefined' && window.RESILIENCE_CARD_ENABLED === true) return true;
    try {
      if (typeof localStorage !== 'undefined'
        && localStorage.getItem('resilienceCard') === '1') return true;
    } catch (e) { /* localStorage unavailable */ }
    return false;
  },

  init: function () {
    var card = document.getElementById('resilience-card');
    if (!card) return;
    if (!ResilienceCard.isEnabled()) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    ResilienceCard._render();
    ResilienceCard._refresh();
    ResilienceCard._startPolling();
  },

  _startPolling: function () {
    ResilienceCard._stopPolling();
    ResilienceCard._pollTimer = setInterval(ResilienceCard._refresh, ResilienceCard._POLL_MS);
  },

  _stopPolling: function () {
    if (ResilienceCard._pollTimer) {
      clearInterval(ResilienceCard._pollTimer);
      ResilienceCard._pollTimer = null;
    }
  },

  _refresh: function () {
    if (!window.ResilienceIncidents) {
      ResilienceCard._renderError('resilience-incidents.js not loaded');
      return;
    }
    window.ResilienceIncidents.fetch({ limit: 50, window_hours: 24 })
      .then(function (payload) {
        var valid = window.ResilienceIncidents.validateShape(payload);
        if (!valid.ok) {
          ResilienceCard._renderError('shape-surprise: ' + valid.reason);
          return;
        }
        ResilienceCard._data = payload;
        ResilienceCard._lastFetchTs = Date.now();
        ResilienceCard._render();
      })
      .catch(function (err) {
        ResilienceCard._renderError(err && err.message ? err.message : 'fetch failed');
      });
  },

  _renderError: function (msg) {
    var body = document.getElementById('resilience-card-body');
    var dot = document.getElementById('resilience-card-dot');
    var badge = document.getElementById('resilience-card-badge');
    if (dot) dot.className = 'resilience-card-dot resilience-card-dot--error';
    if (badge) badge.textContent = 'ERR';
    if (body) {
      body.innerHTML = '<div class="resilience-card-banner resilience-card-banner--error">'
        + 'FETCH FAILED &mdash; ' + ResilienceCard._escape(msg)
        + ' <button type="button" class="resilience-card-retry" '
        + 'onclick="ResilienceCard._refresh()">retry</button></div>';
    }
  },

  _render: function () {
    var body = document.getElementById('resilience-card-body');
    var dot = document.getElementById('resilience-card-dot');
    var badge = document.getElementById('resilience-card-badge');
    if (!body) return;

    if (!ResilienceCard._data) {
      body.innerHTML = '<div class="resilience-card-loading">loading&hellip;</div>';
      if (dot) dot.className = 'resilience-card-dot resilience-card-dot--loading';
      if (badge) badge.textContent = '--';
      return;
    }

    var data = ResilienceCard._data;
    var incidents = data.incidents || [];
    var nodes = data.nodes || {};
    var truncated = !!data.truncated;
    var sevCount = window.ResilienceIncidents.countBySeverity(incidents);

    // Dot color = highest-severity present
    var dotClass = 'resilience-card-dot--green';
    if (sevCount.RED > 0) dotClass = 'resilience-card-dot--red';
    else if (sevCount.YELLOW > 0) dotClass = 'resilience-card-dot--yellow';
    if (dot) dot.className = 'resilience-card-dot ' + dotClass;
    if (badge) badge.textContent = String(incidents.length) + (truncated ? '+' : '');

    var nodeIds = Object.keys(nodes).sort();
    if (nodeIds.length === 0 && incidents.length === 0) {
      body.innerHTML = '<div class="resilience-card-empty">No resilience incidents in window (24h).</div>';
      return;
    }

    var html = '<table class="resilience-card-table"><tbody>';
    for (var i = 0; i < nodeIds.length; i++) {
      var nid = nodeIds[i];
      var nodeAcc = nodes[nid];
      var currentPhase = nodeAcc.current_phase || 'unknown';
      var observed = Array.isArray(nodeAcc.phases_observed) ? nodeAcc.phases_observed : [];
      var phaseBadgeHtml = window.PhaseVocab
        ? window.PhaseVocab.renderPhaseBadge(currentPhase)
        : ('<span class="phase-badge">' + ResilienceCard._escape(currentPhase) + '</span>');
      var observedHtml = '';
      if (observed.length > 1) {
        var others = observed.filter(function (p) { return p !== currentPhase; });
        if (others.length > 0) {
          observedHtml = '<span class="resilience-card-observed">also: '
            + others.map(ResilienceCard._escape).join(', ') + '</span>';
        }
      }
      html += '<tr class="resilience-card-row" data-node-id="' + ResilienceCard._escape(nid) + '">'
        + '<td class="rc-node">' + ResilienceCard._escape(nid) + '</td>'
        + '<td class="rc-phase">' + phaseBadgeHtml + '</td>'
        + '<td class="rc-observed">' + observedHtml + '</td>'
        + '</tr>';
    }
    html += '</tbody></table>';

    if (truncated) {
      html += '<div class="resilience-card-truncated">'
        + 'Showing first ' + incidents.length
        + ' incidents &mdash; more in window.</div>';
    }

    body.innerHTML = html;
  },

  _escape: function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ResilienceCard.init);
  } else {
    ResilienceCard.init();
  }
}
