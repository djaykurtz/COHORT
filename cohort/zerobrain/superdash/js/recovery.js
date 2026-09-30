/* Fleet Recovery Console — JS */
/* Polls coordinator + recovery API for health, topology, breathbus, and actions */

(function() {
  'use strict';

  var API = CONFIG.API_BASE;
  var TOKEN = CONFIG.AUTH_TOKEN;
  var NODE_COLORS = CONFIG.NODE_COLORS;
  var HOSTS = CONFIG.HOSTS;
  var BB = CONFIG.BREATHBUS;
  var POLL_MS = 15000;
  var ACTION_COOLDOWN_MS = 30000;
  var ACTION_TIMEOUT_MS = 60000;
  var ACTION_POLL_MS = 5000;

  var state = {
    coordinator: null,
    topology: [],
    breathbus: { COORD_HOST: null, WORKER_HOST: null },
    superdash: null,
    lastPoll: null,
    pollCount: 0,
    error: null
  };

  // Track in-flight actions: { key: { startedAt, timer, status } }
  var actions = {};

  // --- Fetch helpers ---
  function fetchJSON(url, timeout) {
    timeout = timeout || 5000;
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeout);
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'X-Fleet-Token': TOKEN },
      signal: controller.signal
    }).then(function(r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function(e) {
      clearTimeout(timer);
      return null;
    });
  }

  function postAction(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'X-Fleet-Token': TOKEN,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // --- Action lifecycle ---
  function startAction(key, path, body, btn) {
    if (actions[key]) return;
    btn.disabled = true;
    btn.classList.add('acting');
    btn.textContent = '⏳ Working...';

    actions[key] = { startedAt: Date.now(), status: 'initiated' };

    postAction(path, body).then(function(res) {
      if (res.status === 'completed') {
        finishAction(key, btn, 'done');
      } else {
        // Async — poll health until recovered or timeout
        actions[key].timer = setInterval(function() {
          if (Date.now() - actions[key].startedAt > ACTION_TIMEOUT_MS) {
            finishAction(key, btn, 'timeout');
            return;
          }
          pollAll();
        }, ACTION_POLL_MS);
      }
    }).catch(function(e) {
      finishAction(key, btn, 'error', e.message);
    });
  }

  function finishAction(key, btn, result, errMsg) {
    var a = actions[key];
    if (a && a.timer) clearInterval(a.timer);
    delete actions[key];

    if (result === 'done') {
      btn.textContent = '✓ Done';
      btn.classList.remove('acting');
      btn.classList.add('done');
    } else if (result === 'timeout') {
      btn.textContent = '⚠ Timeout';
      btn.classList.remove('acting');
      btn.classList.add('errored');
    } else {
      btn.textContent = '✕ ' + (errMsg || 'Failed');
      btn.classList.remove('acting');
      btn.classList.add('errored');
    }

    // Cooldown then re-enable
    setTimeout(function() {
      btn.disabled = false;
      btn.classList.remove('done', 'errored');
      // Label will be reset on next render
      render();
    }, ACTION_COOLDOWN_MS);

    pollAll();
  }

  // --- Data fetching ---
  function pollAll() {
    var promises = [
      fetchJSON(API + '/api/health').then(function(d) { state.coordinator = d; }),
      fetchJSON(API + '/api/topology').then(function(d) { state.topology = d || []; }),
      checkPort(window.location.hostname || '127.0.0.1', 8430).then(function(up) { state.superdash = up; })
    ];

    Object.keys(BB).forEach(function(host) {
      var url = 'http://' + BB[host].ip + ':' + BB[host].port + '/health';
      promises.push(
        fetchJSON(url, 3000).then(function(d) { state.breathbus[host] = d; })
      );
    });

    return Promise.allSettled(promises).then(function() {
      state.lastPoll = new Date();
      state.pollCount++;
      state.error = null;
      render();
    }).catch(function(e) {
      state.error = e.message;
      render();
    });
  }

  function checkPort(host, port) {
    return fetch('http://' + host + ':' + port + '/', { mode: 'no-cors' })
      .then(function() { return true; })
      .catch(function() { return false; });
  }

  // --- Helpers ---
  function formatAge(isoStr) {
    if (!isoStr) return 'never';
    var diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 0) diff = 0;
    if (diff < 60) return Math.floor(diff) + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function ageStatus(isoStr) {
    if (!isoStr) return 'unknown';
    var diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 300) return 'online';
    if (diff < 900) return 'stale';
    return 'offline';
  }

  function indicatorClass(isoStr) {
    var s = ageStatus(isoStr);
    if (s === 'online') return '';
    return s;
  }

  function formatUptime(secs) {
    if (!secs) return '';
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  // --- Render ---
  function render() {
    renderHealthPanel();
    renderInfra();
    renderNodes();
    renderPoll();
  }

  function renderHealthPanel() {
    var el = document.getElementById('health-panel');
    var rows = [];

    // Coordinator
    var cUp = state.coordinator && state.coordinator.status === 'ok';
    rows.push(hRow('Coordinator', cUp ? 'ok' : 'bad',
      cUp ? '● UP — ' + formatUptime(state.coordinator.uptime_seconds) : '✕ DOWN'));

    // Superdash
    rows.push(hRow('Superdash', state.superdash ? 'ok' : 'bad',
      state.superdash ? '● UP' : '✕ DOWN'));

    // Breathbus
    ['COORD_HOST', 'WORKER_HOST'].forEach(function(host) {
      var bb = state.breathbus[host];
      var up = bb && bb.status === 'ok';
      rows.push(hRow('BB ' + host, up ? 'ok' : (bb === null ? 'muted' : 'bad'),
        up ? '● ' + (bb.rider_count || '?') + ' riders' : (bb === null ? '○ checking...' : '✕ DOWN')));
    });

    // Fleet nodes
    var fleet = state.topology.filter(function(n) {
      return ['ZBPRIME','NIMBUS','UXIA','QUATTRO','TEMPO','DRAGON'].indexOf(n.node_id) >= 0;
    });
    var healthy = fleet.filter(function(n) { return ageStatus(n.last_seen) === 'online'; }).length;
    rows.push(hRow('Fleet Nodes', healthy === 6 ? 'ok' : (healthy >= 4 ? 'warn' : 'bad'),
      healthy + '/6 online'));

    el.innerHTML = rows.join('');

    // Readiness stages
    if (state.coordinator && state.coordinator.readiness_stages) {
      var stages = state.coordinator.readiness_stages;
      var tags = Object.keys(stages).map(function(k) {
        return '<span class="readiness-tag ' + (stages[k] ? 'pass' : 'fail') + '">'
          + k.replace(/_/g, ' ') + '</span>';
      }).join('');
      el.innerHTML += '<div class="readiness-list">' + tags + '</div>';
    }
  }

  function hRow(label, cls, value) {
    return '<div class="health-row">'
      + '<span class="label"><span class="rc-indicator ' + (cls === 'ok' ? '' : (cls === 'bad' ? 'offline' : (cls === 'warn' ? 'stale' : 'unknown'))) + '"></span> ' + label + '</span>'
      + '<span class="value ' + cls + '">' + value + '</span>'
      + '</div>';
  }

  function renderInfra() {
    var el = document.getElementById('infra-cards');
    var cards = [];

    // Coordinator
    var cUp = state.coordinator && state.coordinator.status === 'ok';
    cards.push(iCard('Coordinator', 'COORD_HOST :8420', cUp, [
      { label: 'Status', value: cUp ? '● UP' : '✕ DOWN', cls: cUp ? 'ok' : 'bad' },
      { label: 'Nodes', value: cUp ? String(state.coordinator.node_count || '?') : '—', cls: '' },
      { label: 'Messages', value: cUp ? String(state.coordinator.message_count || '?') : '—', cls: '' },
      { label: 'Uptime', value: cUp ? formatUptime(state.coordinator.uptime_seconds) : '—', cls: '' }
    ], 'coordinator'));

    // Superdash
    cards.push(iCard('Superdash', 'COORD_HOST :8430', state.superdash, [
      { label: 'Status', value: state.superdash ? '● UP' : '✕ DOWN', cls: state.superdash ? 'ok' : 'bad' }
    ], 'superdash'));

    // Breathbus per host
    ['COORD_HOST', 'WORKER_HOST'].forEach(function(host) {
      var bb = state.breathbus[host];
      var up = bb && bb.status === 'ok';
      var riders = HOSTS[host].join(', ');
      cards.push(iCard('BB ' + host, host + ' :8440', up, [
        { label: 'Status', value: up ? '● UP' : '✕ DOWN', cls: up ? 'ok' : 'bad' },
        { label: 'Riders', value: up ? String(bb.rider_count || '?') : '—', cls: '' },
        { label: 'Nodes', value: riders, cls: '' }
      ], 'breathbus/' + host));
    });

    el.innerHTML = cards.join('');
  }

  function iCard(name, host, isUp, rows, actionTarget) {
    var statusCls = isUp ? '' : (isUp === null ? '' : 'down');
    var html = '<div class="infra-card ' + statusCls + '">'
      + '<div class="infra-card-name">' + name + '</div>'
      + '<div class="infra-card-host">' + host + '</div>';
    rows.forEach(function(r) {
      html += '<div class="infra-card-row">'
        + '<span class="label">' + r.label + '</span>'
        + '<span class="value ' + r.cls + '">' + r.value + '</span>'
        + '</div>';
    });
    html += '<button class="rc-action-btn" data-action="restart" data-target="' + actionTarget + '">⟳ Restart</button></div>';
    return html;
  }

  function renderNodes() {
    var el = document.getElementById('node-cards');
    var order = ['ZBPRIME', 'NIMBUS', 'UXIA', 'QUATTRO', 'TEMPO', 'DRAGON'];
    var cards = [];

    order.forEach(function(nid) {
      var n = state.topology.find(function(t) { return t.node_id === nid; });
      var host = Object.keys(HOSTS).find(function(h) { return HOSTS[h].indexOf(nid) >= 0; }) || '?';
      var color = NODE_COLORS[nid] || '#58a6ff';
      var lastSeen = n ? n.last_seen : null;
      var ind = indicatorClass(lastSeen);
      var role = n ? (n.role || '—') : '—';
      var statusLabel = ageStatus(lastSeen);
      var statusText = statusLabel === 'online' ? 'online' : (statusLabel === 'stale' ? 'stale' : (statusLabel === 'offline' ? 'offline' : 'unknown'));

      cards.push(
        '<div class="rc-node-card" style="--node-color:' + color + '">'
        + '<div class="rc-card-header">'
        + '<span class="rc-node-name" style="color:' + color + '">' + nid + '</span>'
        + '<span class="rc-node-role">' + role + '</span>'
        + '</div>'
        + '<div class="rc-node-meta">'
        + '<span class="rc-indicator ' + ind + '"></span>'
        + '<span>' + host + '</span>'
        + '<span class="rc-node-age">' + formatAge(lastSeen) + '</span>'
        + '</div>'
        + '<button class="rc-action-btn" data-action="revive" data-target="' + nid + '">⟳ Revive</button>'
        + '</div>'
      );
    });

    el.innerHTML = cards.join('');
  }

  function renderPoll() {
    var el = document.getElementById('poll-indicator');
    var ts = state.lastPoll ? state.lastPoll.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: CONFIG.DISPLAY_TIME_ZONE
    }) : '—';
    el.innerHTML = '<span class="poll-dot"></span>Poll #' + state.pollCount + ' · ' + ts + ' ' + CONFIG.DISPLAY_TIME_ZONE;
  }

  // --- Event delegation for action buttons ---
  function handleActionClick(e) {
    var btn = e.target.closest('.rc-action-btn, .batch-btn');
    if (!btn || btn.disabled) return;
    var action = btn.dataset.action;
    var target = btn.dataset.target;
    if (!action || !target) return;

    if (action === 'restart') {
      startAction('restart-' + target, '/api/recovery/' + target + '/restart', null, btn);
    } else if (action === 'revive') {
      startAction('revive-' + target, '/api/recovery/node/' + target + '/revive', null, btn);
    } else if (action === 'batch-revive') {
      var body = target === 'all' ? { group: 'all' } : { group: target.toLowerCase() };
      startAction('batch-' + target, '/api/recovery/nodes/batch', body, btn);
    } else if (action === 'batch-restart-bb') {
      // Restart all breathbus sequentially
      ['COORD_HOST', 'WORKER_HOST'].forEach(function(h) {
        startAction('restart-breathbus/' + h, '/api/recovery/breathbus/' + h + '/restart', null, btn);
      });
    } else if (action === 'restart-all') {
      startAction('restart-coordinator', '/api/recovery/coordinator/restart', null, btn);
    }
  }

  // --- Lifecycle (pause/resume for PerfGuard) ---
  var _pollTimer = null;
  var _pollInFlight = false;

  function startRecoveryPolling() {
    stopRecoveryPolling();
    _safePoll();
    _pollTimer = setInterval(_safePoll, POLL_MS);
  }

  function stopRecoveryPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    // Clear stale action timers
    Object.keys(actions).forEach(function(key) {
      var a = actions[key];
      if (a && a.timer && Date.now() - a.startedAt > ACTION_TIMEOUT_MS) {
        clearInterval(a.timer);
        delete actions[key];
      }
    });
  }

  function _safePoll() {
    if (_pollInFlight) return;
    _pollInFlight = true;
    pollAll().finally(function() { _pollInFlight = false; });
  }

  // Expose for PerfGuard integration
  window.RecoveryPolling = {
    start: startRecoveryPolling,
    stop: stopRecoveryPolling,
    isActive: function() { return !!_pollTimer; }
  };

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', handleActionClick);
    startRecoveryPolling();
  });
})();
