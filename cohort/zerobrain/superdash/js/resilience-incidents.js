/* RFC587-B4 -- Resilience Incidents data-layer wrapper
 *
 * Thin fetch wrapper for /api/resilience_incidents (B4.1 backend, SHIPPED via
 * UXIA #60727 + TEMPO #60733 + NIMBUS #60987 since_epoch_ms delta-query).
 * HTTP route shipped in SWAT-20260612-0012; severity/phase contract per
 * coordinator/database.py:13076 get_resilience_incidents().
 *
 * Canonical response shape:
 *   {
 *     incidents: [{ incident_id, node_id, phase, started_at,
 *                   severity, root_cause_class?, ended_at? }],
 *     nodes: { <node_id>: { current_phase, phases_observed[] } },
 *     truncated: bool,
 *     error?: string   // only on unknown phase filter
 *   }
 *
 * Phase enum (10 tokens, source of truth: phase-vocab.js B4_PHASE_VOCAB):
 *   HEALTHY, WATCH, DEGRADED, SLOW_BOOT, FLAG_DRIFT, MOLT_FAILED,
 *   AUTH_WALL, BRICKED, DOUBLE_BOOT, AUDIT_ACK
 *
 * Severity mapping handled server-side (B4_PHASE_SEVERITY in database.py);
 * client-side rendering should defer to PhaseVocab.phaseTierClass() which
 * already implements the AC-B4.4 border-grammar (red/yellow/green).
 *
 * Author: UXIA.
 */
(function (root) {
  'use strict';

  var DEFAULT_ENDPOINT = '/api/resilience-incidents';
  var _POLL_MS = 30000;       // 30s overview refresh; backend cache softens load

  function _buildQs(opts) {
    opts = opts || {};
    var params = [];
    if (opts.node_id)       params.push('node_id=' + encodeURIComponent(opts.node_id));
    if (opts.phase)         params.push('phase=' + encodeURIComponent(opts.phase));
    if (opts.limit)         params.push('limit=' + encodeURIComponent(opts.limit));
    if (opts.window_hours)  params.push('window_hours=' + encodeURIComponent(opts.window_hours));
    if (opts.since_epoch_ms != null) {
      params.push('since_epoch_ms=' + encodeURIComponent(opts.since_epoch_ms));
    }
    return params.length ? '?' + params.join('&') : '';
  }

  function fetchIncidents(opts) {
    var qs = _buildQs(opts);
    var base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';
    var headers = { 'Accept': 'application/json' };
    if (typeof CONFIG !== 'undefined' && CONFIG.AUTH_TOKEN) {
      headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
    }
    return fetch(base + DEFAULT_ENDPOINT + qs, { headers: headers })
      .then(function (resp) {
        if (!resp.ok) {
          var err = new Error('resilience_incidents fetch failed: HTTP ' + resp.status);
          err.status = resp.status;
          throw err;
        }
        return resp.json();
      });
  }

  // Convenience: count incidents grouped by severity (using PhaseVocab tier
  // mapping if available; falls back to phase-token inspection).
  function countBySeverity(incidents) {
    var out = { RED: 0, YELLOW: 0, GREEN: 0, UNKNOWN: 0 };
    if (!Array.isArray(incidents)) return out;
    for (var i = 0; i < incidents.length; i++) {
      var sev = (incidents[i] && incidents[i].severity) || 'UNKNOWN';
      if (out[sev] !== undefined) out[sev]++;
      else out.UNKNOWN++;
    }
    return out;
  }

  // Defensive: validate response shape matches canonical contract. Returns
  // {ok:true} or {ok:false, reason}. Used by render layer to gracefully
  // degrade on shape-surprise (early-warning if backend contract drifts).
  function validateShape(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload not object' };
    if (!Array.isArray(payload.incidents))     return { ok: false, reason: 'incidents not array' };
    if (typeof payload.nodes !== 'object')     return { ok: false, reason: 'nodes not object' };
    if (typeof payload.truncated !== 'boolean') return { ok: false, reason: 'truncated not boolean' };
    return { ok: true };
  }

  root.ResilienceIncidents = {
    fetch: fetchIncidents,
    countBySeverity: countBySeverity,
    validateShape: validateShape,
    _POLL_MS: _POLL_MS,
    _ENDPOINT: DEFAULT_ENDPOINT,
  };

})(typeof window !== 'undefined' ? window : globalThis);
