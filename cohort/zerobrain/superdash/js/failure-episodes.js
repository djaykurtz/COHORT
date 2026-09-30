/* Operator-visible durable failure-episode projection.
 *
 * Contract: GET /api/failure-episodes -> { episodes: [...], updated_at? }.
 * One bounded fetch per refresh; no automatic retry loop.
 */
(function (root) {
  'use strict';

  var ENDPOINT = '/api/failure-episodes';
  var TIMEOUT_MS = 3000;
  var POLL_MS = 30000;
  var STATE_ORDER = { suspect: 1, degraded: 2, recovering: 3, recovered: 4 };

  function keyOf(episode) {
    return episode.episode_id || episode.dedupe_key
      || [episode.component, episode.started_at, episode.cause_class].join('|');
  }

  function normalize(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.episodes)) {
      throw new Error('failure-episodes shape invalid');
    }
    return payload.episodes.filter(function (episode) {
      return episode && typeof episode === 'object' && keyOf(episode);
    }).map(function (episode) {
      var copy = Object.assign({}, episode);
      copy.started_at = copy.started_at || copy.first_seen_at;
      copy.episode_key = keyOf(copy);
      copy.state = STATE_ORDER[copy.state] ? copy.state : 'degraded';
      copy.delivery = /fallback|replay/i.test(String(copy.delivery || ''))
        ? 'fallback-replayed' : 'direct';
      return copy;
    });
  }

  function reconcile(episodes) {
    var byKey = {};
    (episodes || []).forEach(function (episode) {
      var key = episode.episode_key || keyOf(episode);
      var previous = byKey[key];
      if (!previous) {
        byKey[key] = episode;
        return;
      }
      var previousTime = Date.parse(previous.updated_at || previous.started_at || '') || 0;
      var currentTime = Date.parse(episode.updated_at || episode.started_at || '') || 0;
      if (episode.delivery === 'direct' && previous.delivery !== 'direct') {
        byKey[key] = episode;
      } else if (currentTime >= previousTime) {
        byKey[key] = episode;
      }
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; })
      .sort(function (a, b) {
        var at = Date.parse(a.updated_at || a.started_at || '') || 0;
        var bt = Date.parse(b.updated_at || b.started_at || '') || 0;
        return bt - at;
      });
  }

  async function fetchJson(endpoint) {
    var base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';
    var headers = { 'Accept': 'application/json' };
    if (typeof CONFIG !== 'undefined' && CONFIG.AUTH_TOKEN) {
      headers.Authorization = 'Bearer ' + CONFIG.AUTH_TOKEN;
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
      var response = await fetch(base + endpoint, { headers: headers, signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return { ok: true, payload: await response.json() };
    } catch (error) {
      var message = error && error.name === 'AbortError' ? 'request timed out' : (error.message || 'request failed');
      return { ok: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  function fallbackEpisodes(payload) {
    if (!payload || !Array.isArray(payload.incidents)) return [];
    return payload.incidents.map(function (incident) {
      var phase = String(incident.phase || '').toUpperCase();
      var state = phase === 'HEALTHY' || incident.ended_at ? 'recovered'
        : phase === 'WATCH' ? 'suspect' : 'degraded';
      return {
        episode_id: incident.incident_id,
        component: incident.node_id || 'unknown',
        state: state,
        started_at: incident.started_at,
        recovered_at: incident.ended_at,
        updated_at: incident.ended_at || incident.started_at,
        cause_class: incident.root_cause_class || phase.toLowerCase() || 'unclassified',
        cause_summary: incident.root_cause_class || phase.toLowerCase() || 'resilience incident',
        remediation: 'durable episode feed unavailable; review resilience incident',
        evidence_uri: '/api/resilience_incidents',
        delivery: 'fallback-replayed'
      };
    });
  }

  async function fetchEpisodes() {
    var primary = await fetchJson(ENDPOINT);
    if (primary.ok) {
      try {
        return { ok: true, episodes: reconcile(normalize(primary.payload)) };
      } catch (error) {
        return { ok: false, error: error.message, episodes: [] };
      }
    }
    var fallback = await fetchJson('/api/resilience_incidents?limit=50&window_hours=24');
    if (fallback.ok) {
      return { ok: true, episodes: reconcile(fallbackEpisodes(fallback.payload)), fallback: true };
    }
    return { ok: false, error: primary.error + '; fallback: ' + fallback.error, episodes: [] };
  }

  function duration(episode) {
    if (typeof episode.duration_seconds === 'number') {
      return Math.max(0, Math.floor(episode.duration_seconds)) + 's';
    }
    var start = Date.parse(episode.started_at || '');
    if (!start) return '--';
    var end = Date.parse(episode.recovered_at || episode.ended_at || '') || Date.now();
    var seconds = Math.max(0, Math.floor((end - start) / 1000));
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    return Math.floor(seconds / 3600) + 'h';
  }

  root.FailureEpisodes = {
    ENDPOINT: ENDPOINT,
    TIMEOUT_MS: TIMEOUT_MS,
    POLL_MS: POLL_MS,
    normalize: normalize,
    reconcile: reconcile,
    fetch: fetchEpisodes,
    duration: duration
  };
})(typeof window !== 'undefined' ? window : globalThis);

var FailureEpisodesPanel = {
  _timer: null,
  _data: null,

  init: function () {
    var card = document.getElementById('failure-episodes-card');
    if (!card) return;
    this.refresh();
    this._timer = setInterval(this.refresh.bind(this), FailureEpisodes.POLL_MS);
  },

  async refresh() {
    var result = await FailureEpisodes.fetch();
    this._data = result;
    this.render();
  },

  render: function () {
    var body = document.getElementById('failure-episodes-body');
    var badge = document.getElementById('failure-episodes-badge');
    var dot = document.getElementById('failure-episodes-dot');
    if (!body || !this._data) return;

    if (!this._data.ok) {
      if (badge) badge.textContent = 'DEGRADED';
      if (dot) dot.className = 'failure-episodes-dot failure-episodes-dot--error';
      body.innerHTML = '<div class="failure-episodes-error">Failure episode feed degraded: '
        + escapeHtml(this._data.error) + '</div>';
      return;
    }

    var episodes = this._data.episodes;
    if (badge) badge.textContent = String(episodes.length) + (this._data.fallback ? ' F' : '');
    if (dot) {
      var active = episodes.some(function (episode) {
        return episode.state !== 'recovered';
      });
      dot.className = 'failure-episodes-dot failure-episodes-dot--' + (active ? 'warn' : 'ok');
    }
    if (!episodes.length) {
      body.innerHTML = '<div class="failure-episodes-empty">No durable failure episodes.</div>';
      return;
    }
    body.innerHTML = episodes.map(function (episode) {
      return '<div class="failure-episode-row failure-episode-row--' + escapeHtml(episode.state) + '">'
        + '<div class="failure-episode-main">'
        + '<strong>' + escapeHtml(episode.component || 'unknown') + '</strong>'
        + '<span class="failure-episode-state">' + escapeHtml(episode.state) + '</span>'
        + '<span class="failure-episode-delivery">' + escapeHtml(episode.delivery) + '</span>'
        + '</div>'
        + '<div class="failure-episode-detail">'
        + escapeHtml(episode.cause_summary || episode.cause_class || 'unclassified')
        + ' | ' + escapeHtml(episode.remediation || 'no remediation recorded')
        + ' | ' + FailureEpisodes.duration(episode)
        + '</div>'
        + (safeEvidenceHref(episode.evidence_uri)
          ? '<a class="failure-episode-evidence" href="' + escapeHtml(safeEvidenceHref(episode.evidence_uri)) + '">evidence</a>'
          : (episode.evidence_uri
            ? '<span class="failure-episode-evidence-path">evidence: '
              + escapeHtml(episode.evidence_uri) + '</span>'
            : ''))
        + '</div>';
    }).join('');
  }
};

function escapeHtml(value) {
  var div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function safeEvidenceHref(value) {
  if (!value) return '';
  var href = String(value);
  if (href.indexOf('//') === 0) return '';
  if (href.charAt(0) === '/' || /^https?:\/\//i.test(href)) return href;
  return '';
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { FailureEpisodesPanel.init(); });
  } else {
    FailureEpisodesPanel.init();
  }
}
