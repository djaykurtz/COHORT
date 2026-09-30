/* Superdash v2 -- SSE Real-time Connection
 * The coordinator /api/events endpoint returns JSON (not text/event-stream),
 * so we use polling with last-event-id tracking to simulate real-time updates.
 */

var SSE = {
  source: null,
  connected: false,
  retryCount: 0,
  maxRetries: 10,
  retryDelay: 5000,
  _pollTimer: null,
  _lastEventId: 0,
  // OPERATOR P1 escalation 2026-06-06 (UXIA): was 45000 -- combined with the
  // up-to-15s FleetState poll, that put worst-case server->UI propagation at
  // ~60s, average ~30s, which OPERATOR experienced as "rarely updated". 10s
  // gives the SSE poller a tight upper bound on event delivery; the cairn-
  // cache shim below force-refreshes CairnRecent endpoints on delivery so the
  // ACTIVE RFCs panel reflects within ms of arrival. Per-tab cost: 6 polls/min
  // of /api/events (was 1.3/min) -- trivial for the typical single-tab dash.
  _pollInterval: 10000,

  // ── Cairn event notification allowlist (Site 3 fix, UXIA 2026-05-30) ──
  // CANONICAL SOURCE: js/cairn-cache.js lines 619-646 (CAIRN_OUTBOX_EVENTS +
  // CAIRN_SUBSTRINGS + _matchesCairn). If you add an event type there, mirror
  // it here. Backend-emitted cairn events must (a) match an explicit key below,
  // OR (b) contain one of the substring tokens. Drift between the two tables
  // causes silent notification loss.
  _CAIRN_OUTBOX_EVENTS: {
    // Wave lifecycle
    wave_opened: 'Wave opened',
    wave_closed_with_synthesis: 'Wave closed',
    synthesis_published: 'Synthesis published',
    // RFC lifecycle
    solidplan_attached: 'Solidplan attached',
    rfc_ratified: 'RFC ratified',
    rfc_shipped: 'RFC shipped',
    rfc_archived: 'RFC archived',
    rfc_status_set: 'RFC status changed',
    rfc_promoted: 'RFC promoted',
    rfc_demoted: 'RFC demoted',
    rfc_revised: 'RFC revised',
    rfc_renamed: 'RFC renamed',
    // RFC authoring + meta
    rfc_created: 'RFC created',
    seed_created: 'Seed created',
    rfc_meta_set: 'RFC metadata updated',
    rfc_short_description_set: 'RFC description updated',
    rfc_tags_set: 'RFC tags updated',
    // Engagement
    rfc_voted: 'RFC voted',
    rfc_council_summoned: 'Council summoned',
    // Seed promotion via star
    seed_starred_promoted: 'Seed promoted',
    // Response interactions
    response_starred: 'Response starred',
    operator_frame: 'OPERATOR frame'
  },
  // Substring tokens are matched as WORD-ANCHORED segments (split on `_`)
  // to avoid greedy false-positives. Example: 'ship' matches `rfc_shipped`
  // and `ship_event` but NOT `relationship_changed`.
  _CAIRN_SUBSTRINGS: [
    'cairn', 'rfc', 'seed', 'wave', 'solidplan', 'synthesis',
    'ratified', 'ship', 'shipped', 'star', 'starred', 'frame',
    'revise', 'revised', 'revision', 'renamed',
    'promote', 'promoted', 'demote', 'demoted', 'vote', 'voted',
    'tag', 'tags', 'meta', 'category', 'title', 'response',
    'spyglass', 'council', 'summoned', 'created', 'archived'
  ],
  _matchesCairnEvent: function(type) {
    if (!type) return false;
    if (SSE._CAIRN_OUTBOX_EVENTS[type]) return true;
    // Word-anchored match: split event_type on `_` and check if any segment
    // equals a token exactly. Prevents false positives like 'ship' matching
    // `relationship_changed` (splits to ['relationship','changed'] -- no 'ship'
    // segment).
    var segments = type.split('_');
    for (var i = 0; i < SSE._CAIRN_SUBSTRINGS.length; i++) {
      var token = SSE._CAIRN_SUBSTRINGS[i];
      for (var j = 0; j < segments.length; j++) {
        if (segments[j] === token) return true;
      }
    }
    return false;
  },
  _formatCairnEventTitle: function(type) {
    if (SSE._CAIRN_OUTBOX_EVENTS[type]) return SSE._CAIRN_OUTBOX_EVENTS[type];
    return type.replace(/_/g, ' ');
  },

  connect: function() {
    // Try true EventSource first; if content-type is wrong, fall back to poll
    if (SSE.source) {
      SSE.source.close();
      SSE.source = null;
    }
    if (SSE._pollTimer) {
      clearInterval(SSE._pollTimer);
      SSE._pollTimer = null;
    }

    var url = CONFIG.API_BASE + '/api/events?token=' + CONFIG.AUTH_TOKEN;
    console.log('[SSE] Connecting to', url);

    // Probe the endpoint to check if it supports true SSE
    fetch(url, { method: 'GET', headers: { 'Accept': 'text/event-stream' } })
      .then(function(resp) {
        var ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('text/event-stream') !== -1) {
          SSE._connectEventSource(url);
        } else {
          console.log('[SSE] Endpoint returns JSON -- using poll mode');
          SSE._startPolling();
        }
      })
      .catch(function() {
        console.warn('[SSE] Probe failed -- using poll mode');
        SSE._startPolling();
      });
  },

  _connectEventSource: function(url) {
    try {
      SSE.source = new EventSource(url);

      SSE.source.onopen = function() {
        console.log('[SSE] EventSource connected');
        SSE.connected = true;
        SSE.retryCount = 0;
        Panels.setConnected(true);
        document.getElementById('status-sse').textContent = 'connected';
        document.getElementById('status-sse').style.color = 'var(--success)';
      };

      SSE.source.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          SSE.handleEvent(data);
        } catch (e) {
          console.warn('[SSE] Parse error:', e);
        }
      };

      SSE.source.onerror = function() {
        console.warn('[SSE] EventSource error -- falling back to poll');
        if (SSE.source) { SSE.source.close(); SSE.source = null; }
        SSE._startPolling();
      };
    } catch (e) {
      console.warn('[SSE] EventSource creation failed:', e);
      SSE._startPolling();
    }
  },

  _startPolling: function() {
    SSE.connected = true;
    Panels.setConnected(true);
    document.getElementById('status-sse').textContent = 'degraded (poll)';
    document.getElementById('status-sse').style.color = 'var(--warning)';

    SSE._poll(); // immediate first poll
    SSE._pollTimer = setInterval(SSE._poll, SSE._pollInterval);
  },

  _poll: function() {
    var url = CONFIG.API_BASE + '/api/events?token=' + CONFIG.AUTH_TOKEN +
              '&since_id=' + SSE._lastEventId + '&limit=50';

    fetch(url)
      .then(function(resp) { return resp.json(); })
      .then(function(json) {
        var events = json.events || json || [];
        if (!Array.isArray(events)) return;
        events.forEach(function(ev) {
          if (ev.id && ev.id > SSE._lastEventId) {
            SSE._lastEventId = ev.id;
          }
          SSE.handleEvent(ev);
        });
        // Confirm connected on successful poll
        if (!SSE.connected) {
          SSE.connected = true;
          Panels.setConnected(true);
          document.getElementById('status-sse').textContent = 'degraded (poll)';
          document.getElementById('status-sse').style.color = 'var(--warning)';
        }
        SSE.retryCount = 0;
      })
      .catch(function(err) {
        console.warn('[SSE] Poll error:', err);
        SSE.retryCount++;
        if (SSE.retryCount > SSE.maxRetries) {
          clearInterval(SSE._pollTimer);
          SSE._pollTimer = null;
          SSE.connected = false;
          Panels.setConnected(false);
          document.getElementById('status-sse').textContent = 'offline';
          document.getElementById('status-sse').style.color = 'var(--danger, red)';
        } else {
          document.getElementById('status-sse').textContent = 'reconnecting';
          document.getElementById('status-sse').style.color = 'var(--warning)';
        }
      });
  },

  handleEvent: function(data) {
    var type = data.event_type || data.type || '';

    if (type === 'heartbeat' || type === 'keepalive') {
      return;
    }

    // Suppress per-event logging to reduce memory (Firefox retains console output)

    // Fire notifications for user-relevant events.
    // CANONICAL EVENT NAMES: verified against /api/events?limit=1000 sample
    // (UXIA scrub 2026-05-30, n=1000 events) AND grep `event_type=` in
    // coordinator/database.py for ground-truth emit sites. When adding a
    // new event-type branch, do BOTH checks (sample + grep) to confirm the
    // name matches what the coordinator actually emits. Previous versions
    // of this block matched phantom names (`new_message`, `message_created`,
    // `task_assigned`, `node_stale`, `node_offline`, `molt_executed`) that
    // the coordinator never emits -- toasts were silently broken for some
    // of the most-common events.
    if (type === 'message_sent') {
      Notify.message(
        'New message from @' + (data.from_node || data.node_id || '?'),
        data.subject || data.content || ''
      );
    } else if (type === 'task_created' || type === 'task_updated') {
      Notify.task(
        'Task ' + (data.action || (type === 'task_created' ? 'created' : 'updated')),
        (data.task_id || '') + ': ' + (data.title || data.status || '')
      );
    } else if (type === 'lifecycle_state_changed') {
      // Real event for node lifecycle transitions. data.state carries the
      // target state (e.g. 'stale', 'offline', 'running'). Coordinator
      // emits at database.py set_node_lifecycle (~line 7635). Replaces the
      // previous `node_stale`/`node_offline` phantom branch.
      var lstate = (data && data.state) || data.lifecycle_state || 'changed';
      if (lstate === 'stale' || lstate === 'offline' || lstate === 'halted') {
        Notify.alert(
          'Node ' + (data.node_id || '?') + ' → ' + lstate,
          'Lifecycle state changed' + (data.previous_state ? ' from ' + data.previous_state : '')
        );
      }
      // Other lifecycle transitions (running, saving, ready_for_restart,
      // restarting, stopped) are operational noise -- INTENTIONALLY SILENT.
    } else if (type === 'molt_requested' || type === 'molt_executing'
               || type === 'self_molt_completed') {
      // Real MOLT lifecycle events. `molt_requested` is the request,
      // `molt_executing` is mid-MOLT, `self_molt_completed` is the
      // success terminus. Coordinator emits at database.py ~7295, ~7594.
      // Previous `molt_executed` was a phantom (never emitted).
      var moltLabel = (type === 'molt_requested') ? 'requested'
                    : (type === 'molt_executing') ? 'executing'
                    : 'completed';
      Notify.alert(
        'MOLT ' + moltLabel,
        'Target: ' + (data.target_node_id || data.node_id || '?')
      );
    } else if (type === 'boomerang_thrown' || type === 'boomerang_caught'
               || type === 'boomerang_returned' || type === 'boomerang_bounced') {
      // Boomerang work-item lifecycle (coordinator/database.py ~11368, ~11447,
      // ~11537). Previously uncovered -- surfaced as scrub finding, added here.
      var boomLabel = type.replace('boomerang_', '');
      Notify.task(
        'Boomerang ' + boomLabel,
        (data.item_id || data.boomerang_id || '?')
          + (data.assignee ? ' → @' + data.assignee : '')
          + (data.scope_description ? ': ' + data.scope_description : '')
      );
    } else if (SSE._matchesCairnEvent(type)) {
      // ── Cairn notification allowlist (Site 3 fix, UXIA 2026-05-30) ──
      // Mirrors cairn-cache.js _matchesCairn (CAIRN_OUTBOX_EVENTS + CAIRN_SUBSTRINGS).
      // Previous narrow allowlist (cairn_rfc_created || cairn_wave_opened) matched
      // neither canonical event name -- backend emits wave_opened, rfc_ratified,
      // solidplan_attached, etc. without a `cairn_` prefix. The cache layer was
      // invalidating correctly via _matchesCairn but notifications stayed silent.
      // CANONICAL SOURCE: js/cairn-cache.js lines 619-646. If you add an event
      // type there, mirror it in SSE._CAIRN_* tables below.
      Notify.show({
        type: 'message', icon: '⬡',
        title: 'Cairn: ' + SSE._formatCairnEventTitle(type),
        msg: data.title || data.rfc_id || data.slug || data.seed_id || ''
      });
    }
    // INTENTIONAL SILENCE (UXIA scrub 2026-05-30, verified via /api/events
    // n=1000 sample). Each of these is emitted but deliberately not surfaced
    // as a toast -- adding one would saturate the UI with no actionable signal:
    //   - `interrupt_set` (~12-16% of all events) -- internal wake-flag machinery.
    //   - `re_bootstrap`, `node_registered`, `node_bootstrapped`,
    //     `life_services_confirmed`, `identity_updated`,
    //     `identity_pre_write_snapshot` -- node startup chatter.
    //   - `self_molt_token_issued`, `molt_lock_acquired`, `molt_lock_released`,
    //     `molt_self_token_expired` -- MOLT internal machinery (the user-facing
    //     branch above covers molt_requested / molt_executing / self_molt_completed).
    //   - `stale_session_auto_released`, `session_lock_cleared` -- session
    //     reaper internals (admin-visible via dashboard panels, not toasts).
    //   - `opa_granted` -- OPERATOR-issued, OPERATOR already knows.
    // If a new event type appears in /api/events that is not handled above
    // AND not listed here, treat as a scrub finding.

    // Trigger a data refresh on meaningful events
    if (type.indexOf('message') !== -1
      || type.indexOf('task') !== -1
      || type.indexOf('node') !== -1
      || type.indexOf('molt') !== -1
      || type.indexOf('bootstrap') !== -1) {
      // Debounce refresh
      if (SSE._refreshTimer) clearTimeout(SSE._refreshTimer);
      SSE._refreshTimer = setTimeout(function() {
        if (typeof App !== 'undefined' && App.refresh) {
          App.refresh();
        }
      }, 1000);
    }
  },

  disconnect: function() {
    if (SSE.source) {
      SSE.source.close();
      SSE.source = null;
    }
    if (SSE._pollTimer) {
      clearInterval(SSE._pollTimer);
      SSE._pollTimer = null;
    }
    SSE.connected = false;
  }
};
