/* Superdash v2 -- Task Board (Kanban) -- RFC-FDDB12 P1
 *
 * Full kanban: backlog -> ready -> in_progress -> review -> done
 * Write actions: change status, reassign
 * Uses FleetState (DataStore) for live data, Components for UI
 */

var TaskBoard = {
  data: null,
  swats: null,
  swatLoadError: null,
  swatCounts: null,
  _subscribed: false,
  _swatsLoadedAt: 0,
  _swatCountsLoadedAt: 0,
  ENDPOINT: '/api/tasks?include_completed=false',
  SWAT_MAX_AGE_MS: 30000,
  SWAT_COUNT_STAGES: ['open', 'in_review', 'fixed'], // SWAT-20260821-0009: fixed-but-unclosed is real workload
  SWAT_STAGE_ORDER: { 'open': 0, 'in_review': 1, 'fixed': 2 },
  SWAT_SEVERITY_COLORS: {
    'critical': 'var(--error)',
    'high': 'var(--error)',
    'medium': 'var(--warn)',
    'low': 'var(--text-secondary)'
  },

  COLUMNS: [
    { key: 'swats',       label: 'SWATs',       color: 'var(--error)', kind: 'swat' },
    { key: 'ready',       label: 'Ready',       color: 'var(--accent)' },
    { key: 'in_progress', label: 'In Progress', color: 'var(--success)' },
    { key: 'review',      label: 'Review',      color: 'var(--purple)' }
    // 'backlog' column repurposed 2026-06-09 (UXIA, SWAT-20260610-0007): always
    // empty in practice (board_summary.backlog=0 historically; fleet creates
    // tasks directly into ready/in_progress). Slot now surfaces open/in_review/
    // fixed SWATs from /api/swats for at-a-glance visibility.
    // 'done' column removed 2026-06-06 (UXIA, OPERATOR-direct): wasted real
    // estate -- /api/tasks?include_completed=false already excludes done
    // tasks from the payload, so the column was always empty in practice.
    // Removing widens the remaining 4 columns.
  ],

  STATUSES: ['backlog', 'ready', 'in_progress', 'review', 'blocked', 'done', 'cancelled'],

  NODES: Object.keys(CONFIG.NODE_COLORS || {}),

  // ── Data ──

  async load() {
    var result = await DataStore.get(TaskBoard.ENDPOINT, { maxAge: 15000 });
    if (result) TaskBoard.data = result;

    if (!TaskBoard._subscribed) {
      TaskBoard._subscribed = true;
      DataStore.subscribe(TaskBoard.ENDPOINT, function(data) {
        TaskBoard.data = data;
        if (App.currentTab === 'taskboard') TaskBoard.renderPanel();
      });
    }

    // Fetch SWATs in parallel-ish (best-effort; render proceeds w/o them)
    var now = Date.now();
    if (!TaskBoard.swats || (now - TaskBoard._swatsLoadedAt) > TaskBoard.SWAT_MAX_AGE_MS) {
      TaskBoard._swatsLoadedAt = now;
      API.getSwats().then(function(s) {
        TaskBoard.swats = s.swats;
        TaskBoard.swatLoadError = null;
        if (App.currentTab === 'taskboard') TaskBoard.renderPanel();
      }).catch(function(err) {
        TaskBoard._swatsLoadedAt = 0;
        TaskBoard.swatLoadError = {
          stage: err && err.stage ? err.stage : 'unknown',
          message: err && err.message ? err.message : 'Active SWAT data is incomplete'
        };
        if (App.currentTab === 'taskboard') TaskBoard.renderPanel();
      });
    }
    // SWAT-20260612-0001 Defect-B fix: authoritative unbounded counts for
    // top-of-board badge + column-header totals (independent of list-fetch
    // page caps). Per-stage parallel calls keyed on SWAT_COUNT_STAGES so the
    // badge survives open>list-cap (e.g. when open exceeds the 200/stage
    // list cap from SWAT-0031 Defect-A). Best-effort: badge falls back to
    // prior list-length behavior if counts haven't loaded yet.
    if (!TaskBoard.swatCounts || (now - TaskBoard._swatCountsLoadedAt) > TaskBoard.SWAT_MAX_AGE_MS) {
      TaskBoard._swatCountsLoadedAt = now;
      var countCalls = TaskBoard.SWAT_COUNT_STAGES.map(function(st) {
        return API.getSwatsCount(st)
          .then(function(n) { return { stage: st, count: n }; })
          .catch(function() { return { stage: st, count: null }; });
      });
      Promise.all(countCalls).then(function(results) {
        var counts = {};
        results.forEach(function(r) { counts[r.stage] = r.count; });
        TaskBoard.swatCounts = counts;
        if (App.currentTab === 'taskboard') TaskBoard.renderPanel();
      });
    }
    return TaskBoard.data;
  },

  _getSwats: function() {
    var swats = (TaskBoard.swats || []).slice();
    var order = TaskBoard.SWAT_STAGE_ORDER;
    swats.sort(function(a, b) {
      var sa = order[a.stage] !== undefined ? order[a.stage] : 99;
      var sb = order[b.stage] !== undefined ? order[b.stage] : 99;
      if (sa !== sb) return sa - sb;
      return (b.created_at_epoch_ms || 0) - (a.created_at_epoch_ms || 0);
    });
    return swats;
  },

  _getTasks: function() {
    if (!TaskBoard.data) return [];
    return TaskBoard.data.tasks || TaskBoard.data || [];
  },

  // ── Render ──

  // SWAT-20260703-OPERATOR: renderPanel() was firing a full `content.innerHTML =`
  // teardown+rebuild on EVERY DataStore poll tick (every 15s for this endpoint),
  // even when the underlying data hadn't changed. That destroyed the
  // <blocked-banner> <details> open/closed DOM state every cycle (the comment
  // claiming "survives re-render" was true for incremental patching, false for
  // full innerHTML replace -- OPERATOR observed the section "randomly
  // collapsing"), reset scroll position, and repeatedly re-triggered the
  // stale-data badge ("cached data Ns ago" popping every ~15-30s). Guard below
  // skips the rebuild when nothing rendered actually changed.
  _lastRenderSig: null,

  renderPanel: function() {
    var content = Components.setupPanel('Task Board', '');

    if (!TaskBoard.data) {
      content.innerHTML = Components.loading('Loading tasks...');
      TaskBoard.load().then(function() { TaskBoard.renderPanel(); });
      return;
    }

    var tasks = TaskBoard._getTasks();
    if (!Array.isArray(tasks)) {
      content.innerHTML = Components.empty('No task data');
      return;
    }

    var grouped = {};
    TaskBoard.COLUMNS.forEach(function(c) { grouped[c.key] = []; });
    var blockedTasks = [];

    tasks.forEach(function(t) {
      if (t.status === 'blocked') {
        blockedTasks.push(t);
      } else if (grouped[t.status]) {
        grouped[t.status].push(t);
      }
    });

    // Count active (non-done; exclude SWAT-kind columns from task-count badge)
    var active = 0;
    TaskBoard.COLUMNS.forEach(function(c) {
      if (c.key !== 'done' && c.kind !== 'swat') active += grouped[c.key].length;
    });
    active += blockedTasks.length;

    // SWAT-20260612-0001 Defect-B: top-of-board badge sources from authoritative
    // count (sum of SWAT_COUNT_STAGES) when loaded; falls back to list-length
    // until first count-fetch resolves. List-length under-reports once open
    // exceeds the 200/stage cap from SWAT-0031 Defect-A; authoritative COUNT(*)
    // is unbounded.
    var swatCount;
    if (TaskBoard.swatCounts) {
      swatCount = 0;
      TaskBoard.SWAT_COUNT_STAGES.forEach(function(st) {
        if (typeof TaskBoard.swatCounts[st] === 'number') swatCount += TaskBoard.swatCounts[st];
      });
    } else {
      swatCount = (TaskBoard.swats || []).length;
    }
    var swatLabel = swatCount ? ' \u00b7 ' + swatCount + ' SWAT' + (swatCount === 1 ? '' : 's') : '';
    var badgeEl = document.getElementById('main-panel-badge');
    if (badgeEl) badgeEl.textContent = active + ' active' + (blockedTasks.length ? ' \u00b7 ' + blockedTasks.length + ' blocked' : '') + swatLabel;

    var staleHtml = Components.staleBadge(TaskBoard.ENDPOINT);
    var html = '';

    // Blocked banner -- collapsible, collapsed by default (OPERATOR request 2026-06-25).
    // Native <details>/<summary>: no JS wiring, accessible, survives re-render.
    if (blockedTasks.length) {
      html += '<details class="blocked-banner" style="margin-bottom:10px;padding:8px 12px;background:rgba(248,81,73,0.06);border:1px solid rgba(248,81,73,0.2);border-radius:6px;font-size:11px">';
      html += '<summary style="color:var(--error);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">'
        + '<span class="blocked-caret" aria-hidden="true">\u25b6</span>'
        + '<span>\u26a0 ' + blockedTasks.length + ' blocked</span>'
        + '</summary>';
      html += '<div style="margin-top:6px">';
      blockedTasks.forEach(function(t) {
        var color = Components.nodeColor(t.assigned_to);
        html += '<div style="margin-top:4px;display:flex;gap:8px;align-items:center">'
          + '<span style="color:var(--text-secondary)">' + Components.esc(t.title || t.task_id) + '</span>'
          + '<span style="color:' + color + ';font-size:10px;font-family:\'JetBrains Mono\',monospace">' + (t.assigned_to || '--') + '</span>'
          + '<button class="kanban-action-btn" data-action="status" data-task-id="' + Components.esc(t.task_id) + '" style="display:inline">Status</button>'
          + '</div>';
      });
      html += '</div>';
      html += '</details>';
    }

    html += '<div class="kanban">';

    TaskBoard.COLUMNS.forEach(function(col) {
      var isSwat = col.kind === 'swat';
      var items = isSwat ? TaskBoard._getSwats() : grouped[col.key];
      var countLabel;
      if (isSwat && TaskBoard.swats === null) {
        countLabel = TaskBoard.swatLoadError ? '!' : '\u2026';
      } else if (isSwat && TaskBoard.swatCounts) {
        // SWAT-20260612-0001 Defect-B: surface authoritative-vs-rendered when
        // the count exceeds visible items (signals "N hidden beyond fetch cap").
        var authCount = 0;
        TaskBoard.SWAT_COUNT_STAGES.forEach(function(st) {
          if (typeof TaskBoard.swatCounts[st] === 'number') authCount += TaskBoard.swatCounts[st];
        });
        countLabel = (authCount > items.length) ? (items.length + '/' + authCount) : authCount;
      } else {
        countLabel = items.length;
      }
      html += '<div class="kanban-col col-' + col.key + '">'
        + '<div class="kanban-col-header">'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<span class="col-indicator" style="background:' + col.color + '"></span>'
        + '<span class="kanban-col-title">' + col.label + '</span>'
        + '</div>'
        + '<span class="kanban-col-count">' + countLabel + '</span>'
        + '</div>'
        + '<div class="kanban-col-body">';

      if (isSwat && TaskBoard.swatLoadError) {
        var failedStage = Components.esc(TaskBoard.swatLoadError.stage);
        var retainedCopy = items.length
          ? ' Showing last-known-good data.'
          : ' No reliable active-SWAT list is available.';
        html += '<div class="swat-data-unavailable" role="status" style="margin:8px;padding:8px;border:1px solid var(--warn);border-radius:5px;color:var(--warn);font-size:10px">'
          + 'SWAT data unavailable: ' + failedStage + ' stage incomplete.' + retainedCopy
          + '</div>';
      }

      if (items.length === 0) {
        if (isSwat && TaskBoard.swatLoadError) {
          // The explicit unavailable state above is authoritative; never
          // collapse an incomplete fetch into a successful empty-board claim.
        } else if (isSwat && TaskBoard.swats === null) {
          html += '<div style="padding:12px;text-align:center;font-size:10px;color:var(--text-tertiary);font-style:italic">Loading SWATs\u2026</div>';
        } else {
          html += '<div style="padding:12px;text-align:center;font-size:10px;color:var(--text-tertiary);font-style:italic">' + (isSwat ? 'No active SWATs' : 'No tasks') + '</div>';
        }
      }

      items.forEach(function(item) {
        html += isSwat ? TaskBoard._renderSwatCard(item) : TaskBoard._renderCard(item);
      });

      html += '</div></div>';
    });

    html += '</div>';

    // Change-detection guard: `html` here holds only the volatility-free
    // board content (blocked-banner + kanban columns) -- errorBanner/
    // staleHtml are deliberately excluded since the stale badge's age-label
    // text changes every render even when the underlying data hasn't, which
    // would defeat a naive full-string comparison. Skip the destructive
    // innerHTML-replace + re-wire when a poll tick brought back identical
    // board content (the common case: most 15s ticks see no change).
    // Guarded additionally on `#main-content` actually still holding task
    // board's own markup -- switching tabs away and back calls renderPanel()
    // again while `_lastRenderSig` may still match, but `#main-content` now
    // holds a DIFFERENT panel's DOM, so the signature match alone is unsafe.
    var domIsOurs = !!content.querySelector('.kanban');
    var unchanged = domIsOurs && (html === TaskBoard._lastRenderSig);
    TaskBoard._lastRenderSig = html;

    var prefixHtml = Components.errorBanner();
    if (staleHtml) prefixHtml += '<div style="margin-bottom:8px">' + staleHtml + '</div>';

    if (unchanged) {
      // Board content is identical -- still refresh the volatile prefix
      // (error banner / stale-age text) in place without touching the
      // <details> state or the kanban body.
      var prefixEl = content.querySelector('.tb-volatile-prefix');
      if (prefixEl) {
        prefixEl.innerHTML = prefixHtml;
      } else {
        content.insertAdjacentHTML('afterbegin', '<div class="tb-volatile-prefix">' + prefixHtml + '</div>');
      }
      return;
    }

    // Preserve the blocked-banner's open/closed state across the rebuild --
    // native <details> only "survives re-render" if the DOM node itself
    // persists; a full innerHTML replace always recreates it closed.
    var _prevDetails = content.querySelector('.blocked-banner');
    var _wasOpen = _prevDetails ? _prevDetails.open : false;

    content.innerHTML = '<div class="tb-volatile-prefix">' + prefixHtml + '</div>' + html;

    var _newDetails = content.querySelector('.blocked-banner');
    if (_newDetails && _wasOpen) _newDetails.open = true;

    TaskBoard._wireActions(content);
  },

  // ── Card ──

  _renderCard: function(t) {
    var color = Components.nodeColor(t.assigned_to);
    var priority = t.priority || 3;
    var priClass = priority <= 1 ? 'pri-high' : (priority <= 2 ? 'pri-med' : '');
    var staleClass = t.stale ? ' stale' : '';

    var acks = t.review_acks ? (Array.isArray(t.review_acks) ? t.review_acks : (function() { try { return JSON.parse(t.review_acks); } catch(e) { return []; } })()) : [];
    var acksHtml = '';
    if (acks.length) {
      var authorHost = Components.nodeHost(t.assigned_to);
      acksHtml = acks.map(function(reviewer) {
        var rHost = Components.nodeHost(reviewer);
        var cross = rHost !== authorHost && rHost !== '??' && authorHost !== '??';
        var tip = reviewer + ' (' + rHost + ')' + (cross ? ' \u2014 cross-host \u2713' : ' \u2014 SAME HOST');
        return '<span class="kanban-card-ack ' + (cross ? 'ack-cross-host' : 'ack-same-host') + '" title="' + tip + '">' + (cross ? '\u2713' : '\u26a0') + reviewer + '</span>';
      }).join('');
    }

    var artifactHtml = t.artifact_count ? '<span class="kanban-card-artifacts">\ud83d\udce6' + t.artifact_count + '</span>' : '';
    var staleTag = t.stale ? '<span class="kanban-card-stale-tag">\u26a0 stale</span>' : '';
    var priLabel = priority <= 1 ? Components.statusBadge('P' + priority, 'error')
                 : priority <= 2 ? Components.statusBadge('P' + priority, 'warn')
                 : '';
    var updatedAgo = Components.timeSince(t.updated_at);

    return '<div class="kanban-card ' + priClass + staleClass + '">'
      + '<div class="kanban-card-title">' + Components.esc(t.title || t.task_id) + '</div>'
      + '<div class="kanban-card-meta">'
      + '<span class="kanban-card-id">' + Components.esc(t.task_id) + '</span>'
      + '<span class="kanban-card-assignee" style="color:' + color + '">' + (t.assigned_to || '--') + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:4px;align-items:center;margin-top:3px;flex-wrap:wrap">'
      + priLabel + acksHtml + artifactHtml + staleTag
      + '<span style="margin-left:auto;font-size:9px;color:var(--text-tertiary);font-family:\'JetBrains Mono\',monospace">' + updatedAgo + '</span>'
      + '</div>'
      + '<div class="kanban-card-actions">'
      + '<button class="kanban-action-btn" data-action="status" data-task-id="' + Components.esc(t.task_id) + '">Status</button>'
      + '<button class="kanban-action-btn" data-action="assign" data-task-id="' + Components.esc(t.task_id) + '">Assign</button>'
      + '</div>'
      + '</div>';
  },

  // ── SWAT card ──

  _renderSwatCard: function(s) {
    var sev = (s.severity || 'medium').toLowerCase();
    var sevColor = TaskBoard.SWAT_SEVERITY_COLORS[sev] || 'var(--text-secondary)';
    var stage = (s.stage || 'open').toLowerCase();
    var stagePillClass = stage === 'fixed' ? 'success' : (stage === 'in_review' ? 'warn' : 'error');
    var reviewer = s.current_reviewer || null;
    var reviewerColor = reviewer ? Components.nodeColor(reviewer) : 'var(--text-tertiary)';
    var updatedAgo = Components.timeSince(s.updated_at || s.created_at);
    var author = s.created_by || '--';
    var authorColor = Components.nodeColor(author);

    return '<div class="kanban-card kanban-swat-card" data-action="swat-detail" data-swat-id="' + Components.esc(s.swat_id) + '" style="border-left:3px solid ' + sevColor + ';cursor:pointer">'
      + '<div class="kanban-card-title">' + Components.esc(s.title || s.swat_id) + '</div>'
      + '<div class="kanban-card-meta">'
      + '<span class="kanban-card-id">' + Components.esc(s.swat_id) + '</span>'
      + '<span class="kanban-card-assignee" style="color:' + authorColor + '" title="author">' + author + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:4px;align-items:center;margin-top:3px;flex-wrap:wrap">'
      + Components.statusBadge(stage.replace('_', ' '), stagePillClass)
      + Components.statusBadge(sev, sev === 'high' || sev === 'critical' ? 'error' : (sev === 'medium' ? 'warn' : ''))
      + (reviewer ? '<span class="kanban-card-ack" style="color:' + reviewerColor + '" title="current reviewer">\u2192 ' + reviewer + '</span>' : '')
      + '<span style="margin-left:auto;font-size:9px;color:var(--text-tertiary);font-family:\'JetBrains Mono\',monospace">' + updatedAgo + '</span>'
      + '</div>'
      + '</div>';
  },

  // ── Actions ──

  _wireActions: function(container) {
    container.querySelectorAll('.kanban-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.getAttribute('data-action');
        var taskId = btn.getAttribute('data-task-id');
        if (action === 'status') TaskBoard._showStatusModal(taskId);
        if (action === 'assign') TaskBoard._showAssignModal(taskId);
      });
    });
    container.querySelectorAll('.kanban-swat-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var swatId = card.getAttribute('data-swat-id');
        if (swatId) TaskBoard._showSwatModal(swatId);
      });
    });
  },

  _showSwatModal: async function(swatId) {
    var overlay = document.createElement('div');
    overlay.className = 'kanban-modal-overlay';
    overlay.innerHTML = '<div class="kanban-modal" style="max-width:720px">'
      + '<div class="kanban-modal-title">SWAT \u2014 ' + Components.esc(swatId) + '</div>'
      + '<div id="tb-swat-body" style="font-size:12px;color:var(--text-secondary);max-height:60vh;overflow-y:auto">'
      + Components.loading('Loading SWAT...') + '</div>'
      + '<div class="kanban-modal-actions">'
      + '<button class="btn btn-secondary" id="tb-modal-cancel">Close</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#tb-modal-cancel').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var swat = await API.getSwat(swatId);
    var bodyEl = overlay.querySelector('#tb-swat-body');
    if (!bodyEl) return;
    if (!swat || swat.error) {
      bodyEl.innerHTML = '<span class="error">' + Components.esc((swat && swat.error) || 'Failed to load') + '</span>';
      return;
    }
    var sev = (swat.severity || 'medium').toLowerCase();
    var stage = (swat.stage || 'open').toLowerCase();
    var bodyText = (swat.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    bodyEl.innerHTML =
        '<div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap">'
      + Components.statusBadge(stage.replace('_', ' '), stage === 'fixed' ? 'success' : (stage === 'in_review' ? 'warn' : 'error'))
      + Components.statusBadge(sev, sev === 'high' || sev === 'critical' ? 'error' : (sev === 'medium' ? 'warn' : ''))
      + '<span style="color:var(--text-tertiary);font-size:10px">by ' + Components.esc(swat.created_by || '--') + (swat.current_reviewer ? ' \u2192 ' + Components.esc(swat.current_reviewer) : '') + '</span>'
      + '</div>'
      + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:6px">' + Components.esc(swat.title || '') + '</div>'
      + '<pre style="white-space:pre-wrap;font-family:inherit;font-size:11px;line-height:1.5;margin:0">' + bodyText + '</pre>';
  },

  _showStatusModal: function(taskId) {
    var task = TaskBoard._findTask(taskId);
    if (!task) return;

    var overlay = document.createElement('div');
    overlay.className = 'kanban-modal-overlay';

    var opts = TaskBoard.STATUSES.map(function(s) {
      return '<option value="' + s + '"' + (s === task.status ? ' selected' : '') + '>' + s.replace('_', ' ') + '</option>';
    }).join('');

    overlay.innerHTML = '<div class="kanban-modal">'
      + '<div class="kanban-modal-title">Change Status \u2014 ' + Components.esc(task.title || taskId) + '</div>'
      + '<div class="form-group"><label class="form-label">New Status</label>'
      + '<select class="form-select" id="tb-status-select">' + opts + '</select></div>'
      + '<div class="form-group"><label class="form-label">Notes (optional)</label>'
      + '<input class="form-input" id="tb-status-notes" type="text" placeholder="Reason for change..."></div>'
      + '<div class="kanban-modal-actions">'
      + '<button class="btn btn-secondary" id="tb-modal-cancel">Cancel</button>'
      + '<button class="btn btn-primary" id="tb-modal-save">Update</button></div>'
      + '<div id="tb-modal-result" class="form-result"></div></div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#tb-modal-cancel').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#tb-modal-save').onclick = async function() {
      var newStatus = overlay.querySelector('#tb-status-select').value;
      var notes = overlay.querySelector('#tb-status-notes').value;
      var resultEl = overlay.querySelector('#tb-modal-result');
      resultEl.innerHTML = '<span class="sending">Updating...</span>';

      var body = { status: newStatus };
      if (notes) body.notes = notes;
      var resp = await API.updateTask(taskId, body);

      if (resp && resp.error) {
        resultEl.innerHTML = '<span class="error">' + Components.esc(resp.error) + '</span>';
      } else {
        resultEl.innerHTML = '<span class="success">\u2713 Updated</span>';
        setTimeout(function() { overlay.remove(); }, 600);
        DataStore.refresh(TaskBoard.ENDPOINT);
      }
    };
  },

  _showAssignModal: function(taskId) {
    var task = TaskBoard._findTask(taskId);
    if (!task) return;

    var overlay = document.createElement('div');
    overlay.className = 'kanban-modal-overlay';

    var nodeOpts = ['<option value="">-- Unassigned --</option>'];
    TaskBoard.NODES.forEach(function(n) {
      nodeOpts.push('<option value="' + n + '"' + (n === task.assigned_to ? ' selected' : '') + '>' + n + '</option>');
    });

    overlay.innerHTML = '<div class="kanban-modal">'
      + '<div class="kanban-modal-title">Reassign \u2014 ' + Components.esc(task.title || taskId) + '</div>'
      + '<div class="form-group"><label class="form-label">Assign To</label>'
      + '<select class="form-select" id="tb-assign-select">' + nodeOpts.join('') + '</select></div>'
      + '<div class="kanban-modal-actions">'
      + '<button class="btn btn-secondary" id="tb-modal-cancel">Cancel</button>'
      + '<button class="btn btn-primary" id="tb-modal-save">Assign</button></div>'
      + '<div id="tb-modal-result" class="form-result"></div></div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#tb-modal-cancel').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#tb-modal-save').onclick = async function() {
      var newNode = overlay.querySelector('#tb-assign-select').value;
      var resultEl = overlay.querySelector('#tb-modal-result');
      resultEl.innerHTML = '<span class="sending">Updating...</span>';

      var resp = await API.updateTask(taskId, { assigned_to: newNode || null });

      if (resp && resp.error) {
        resultEl.innerHTML = '<span class="error">' + Components.esc(resp.error) + '</span>';
      } else {
        resultEl.innerHTML = '<span class="success">\u2713 Reassigned</span>';
        setTimeout(function() { overlay.remove(); }, 600);
        DataStore.refresh(TaskBoard.ENDPOINT);
      }
    };
  },

  _findTask: function(taskId) {
    var tasks = TaskBoard._getTasks();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].task_id === taskId) return tasks[i];
    }
    return null;
  }
};
