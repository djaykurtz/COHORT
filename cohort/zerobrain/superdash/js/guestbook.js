/* Superdash v2 -- Authorization Panel (OPA Grants + MOLT Audit Trail) */

var Guestbook = {
  data: null,
  grants: null,
  hideSelfMolt: false,
  hideQcRenew: false,
  hideMolt: false,
  hideConsumedOpa: false,
  grantsCollapsed: true,
  auditCollapsed: true,

  async load() {
    var results = await Promise.all([
      DataStore.get('/api/molt/history', { maxAge: 30000 }),
      DataStore.get('/api/opa/active', { maxAge: 10000 }),
      DataStore.get('/api/opa/audit?limit=50', { maxAge: 10000 })
    ]);
    if (results[0]) Guestbook.data = results[0];
    Guestbook.grants = {
      active: (results[1] && results[1].elevations) || [],
      trail: (results[2] && results[2].trail) || []
    };
    return Guestbook.data;
  },

  // SWAT-20260612-0033: normalize an OPA audit entry to the unified render
  // shape consumed by renderAuditSection. OPA fields differ from MOLT:
  //   node_id (grantee) -> target_node_id
  //   granted_by (granter) -> requester_node_id
  //   status is derived from (revoked_at / consumed / neither) tristate
  // Extra OPA-only fields are preserved under .opa for the body renderer.
  _normalizeOpa: function(o) {
    var status;
    if (o.revoked_at) status = 'rejected';
    else if (o.consumed) status = 'completed';
    else status = 'approved';
    return {
      kind: 'opa',
      id: o.id,
      target_node_id: o.node_id,
      requester_node_id: o.granted_by,
      status: status,
      reason: o.reason || '--',
      created_at: o.created_at,
      created_at_epoch_ms: o.created_at_epoch_ms || (o.created_at ? new Date(o.created_at).getTime() : 0),
      opa: o
    };
  },

  renderPanel(skipFetch) {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Authorization';
    badge.textContent = '';

    if (!Guestbook.data && !Guestbook._loading) {
      Guestbook._loading = true;
      content.innerHTML = '<div class="loading-text">Loading authorization data...</div>';
      Guestbook.load().then(function() { Guestbook._loading = false; Guestbook.renderPanel(true); });
      return;
    }
    if (Guestbook._loading) {
      if (!Guestbook.data) content.innerHTML = '<div class="loading-text">Loading authorization data...</div>';
      return;
    }

    var html = '';

    // === OPA GRANTS SECTION (top) ===
    html += Guestbook.renderGrantsSection();

    // === MOLT AUDIT TRAIL (below) ===
    html += Guestbook.renderAuditSection();

    // === AUTH EVENTS (between Guestbook and Gate Registry) ===
    // Moved from Fleet tab per OPERATOR 2026-06-04.
    html += Guestbook.renderAuthEvents();

    // === GATE REGISTRY (bottom) ===
    html += Guestbook.renderGateRegistry();

    content.innerHTML = html;
    Guestbook._bindFilterEvents();
  },

  renderGrantsSection() {
    var grants = Guestbook.grants;
    var collapsed = Guestbook.grantsCollapsed;
    var html = '<div class="opa-grants-section' + (collapsed ? ' collapsed' : '') + '">';
    html += '<div class="opa-grants-header" onclick="Guestbook.toggleGrants()" style="cursor:pointer;user-select:none">';
    html += '<span class="auth-collapse-toggle">' + (collapsed ? '▶' : '▼') + '</span>';
    html += '<span class="opa-grants-title">OPA Grants</span>';

    if (!grants || !grants.active || !grants.active.length) {
      html += '<span class="opa-grants-badge">0 active</span>';
      html += '</div>';
      html += '<div class="opa-grants-body">';
      html += '<div class="opa-grants-empty">No active privilege elevations.</div>';
      html += '</div></div>';
      return html;
    }

    var active = grants.active;
    var trail = grants.trail || [];
    var expired = trail.filter(function(g) {
      return g.consumed || g.revoked_at || (g.expires_at && new Date(g.expires_at) <= new Date());
    });

    html += '<span class="opa-grants-badge">' + active.length + ' active</span>';
    html += '</div>';

    html += '<div class="opa-grants-body">';

    // Active elevations with Revoke button
    active.forEach(function(grant) {
      var nodeColor = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[grant.node_id]) || 'var(--text-primary)';
      var expiresStr = '--';
      if (grant.expires_at) {
        var expiresIn = Math.max(0, Math.floor((new Date(grant.expires_at) - new Date()) / 1000));
        expiresStr = expiresIn > 60 ? Math.floor(expiresIn / 60) + 'm' : expiresIn + 's';
      } else if (grant.scope_type === 'action') {
        expiresStr = 'single-use';
      }

      html += '<div class="opa-grant-card opa-grant-active">';
      html += '<div class="opa-grant-row">';
      html += '<span class="opa-grant-icon">⚡</span>';
      html += '<span class="opa-grant-node" style="color:' + nodeColor + '">' + Panels.esc(grant.node_id) + '</span>';
      html += '<span class="opa-grant-scope">' + Panels.esc(grant.scope_type || '--') + '</span>';
      if (grant.reason) {
        html += '<span class="opa-grant-scope-detail">→ ' + Panels.esc(grant.reason) + '</span>';
      }
      html += '<span class="opa-grant-expires">⏱ ' + expiresStr + '</span>';
      html += '</div>';
      if (grant.granted_by) {
        html += '<div class="opa-grant-meta">Granted by ' + Panels.esc(grant.granted_by) + '</div>';
      }
      html += '<div class="opa-grant-actions">';
      html += '<button class="opa-btn opa-btn-revoke" id="opa-revoke-' + Panels.esc(grant.id) + '" onclick="Guestbook.confirmRevoke(\'' + Panels.esc(grant.id) + '\')">⏹ Revoke</button>';
      html += '</div>';
      html += '</div>';
    });

    // Recent expired/revoked/consumed (audit trail)
    if (expired.length) {
      html += '<div class="opa-grants-expired-label">' + expired.length + ' expired/revoked/consumed</div>';
    }

    html += '</div></div>';
    return html;
  },

  renderAuditSection() {
    // SWAT-20260612-0033: merge MOLT requests + OPA audit trail entries into
    // one combined audit list, sorted by created_at desc. MOLT entries get
    // kind:'molt' added; OPA entries are normalized via _normalizeOpa.
    var moltRaw = (Guestbook.data && Guestbook.data.requests) || [];
    var molt = moltRaw.map(function(r) {
      var copy = Object.assign({}, r);
      copy.kind = 'molt';
      if (!copy.created_at_epoch_ms && copy.created_at) {
        copy.created_at_epoch_ms = new Date(copy.created_at).getTime();
      }
      return copy;
    });
    var opaRaw = (Guestbook.grants && Guestbook.grants.trail) || [];
    var opa = opaRaw.map(Guestbook._normalizeOpa);
    var combined = molt.concat(opa).sort(function(a, b) {
      return (b.created_at_epoch_ms || 0) - (a.created_at_epoch_ms || 0);
    });
    var collapsed = Guestbook.auditCollapsed;

    var filtered = combined.filter(function(entry) {
      if (Guestbook.hideMolt && entry.kind === 'molt') return false;
      if (Guestbook.hideConsumedOpa && entry.kind === 'opa' && entry.opa && entry.opa.consumed) return false;
      if (Guestbook.hideSelfMolt && entry.kind === 'molt' && entry.requester_node_id === entry.target_node_id) return false;
      var reason = (entry.reason || '').toLowerCase();
      if (Guestbook.hideQcRenew && (reason.indexOf('qc-renew') !== -1 || reason.indexOf('qc renew') !== -1)) return false;
      return true;
    });

    var badge = document.getElementById('main-panel-badge');
    var moltCount = filtered.filter(function(e) { return e.kind === 'molt'; }).length;
    var opaCount = filtered.filter(function(e) { return e.kind === 'opa'; }).length;
    badge.textContent = filtered.length + ' (' + moltCount + ' MOLT + ' + opaCount + ' OPA)';

    var html = '<div class="guestbook-audit-section' + (collapsed ? ' collapsed' : '') + '">';
    html += '<div class="guestbook-audit-header" onclick="Guestbook.toggleAudit()" style="cursor:pointer;user-select:none">';
    html += '<span class="auth-collapse-toggle">' + (collapsed ? '▶' : '▼') + '</span>';
    html += '<span class="guestbook-audit-title">AUTHORIZATION TRAIL</span>';
    html += '</div>';

    // Filter controls
    html += '<div class="guestbook-audit-body">';
    html += '<div class="guestbook-filters">'
      + '<label class="guestbook-filter-label"><input type="checkbox" id="gb-hide-selfmolt" '
      + (Guestbook.hideSelfMolt ? 'checked' : '') + '> Hide self-MOLT</label>'
      + '<label class="guestbook-filter-label"><input type="checkbox" id="gb-hide-qcrenew" '
      + (Guestbook.hideQcRenew ? 'checked' : '') + '> Hide QC-RENEW</label>'
      + '<label class="guestbook-filter-label"><input type="checkbox" id="gb-hide-molt" '
      + (Guestbook.hideMolt ? 'checked' : '') + '> Hide MOLT</label>'
      + '<label class="guestbook-filter-label"><input type="checkbox" id="gb-hide-consumed-opa" '
      + (Guestbook.hideConsumedOpa ? 'checked' : '') + '> Hide consumed OPA</label>'
      + '</div>';

    if (!filtered.length) {
      html += '<div class="empty-text">No matching entries</div>';
      html += '</div></div>';
      return html;
    }

    html += '<div class="guestbook-list">';

    filtered.forEach(function(entry) {
      var statusClass = Guestbook.statusClass(entry.status);
      var statusIcon = Guestbook.statusIcon(entry.status);
      var targetColor = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[entry.target_node_id]) || 'var(--text-primary)';
      var requesterColor = (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[entry.requester_node_id]) || 'var(--text-primary)';
      var timeStr = Guestbook.formatTime(entry.created_at);
      var relStr = Guestbook.formatRelativeDay(entry.created_at);
      var durationStr = entry.kind === 'molt' ? Guestbook.getDuration(entry) : '';
      var isSelf = entry.requester_node_id === entry.target_node_id;

      // SWAT-20260612-0033: kind-badge so OPERATOR can scan MOLT vs OPA at a glance
      var kindBadge = entry.kind === 'opa'
        ? '<span class="guestbook-kind-badge gb-kind-opa">OPA</span>'
        : '<span class="guestbook-kind-badge gb-kind-molt">MOLT</span>';

      html += '<div class="guestbook-entry ' + statusClass + '">';
      html += '<div class="guestbook-entry-header">';
      html += kindBadge;
      html += '<span class="guestbook-status-icon">' + statusIcon + '</span>';
      html += '<span class="guestbook-target" style="color:' + targetColor + '">' + Panels.esc(entry.target_node_id || '?') + '</span>';
      if (!isSelf && entry.requester_node_id) {
        html += '<span class="guestbook-arrow">←</span>';
        html += '<span class="guestbook-requester" style="color:' + requesterColor + '">' + Panels.esc(entry.requester_node_id) + '</span>';
      } else if (isSelf) {
        html += '<span class="guestbook-self-tag">self</span>';
      }
      html += '<span class="guestbook-relday">' + relStr + '</span>';
      html += '<span class="guestbook-time">' + timeStr + '</span>';
      html += '<span class="guestbook-status ' + statusClass + '">' + (entry.status || 'unknown').toUpperCase() + '</span>';
      html += '</div>';

      html += '<div class="guestbook-entry-body">';
      html += '<div class="guestbook-reason">' + Panels.esc(entry.reason || '--') + '</div>';

      if (entry.kind === 'opa' && entry.opa) {
        var o = entry.opa;
        if (o.action_type) {
          html += '<div class="guestbook-meta">Action: ' + Panels.esc(o.action_type) + (o.scope_type ? ' (' + Panels.esc(o.scope_type) + ')' : '') + '</div>';
        }
        if (o.delegation_chain) {
          var chain;
          try {
            chain = typeof o.delegation_chain === 'string' ? JSON.parse(o.delegation_chain) : o.delegation_chain;
          } catch (e) {
            chain = o.delegation_chain;
          }
          if (Array.isArray(chain) && chain.length > 1) {
            html += '<div class="guestbook-meta">Chain: ' + chain.map(Panels.esc).join(' → ') + '</div>';
          }
        }
        if (o.consumed && o.consumed_by_action) {
          html += '<div class="guestbook-meta">Consumed by: ' + Panels.esc(o.consumed_by_action) + '</div>';
        }
        if (o.revoked_at) {
          html += '<div class="guestbook-meta">Revoked' + (o.revoked_by ? ' by ' + Panels.esc(o.revoked_by) : '') + '</div>';
        }
        if (o.operator_directive) {
          html += '<div class="guestbook-meta">OPERATOR directive: ' + Panels.esc(o.operator_directive) + '</div>';
        }
      } else {
        // MOLT entries -- existing body shape
        if (entry.authorization) {
          html += '<div class="guestbook-auth-source">Auth: ' + Panels.esc(entry.authorization) + '</div>';
        }
        if (durationStr) {
          html += '<div class="guestbook-meta">Duration: ' + durationStr + '</div>';
        }
        if (entry.error) {
          html += '<div class="guestbook-error">' + Panels.esc(entry.error) + '</div>';
        }
        if (entry.execution_host) {
          html += '<div class="guestbook-meta">Host: ' + Panels.esc(entry.execution_host) + '</div>';
        }
        if (entry.old_pid || entry.new_pid) {
          html += '<div class="guestbook-meta">PID: ' + (entry.old_pid || '?') + ' → ' + (entry.new_pid || '?') + '</div>';
        }
      }

      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    html += '</div></div>';
    return html;
  },

  _bindFilterEvents() {
    var selfMoltCb = document.getElementById('gb-hide-selfmolt');
    var qcRenewCb = document.getElementById('gb-hide-qcrenew');
    var hideMoltCb = document.getElementById('gb-hide-molt');
    var hideConsumedOpaCb = document.getElementById('gb-hide-consumed-opa');
    if (selfMoltCb) {
      selfMoltCb.addEventListener('change', function() {
        Guestbook.hideSelfMolt = selfMoltCb.checked;
        Guestbook.renderPanel();
      });
    }
    if (qcRenewCb) {
      qcRenewCb.addEventListener('change', function() {
        Guestbook.hideQcRenew = qcRenewCb.checked;
        Guestbook.renderPanel();
      });
    }
    if (hideMoltCb) {
      hideMoltCb.addEventListener('change', function() {
        Guestbook.hideMolt = hideMoltCb.checked;
        Guestbook.renderPanel();
      });
    }
    if (hideConsumedOpaCb) {
      hideConsumedOpaCb.addEventListener('change', function() {
        Guestbook.hideConsumedOpa = hideConsumedOpaCb.checked;
        Guestbook.renderPanel();
      });
    }
  },

  toggleGrants() {
    Guestbook.grantsCollapsed = !Guestbook.grantsCollapsed;
    Guestbook.renderPanel(true);
  },

  _revokeTimers: {},

  confirmRevoke(opaId) {
    var btn = document.getElementById('opa-revoke-' + opaId);
    if (!btn) return;
    // Already in confirm state -- do the revoke
    if (btn.dataset.confirming === 'true') {
      Guestbook.revokeOpa(opaId);
      return;
    }
    // Enter confirm state
    btn.dataset.confirming = 'true';
    btn.textContent = '✕ Confirm Revoke?';
    btn.classList.add('opa-btn-confirm');
    // Revert after 4 seconds
    if (Guestbook._revokeTimers[opaId]) clearTimeout(Guestbook._revokeTimers[opaId]);
    Guestbook._revokeTimers[opaId] = setTimeout(function() {
      btn.dataset.confirming = '';
      btn.textContent = '⏹ Revoke';
      btn.classList.remove('opa-btn-confirm');
    }, 4000);
  },

  async revokeOpa(opaId) {
    var btn = document.getElementById('opa-revoke-' + opaId);
    if (btn) { btn.textContent = '⏳ Revoking...'; btn.disabled = true; }
    var result = await API.opaRevoke(opaId);
    if (result && result.error) {
      if (btn) { btn.textContent = '⚠ ' + result.error; }
      await new Promise(function(r) { setTimeout(r, 1500); });
    }
    // Optimistically remove grant from local data -- card disappears immediately
    if (Guestbook.grants && Guestbook.grants.active) {
      Guestbook.grants.active = Guestbook.grants.active.filter(function(g) { return g.id !== opaId; });
    }
    Guestbook.renderPanel(true);
    // Invalidate DataStore cache + background sync
    DataStore.invalidate(['/api/opa/active', '/api/opa/audit?limit=10']);
    Guestbook.load().then(function() { Guestbook.renderPanel(true); });
  },

  toggleAudit() {
    Guestbook.auditCollapsed = !Guestbook.auditCollapsed;
    Guestbook.renderPanel(true);
  },

  gateRegistryCollapsed: true,
  gateExpandedRows: {},
  gateCategoryCollapsed: {},

  toggleGateCategory(catKey) {
    var current = catKey in Guestbook.gateCategoryCollapsed ? Guestbook.gateCategoryCollapsed[catKey] : true;
    Guestbook.gateCategoryCollapsed[catKey] = !current;
    var el = document.querySelector('[data-gate-cat="' + catKey + '"]');
    if (el) el.classList.toggle('collapsed');
    var header = el ? el.querySelector('.gate-category-header') : null;
    if (header) header.setAttribute('aria-expanded', current ? 'true' : 'false');
    var table = document.querySelector('[data-gate-cat-table="' + catKey + '"]');
    if (table) table.style.display = Guestbook.gateCategoryCollapsed[catKey] ? 'none' : '';
  },

  toggleGateRegistry() {
    Guestbook.gateRegistryCollapsed = !Guestbook.gateRegistryCollapsed;
    Guestbook.renderPanel();
  },

  toggleGateRow(key) {
    Guestbook.gateExpandedRows[key] = !Guestbook.gateExpandedRows[key];
    var row = document.querySelector('[data-gate-key="' + key + '"]');
    if (row) row.classList.toggle('expanded');
    var descEl = document.querySelector('[data-gate-desc="' + key + '"]');
    if (descEl) descEl.style.display = Guestbook.gateExpandedRows[key] ? 'block' : 'none';
  },

  renderGateRegistry() {
    var categories = {
      'Auth & Boot': { icon: '🔐', gates: [
        { api: 'REST middleware', gate: 'Bearer token', desc: 'All /api/* endpoints authenticated via AUTH_TOKEN header or X-Node-Token', requires: 'Valid bearer token or session token' },
        { api: 'REST middleware', gate: 'AUTH_TOKEN fail-closed', desc: 'All REST endpoints reject requests when AUTH_TOKEN env var is unset on the server', requires: 'AUTH_TOKEN configured' },
        { api: 'REST middleware', gate: 'X-Node-Token identity', desc: 'Allows node session token to bypass Bearer auth and identify the caller', requires: 'Valid node session token' },
        { api: 'REST middleware', gate: 'X-Auth-Token shared secret', desc: 'Fleet-level REST auth fallback via shared secret header', requires: 'X-Auth-Token == AUTH_TOKEN' },
        { api: 'MCP write tools', gate: 'session identity', desc: 'All MCP write operations require caller identity resolution from _session_token', requires: 'Valid _session_token resolving to a node' },
        { api: 'MCP read tools', gate: 'identified caller', desc: 'Read MCP tools also require identity verification', requires: 'Verified identity via token/bootstrap' },
        { api: 'Boot passphrase', gate: 'validate_boot_passphrase', desc: 'First check_inbox after bootstrap requires correct passphrase when enforcement is active', requires: 'Correct passphrase' },
        { api: 'POST /api/shutdown', gate: 'coordinator_shutdown', desc: 'Graceful coordinator process shutdown', requires: 'Bearer AUTH_TOKEN or PM/sudo' },
        { api: 'POST /api/graceful-restart', gate: 'coordinator_restart', desc: 'Graceful coordinator restart', requires: 'Bearer AUTH_TOKEN or PM/sudo' },
        { api: 'PUT /api/passphrase-enforcement', gate: 'set_passphrase_enforcement', desc: 'Toggle boot passphrase enforcement on/off', requires: 'PM role or sudo grant' },
        { api: 'POST /api/release-session', gate: 'self-service', desc: 'Release own session lock for re-bootstrap', requires: 'Authenticated node matching body node_id' },
        { api: 'MCP release_session', gate: 'self-only', desc: 'Release own session token via MCP', requires: 'Authenticated node matching node_id' },
        { api: 'GET /api/boot-manifest/{id}', gate: 'get_boot_manifest', desc: 'Get full boot config files for a node', requires: 'Self node or PM/sudo' },
        { api: 'MCP get_boot_manifest', gate: 'self-or-privileged', desc: 'Fetch boot manifest via MCP', requires: 'Own node or PM/sudo' },
        { api: 'MCP request_sudo', gate: 'authenticated-node', desc: 'Request sudo elevation for a privileged action', requires: 'Authenticated node (not DASHBOARD)' },
        { api: 'MCP grant_sudo', gate: 'PM/OPERATOR', desc: 'Approve a pending sudo grant', requires: 'PM role or OPERATOR/DASHBOARD' },
        { api: 'MCP revoke_sudo', gate: 'PM/OPERATOR', desc: 'Revoke an active sudo grant early', requires: 'PM role or OPERATOR/DASHBOARD' },
        { api: 'MCP update_identity', gate: 'self or PM/sudo', desc: 'Edit identity profile fields -- self edits always allowed, cross-node needs PM', requires: 'Self (own profile) or PM/sudo' },
        { api: 'DB issue_authority_token', gate: 'issuer role', desc: 'Mint authority tokens for fleet operations', requires: 'PM role (unless DASHBOARD) or sudo' },
        { api: 'DB update_identity', gate: 'privileged-field gate', desc: 'Some identity fields (operator_notes, etc.) require PM/sudo to edit', requires: 'PM role or sudo for protected fields' },
      ]},
      'Lifecycle & MOLT': { icon: '♻️', gates: [
        { api: 'POST /api/molt/request', gate: 'request_node_restart', desc: 'Request a MOLT (restart) for a target node with OPA audit record', requires: 'PM role or sudo grant' },
        { api: 'POST /api/molt/execute', gate: 'execute_molt', desc: 'Execute an approved MOLT request -- acquires lock, kills + reboots', requires: 'PM role or sudo grant' },
        { api: 'POST /api/molt/moratorium', gate: 'set_molt_moratorium', desc: 'Set or clear fleet-wide MOLT moratorium -- blocks all MOLT requests when active', requires: 'PM role or sudo grant' },
        { api: 'POST /api/molt/confirm-self', gate: 'self-target token', desc: 'Confirm self-MOLT execution for unreachable hosts', requires: 'Target node\'s own session token + self-MOLT token' },
        { api: 'MCP execute_molt', gate: 'PM/sudo', desc: 'Execute approved MOLT via MCP tool', requires: 'PM role or sudo grant' },
        { api: 'MCP set_molt_moratorium', gate: 'PM/sudo', desc: 'Set/clear MOLT moratorium via MCP', requires: 'PM role or sudo grant' },
        { api: 'MCP set_node_lifecycle', gate: 'self-benign or PM/sudo', desc: 'Set lifecycle state -- nodes can self-set benign states (running/saving)', requires: 'Self for benign, PM/sudo for all' },
        { api: 'DB request_node_restart', gate: 'restart privilege', desc: 'Database-level restart gate with ESG-A1 safety gates (KB validation, cooldown, circuit breaker)', requires: 'PM or sudo; self-nomination always allowed' },
      ]},
      'Node Management': { icon: '🖥️', gates: [
        { api: 'MCP set_role', gate: 'set_role', desc: 'Change a node\'s active role (architect, builder, reviewer, analyst, pm)', requires: 'PM role or sudo grant' },
        { api: 'MCP set_node_active_status', gate: 'set_node_active_status', desc: 'Activate/deactivate a node -- controls broadcasts and superdash visibility', requires: 'PM role or sudo grant' },
        { api: 'MCP clear_session_lock', gate: 'clear_session_lock', desc: 'Clear stale session lock so node can re-bootstrap -- only works on stale/recovery targets', requires: 'AUTH_TOKEN + stale/recovery target' },
        { api: 'MCP create_peer_challenge', gate: 'create_peer_challenge', desc: 'Challenge a peer node\'s health with HMAC -- rate limited 1 per pair per 5 min', requires: 'PM role or sudo grant' },
        { api: 'PUT /api/topo/static', gate: 'set_topo_static', desc: 'Write static topology config (topo_s)', requires: 'PM role or sudo grant' },
        { api: 'GET /api/topo/static/history', gate: 'set_topo_static', desc: 'View topo_s edit changelog', requires: 'PM role or sudo grant' },
      ]},
      'Task Management': { icon: '📋', gates: [
        { api: 'POST /api/tasks/{id}/review-ack', gate: 'node-token', desc: 'Submit review ACK -- caller node_id forced to authenticated identity', requires: 'Authenticated node (not DASHBOARD)' },
        { api: 'MCP cancel_task', gate: 'cancel_task', desc: 'Cancel a task', requires: 'PM role or sudo grant' },
        { api: 'DB update_task (→review)', gate: 'deliverable gate', desc: 'Moving task to review requires at least one deliverable (scratch or artifact)', requires: 'Non-PM needs deliverable; PM bypasses' },
        { api: 'DB update_task (→done)', gate: 'review ACK gate', desc: 'Moving task to done requires at least 1 approved review ACK', requires: 'Non-PM needs approvals; PM bypasses' },
        { api: 'DB add_review_ack', gate: 'self-ACK blocked', desc: 'Reject self-approval -- reviewer cannot be the task assignee', requires: 'Different node than assignee (unless PM)' },
      ]},
      'Messaging': { icon: '💬', gates: [
        { api: 'POST /api/messages', gate: 'sender identity', desc: 'Send a message -- from_node forced to authenticated caller', requires: 'Authenticated node (not DASHBOARD)' },
        { api: 'POST /api/messages/broadcast', gate: 'sender identity', desc: 'Broadcast message fleet-wide -- from_node forced to caller', requires: 'Authenticated node (not DASHBOARD)' },
        { api: 'GET /api/messages/{node_id}', gate: 'read_cross_node', desc: 'Read another node\'s inbox', requires: 'Self node or PM/sudo' },
        { api: 'GET /api/wait/{node_id}', gate: 'read_cross_node', desc: 'Long-poll wait on another node\'s inbox', requires: 'Self node or PM/sudo' },
        { api: 'GET /api/stream/{node_id}', gate: 'per-node SSE', desc: 'Per-node live event stream', requires: 'Self node or PM/sudo' },
        { api: 'GET /api/stream', gate: 'fleet SSE', desc: 'Fleet-wide live event stream', requires: 'DASHBOARD or PM/sudo' },
        { api: 'GET /api/events/{node_id}', gate: 'subscribe_sse', desc: 'Legacy SSE event stream subscription', requires: 'Self node or PM/sudo' },
      ]},
      'Fleet Operations': { icon: '⚡', gates: [
        { api: 'POST /api/interrupt/all', gate: 'role: analyst|pm', desc: 'Set interrupt flag for all nodes -- triggers immediate check-in', requires: 'Analyst or PM role' },
        { api: 'POST /api/interrupt/{id}', gate: 'role: self|analyst|arch|pm', desc: 'Set interrupt for a single node', requires: 'Self, analyst, architect, or PM' },
        { api: 'MCP set_fleet_attention', gate: 'set_fleet_attention', desc: 'Set fleet attention mode (HOT/WARM/COLD) -- HOT triggers rapid polling', requires: 'Analyst/PM or sudo for HOT' },
        { api: 'POST /api/maintenance/mode', gate: 'maintenance_mode', desc: 'Toggle coordinator maintenance mode', requires: 'PM role or sudo grant' },
      ]},
      'Cairn & Knowledge': { icon: '🏔️', gates: [
        { api: 'MCP cairn_wave', gate: 'PM-only', desc: 'Open an RFC discussion wave', requires: 'PM role' },
        { api: 'MCP cairn_close_wave', gate: 'PM-only', desc: 'Close an RFC wave', requires: 'PM role' },
        { api: 'MCP cairn_synthesize', gate: 'PM-only', desc: 'Write wave synthesis summary', requires: 'PM role' },
        { api: 'MCP cairn_solidplan', gate: 'PM-only', desc: 'Attach solidplan (consensus seal) to an RFC', requires: 'PM role' },
        { api: 'MCP cairn_ratify', gate: 'OPERATOR-only', desc: 'Ratify an RFC after vote gates are met', requires: 'OPERATOR only' },
        { api: 'MCP cairn_star', gate: 'OPERATOR-only', desc: 'Star a seed (auto-promotes to RFC) or response', requires: 'OPERATOR only' },
        { api: 'MCP cairn_frame', gate: 'OPERATOR-only', desc: 'Add OPERATOR framing comment to a response', requires: 'OPERATOR only' },
        { api: 'MCP cairn_archive', gate: 'PM/architect/OPERATOR', desc: 'Archive a seed or RFC', requires: 'PM, architect, or OPERATOR' },
        { api: 'MCP cairn_edit_response', gate: 'author-only', desc: 'Edit your own RFC response -- wave must be open', requires: 'Response author only' },
        { api: 'MCP cairn_kb_create', gate: 'knowledge-worker', desc: 'Create a KB article', requires: 'Architect, PM, reviewer, or analyst' },
        { api: 'MCP cairn_kb_publish', gate: 'knowledge-worker', desc: 'Publish a KB article (draft → published)', requires: 'Architect, PM, reviewer, or analyst' },
      ]},
      'Scripts & Files': { icon: '📜', gates: [
        { api: 'MCP delete_script', gate: 'delete_script', desc: 'Delete a published script from the portal', requires: 'PM role or sudo grant' },
        { api: 'POST /api/drop/{id}', gate: 'drop delete', desc: 'Delete a drop file', requires: 'Authenticated node with ownership' },
      ]},
    };

    var totalGates = 0;
    Object.keys(categories).forEach(function(cat) { totalGates += categories[cat].gates.length; });

    var collapsed = Guestbook.gateRegistryCollapsed;
    var html = '<div class="gate-registry-section' + (collapsed ? ' collapsed' : '') + '">';
    html += '<div class="gate-registry-header" onclick="Guestbook.toggleGateRegistry()" style="cursor:pointer;user-select:none">';
    html += '<span class="auth-collapse-toggle">' + (collapsed ? '▶' : '▼') + '</span>';
    html += '<span class="gate-registry-title">Gate Registry</span>';
    html += '<span class="gate-registry-badge">' + totalGates + ' gates</span>';
    html += '</div>';

    if (!collapsed) {
      html += '<div class="gate-registry-body">';
      html += '<div class="gate-registry-desc">Every authorization gate enforced by the coordinator. Click a row to expand its description.</div>';

      var catKeys = Object.keys(categories);
      catKeys.forEach(function(catName) {
        var cat = categories[catName];
        var catKey = catName.replace(/[^a-z]/gi, '');
        var catCollapsed = catKey in Guestbook.gateCategoryCollapsed ? Guestbook.gateCategoryCollapsed[catKey] : true;
        var catBodyId = 'gate-cat-body-' + catKey;
        html += '<div class="gate-category' + (catCollapsed ? ' collapsed' : '') + '" data-gate-cat="' + catKey + '">';
        html += '<button type="button" class="gate-category-header" onclick="Guestbook.toggleGateCategory(\'' + catKey + '\')" aria-expanded="' + (!catCollapsed) + '" aria-controls="' + catBodyId + '" style="cursor:pointer;user-select:none">';
        html += '<span class="gate-category-toggle">' + (catCollapsed ? '&#9654;' : '&#9660;') + '</span>';
        html += '<span class="gate-category-icon">' + cat.icon + '</span>';
        html += '<span class="gate-category-name">' + Panels.esc(catName) + '</span>';
        html += '<span class="gate-category-count">' + cat.gates.length + '</span>';
        html += '</button>';

        html += '<table class="gate-registry-table" id="' + catBodyId + '" data-gate-cat-table="' + catKey + '"' + (catCollapsed ? ' style="display:none"' : '') + '>';
        html += '<thead><tr><th>API / Tool</th><th>Gate</th><th>Requirements</th></tr></thead><tbody>';

        cat.gates.forEach(function(g, idx) {
          var key = catName.replace(/[^a-z]/gi, '') + '-' + idx;
          var isExpanded = Guestbook.gateExpandedRows[key];
          html += '<tr class="gate-row' + (isExpanded ? ' expanded' : '') + '" data-gate-key="' + key + '" onclick="Guestbook.toggleGateRow(\'' + key + '\')" style="cursor:pointer">';
          html += '<td class="gate-api"><code>' + Panels.esc(g.api) + '</code></td>';
          html += '<td class="gate-name"><code>' + Panels.esc(g.gate) + '</code></td>';
          html += '<td class="gate-req">' + Panels.esc(g.requires) + '</td>';
          html += '</tr>';
          html += '<tr class="gate-desc-row"><td colspan="3"><div class="gate-desc-expand" data-gate-desc="' + key + '" style="display:' + (isExpanded ? 'block' : 'none') + '">' + Panels.esc(g.desc) + '</div></td></tr>';
        });

        html += '</tbody></table></div>';
      });

      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  statusClass: function(status) {
    switch (status) {
      case 'completed': return 'status-success';
      case 'approved': return 'status-info';
      case 'pending': return 'status-warning';
      case 'expired': return 'status-muted';
      case 'failed': return 'status-error';
      case 'rejected': return 'status-error';
      default: return 'status-muted';
    }
  },

  statusIcon: function(status) {
    switch (status) {
      case 'completed': return '✓';
      case 'approved': return '⟳';
      case 'pending': return '◌';
      case 'expired': return '⏱';
      case 'failed': return '✗';
      case 'rejected': return '⊘';
      default: return '·';
    }
  },

  formatTime: function(isoStr) {
    if (!isoStr) return '--';
    try {
      var d = new Date(isoStr);
      var now = new Date();
      var diffMs = now - d;
      var diffH = Math.floor(diffMs / 3600000);
      var tz = d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

      if (diffH < 24) {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tz;
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' '
        + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tz;
    } catch (e) {
      return '--';
    }
  },

  getDuration: function(entry) {
    if (!entry.created_at_epoch_ms) return '';
    var end = entry.completed_at_epoch_ms || entry.executed_at_epoch_ms;
    if (!end) return '';
    var secs = Math.floor((end - entry.created_at_epoch_ms) / 1000);
    return Panels.formatDuration(secs);
  },

  // Calendar-day-aware relative label. "Today," / "Yesterday," / "N days ago,"
  // (anchored to local midnight, not raw 24h windows -- 00:30 today vs 23:30
  // yesterday should still read "Today,") -- OPERATOR 2026-06-04.
  formatRelativeDay: function(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      var now = new Date();
      var midToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var midEntry = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var days = Math.round((midToday - midEntry) / 86400000);
      if (days <= 0) return 'Today,';
      if (days === 1) return 'Yesterday,';
      return days + ' days ago,';
    } catch (e) {
      return '';
    }
  },

  authEventsCollapsed: true,

  toggleAuthEvents: function() {
    Guestbook.authEventsCollapsed = !Guestbook.authEventsCollapsed;
    Guestbook.renderPanel(true);
  },

  // Auth Events panel -- moved from Fleet tab into Authorization tab per
  // OPERATOR 2026-06-04 ("Auth Events belongs with the other auth stuff").
  // Counts breakglass overrides in the last 24h, pulled from App.lastFleet
  // (originally surfaced by RFC376 D4c via /api/fleet's breakglass_overrides_24h).
  renderAuthEvents: function() {
    var fleet = (typeof App !== 'undefined' && App.lastFleet) ? App.lastFleet : null;
    var count = (fleet && typeof fleet.breakglass_overrides_24h === 'number')
      ? fleet.breakglass_overrides_24h
      : null;
    var collapsed = Guestbook.authEventsCollapsed;

    var html = '<div class="guestbook-authevents-section' + (collapsed ? ' collapsed' : '') + '">';
    html += '<div class="guestbook-authevents-header" onclick="Guestbook.toggleAuthEvents()" style="cursor:pointer;user-select:none">';
    html += '<span class="auth-collapse-toggle">' + (collapsed ? '▶' : '▼') + '</span>';
    html += '<span class="guestbook-authevents-title">AUTH EVENTS</span>';
    var badgeText, badgeCls;
    if (count === null) { badgeText = '--'; badgeCls = 'unknown'; }
    else if (count === 0) { badgeText = '0 / 24h'; badgeCls = 'ok'; }
    else if (count <= 3) { badgeText = count + ' / 24h'; badgeCls = 'degraded'; }
    else { badgeText = count + ' / 24h'; badgeCls = 'critical'; }
    html += '<span class="guestbook-authevents-badge ' + badgeCls + '">' + badgeText + '</span>';
    html += '</div>';

    html += '<div class="guestbook-authevents-body">';
    if (count === null) {
      html += '<div class="empty-text">No auth data available yet.</div>';
    } else {
      var statusLabel = count === 0
        ? 'No OPERATOR breakglass overrides in the last 24 hours.'
        : count + ' OPERATOR breakglass override' + (count === 1 ? '' : 's') + ' in the last 24 hours.';
      html += '<div class="guestbook-authevents-counter ' + badgeCls + '">'
        + count
        + ' <span class="guestbook-authevents-counter-label">breakglass overrides (24h)</span>'
        + '</div>';
      html += '<div class="guestbook-authevents-detail">' + statusLabel + '</div>';
      html += '<div class="guestbook-authevents-hint">'
        + 'RFC376 D4c: counts audit_log events with event_type=emergency_operator_override '
        + '(OPERATOR-token writes bypassing normal auth). Surfaced via RFC421 contract-drift fix.'
        + '</div>';
    }
    html += '</div></div>';
    return html;
  }
};
