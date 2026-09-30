// Generated read-only renderers. Run node scripts\build-showcase.cjs to refresh.
var Components = {
  "esc": function(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },
  "timeSince": function(isoStr) {
    if (!isoStr) return 'never';
    var secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (secs < 0) return 'future';
    if (secs < 60) return 'now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  },
  "formatDuration": function(secs) {
    if (!secs && secs !== 0) return '--';
    if (secs < 60) return secs + 's';
    if (secs < 3600) return Math.floor(secs / 60) + 'm';
    return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  },
  "nodeColor": function(nodeId) {
    return (CONFIG.NODE_COLORS && CONFIG.NODE_COLORS[nodeId]) || '#58a6ff';
  },
  "nodeHost": function(nodeId) {
    if (!CONFIG.HOSTS) return '??';
    for (var host in CONFIG.HOSTS) {
      if (CONFIG.HOSTS[host].indexOf(nodeId) !== -1) return host;
    }
    return '??';
  },
  "statusBadge": function(text, colorClass) {
    colorClass = colorClass || '';
    return '<span class="comp-badge ' + colorClass + '">' + Components.esc(text) + '</span>';
  },
  "staleBadge": function(endpoint) {
    if (typeof FleetState === 'undefined') return '';
    if (!FleetState.isStale(endpoint)) return '';
    var age = FleetState.age(endpoint);
    var ageStr = age < 60000 ? Math.round(age / 1000) + 's' : Math.round(age / 60000) + 'm';
    return '<span class="comp-stale-badge" title="Data is ' + ageStr + ' old">'
      + '&#9888; stale (' + ageStr + ')</span>';
  },
  "errorBanner": function(opts) {
    opts = opts || {};
    var connected = true;
    var errorDetail = '';
    var failingCount = 0;
    var criticalsCount = 0;
    if (typeof FleetState !== 'undefined') {
      connected = FleetState.connected;
      if (!connected) {
        var criticals = Object.keys(FleetState.ENDPOINTS).filter(function(ep) {
          return FleetState.ENDPOINTS[ep].critical;
        });
        var failing = criticals.filter(function(ep) {
          var s = FleetState.endpointStatus(ep);
          return s && s.errorCount >= 3;
        });
        criticalsCount = criticals.length;
        failingCount = failing.length;
        errorDetail = failingCount + '/' + criticalsCount + ' critical endpoints failing';
      }
    }
    // OPERATOR P1 fix 2026-06-06 (UXIA): suppress banner if connected=false but
    // no endpoint has actually accumulated >=3 errors. Avoids the contradictory
    // "0/N critical endpoints failing" red banner during the initial-load
    // window before fetches return. forceShow still bypasses for explicit cases.
    if (!opts.forceShow && !connected && failingCount === 0) {
      return '';
    }
    if (opts.forceShow || !connected) {
      var msg = opts.message || 'Cannot reach coordinator API';
      return '<div class="comp-error-banner">'
        + '<span class="comp-error-icon">&#9888;</span>'
        + '<span class="comp-error-text">' + Components.esc(msg) + '</span>'
        + (errorDetail ? '<span class="comp-error-detail">' + Components.esc(errorDetail) + '</span>' : '')
        + '</div>';
    }
    return '';
  },
  "setupPanel": function(title, badge) {
    var titleEl = document.getElementById('main-panel-title');
    var badgeEl = document.getElementById('main-panel-badge');
    if (titleEl) titleEl.textContent = title;
    if (badgeEl) badgeEl.textContent = badge || '';
    return document.getElementById('main-content');
  },
  "loading": function(text) {
    return '<div class="loading-text">' + Components.esc(text || 'Loading...') + '</div>';
  },
  "empty": function(text) {
    return '<div class="empty-text">' + Components.esc(text || 'No data') + '</div>';
  }
};

var Nodes = {
  "getColor": function(nodeId) {
    return CONFIG.NODE_COLORS[nodeId] || '#58a6ff';
  },
  "getHost": function(nodeId) {
    for (var host in CONFIG.HOSTS) {
      if (CONFIG.HOSTS[host].indexOf(nodeId) !== -1) return host;
    }
    return '??';
  },
  "indicatorClass": function(node) {
    if (!node.last_seen) return 'offline';
    var age = (Date.now() - new Date(node.last_seen).getTime()) / 1000;
    // SWAT-20260612-0039 Δ2: config-driven thresholds, defaults respect 2-3 cycle observation
    // window for the 2m/5m bb4 cadence (360s stale = 3x of 2m cadence; 720s offline = 6x).
    var offlineSec = (typeof CONFIG !== 'undefined' && CONFIG.NODE_OFFLINE_THRESHOLD_SEC) || 720;
    var staleSec   = (typeof CONFIG !== 'undefined' && CONFIG.NODE_STALE_THRESHOLD_SEC)   || 360;
    if (age > offlineSec) return 'offline';
    if (age > staleSec)   return 'stale';
    return '';
  },
  "timeSince": function(isoStr) {
    if (!isoStr) return 'never';
    var secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (secs < 60) return 'now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  },
  "sessionAge": function(node) {
    // Use bootstrapped_at as session start (= last molt/boot time)
    // process_start_time is the OS process which persists across molts -- wrong for session age
    var pst = node.bootstrapped_at || node.session_start_time || node.process_start_time;
    var secs;
    if (pst) {
      secs = Math.floor((Date.now() - new Date(pst).getTime()) / 1000);
    } else if (node.session_age_seconds !== undefined && node.session_age_seconds !== null) {
      secs = node.session_age_seconds;
    } else {
      return '\u2014';
    }
    if (secs < 0 || isNaN(secs)) return '\u2014';
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  },
  "lifeSvcClass": function(node) {
    if (!node.heartbeat_status) return 'grey';
    if (node.heartbeat_status === 'healthy' && node.heartbeat_phase === 'active') return 'green';
    if (node.heartbeat_status === 'healthy') return 'green';
    if (node.heartbeat_status === 'overdue') return 'red';
    return 'grey';
  },
  "lifeSvcLabel": function(node) {
    if (!node.heartbeat_status) return 'no data';
    if (node.heartbeat_status === 'healthy') return 'alive';
    if (node.heartbeat_status === 'overdue') return 'overdue';
    return node.heartbeat_status;
  },
  "renderNav": function(nodes) {
    // Inner list container (sibling of the bottom Fleet Health card inside .nav).
    var nav = document.getElementById('node-nav-list') || document.getElementById('node-nav');
    if (!nodes || !nodes.length) {
      nav.innerHTML = '<div class="nav-loading">No nodes found</div>';
      return;
    }

    var isFirst = !Nodes._initialRenderDone;
    var html = '';
    nodes.forEach(function(node, i) {
      var color = Nodes.getColor(node.node_id);
      var ind = Nodes.indicatorClass(node);
      var host = Nodes.getHost(node.node_id);
      var active = (Nodes.currentNode === node.node_id) ? ' active' : '';
      var animClass = isFirst ? ' animate-in' : '';
      var animStyle = isFirst ? 'animation-delay:' + (i * 0.05) + 's;' : '';
      var score = (node.freshness_score !== undefined) ? node.freshness_score
        : (node.workload_score !== undefined) ? node.workload_score : '--';
      var status = node.lifecycle_state || node.status || 'unknown';

      var lsClass = Nodes.lifeSvcClass(node);
      var lsLabel = Nodes.lifeSvcLabel(node);

      html += '<div class="node-card' + animClass + active + '" '
        + 'style="--node-color:' + color + ';' + animStyle + '" '
        + 'data-node="' + node.node_id + '">'
        + '<div class="node-card-header">'
        + '<span class="node-name" style="color:' + color + '">' + node.node_id + '</span>'
        + '<span class="node-role">' + (node.role || '--') + '</span>'
        + '</div>'
        + '<div class="node-meta" style="margin-top:4px">'
        + '<span class="node-indicator ' + ind + '"></span>'
        + '<span>' + status + '</span>'
        + '<span class="life-svc-pip ' + lsClass + '" title="Life services: ' + lsLabel + '"></span>'
        + '<span class="node-host">' + host + '</span>'
        + '</div>'
        + '<div class="node-session-age-row">'
        + '\u23f1 ' + Nodes.sessionAge(node)
        + '</div>'
        + '<div class="node-meta" style="margin-top:2px">'
        + '<span>wl:' + score + '</span>'
        + '<span style="margin-left:auto">' + Nodes.timeSince(node.last_seen) + '</span>'
        + '</div>'
        + '</div>';
    });

    nav.innerHTML = html;
    Nodes._initialRenderDone = true;

    nav.querySelectorAll('.node-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var nodeId = card.getAttribute('data-node');
        Nodes.selectNode(nodeId);
      });
    });
  }
};

var TaskBoard = {
  "COLUMNS": [{"key":"swats","label":"SWATs","color":"var(--error)","kind":"swat"},{"key":"ready","label":"Ready","color":"var(--accent)"},{"key":"in_progress","label":"In Progress","color":"var(--success)"},{"key":"review","label":"Review","color":"var(--purple)"}],
  "SWAT_COUNT_STAGES": ["open","in_review","fixed"],
  "SWAT_STAGE_ORDER": {"open":0,"in_review":1,"fixed":2},
  "SWAT_SEVERITY_COLORS": {"critical":"var(--error)","high":"var(--error)","medium":"var(--warn)","low":"var(--text-secondary)"},
  "ENDPOINT": "/api/tasks?include_completed=false",
  "_getSwats": function() {
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
  "_getTasks": function() {
    if (!TaskBoard.data) return [];
    return TaskBoard.data.tasks || TaskBoard.data || [];
  },
  "renderPanel": function() {
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
  "_renderCard": function(t) {
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
  "_renderSwatCard": function(s) {
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
  }
};

var ReviewPipeline = {
  "_GRID": "display:grid;grid-template-columns:2fr 1fr 1fr 1fr 0.9fr 1.3fr;gap:8px;padding:6px 10px;align-items:center;",
  "_renderTable": function(rows) {
    var headStyle = ReviewPipeline._GRID
      + 'border-bottom:1px solid var(--glass-border);'
      + 'font-size:9px;text-transform:uppercase;letter-spacing:0.5px;'
      + 'color:var(--text-secondary);font-weight:600;';
    var head = '<div style="' + headStyle + '">'
      + '<span>Task</span>'
      + '<span>Cluster</span>'
      + '<span>Reviewer</span>'
      + '<span>Source</span>'
      + '<span>Claim age</span>'
      + '<span>Deadline</span>'
      + '</div>';

    var body = rows.map(ReviewPipeline._renderRow).join('');
    return '<div style="display:flex;flex-direction:column">' + head + body + '</div>';
  },
  "_renderRow": function(r) {
    var esc = Components.esc;
    var revColor = Components.nodeColor(r.reviewer);
    var srcColor = r.source ? Components.nodeColor(r.source) : 'var(--text-tertiary)';

    // Deadline: overdue (negative) -> error; <30m left -> warning; else success.
    var cd = r.deadline_countdown_s;
    var deadlineHtml;
    if (cd === null || cd === undefined) {
      deadlineHtml = '<span style="color:var(--text-tertiary)">&mdash;</span>';
    } else if (cd < 0) {
      deadlineHtml = '<span style="color:var(--error)">'
        + Components.formatDuration(Math.abs(cd)) + ' overdue</span>';
    } else {
      var col = cd < 1800 ? 'var(--warning)' : 'var(--success)';
      deadlineHtml = '<span style="color:' + col + '">'
        + Components.formatDuration(cd) + ' left</span>';
    }

    var escalated = r.escalated
      ? ' ' + Components.statusBadge('escalated', 'error') : '';

    var cluster = r.cluster_id
      ? '<span style="padding:1px 6px;border-radius:var(--radius-sm);'
        + 'background:var(--accent-soft);color:var(--accent);'
        + 'font-family:\'JetBrains Mono\',monospace;font-size:10px">'
        + esc(r.cluster_id) + '</span>'
      : '<span style="color:var(--text-tertiary)">&mdash;</span>';

    var age = (r.claim_age_s === null || r.claim_age_s === undefined)
      ? '&mdash;' : Components.formatDuration(r.claim_age_s);

    var title = esc(r.task_title || r.task_id || '(untitled)');
    var rowStyle = ReviewPipeline._GRID
      + 'border-bottom:1px solid var(--glass-border);font-size:11px;'
      + 'color:var(--text-primary);';

    return '<div style="' + rowStyle + '">'
      + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" '
        + 'title="' + title + '">' + title + escalated + '</span>'
      + '<span>' + cluster + '</span>'
      + '<span style="color:' + revColor + ';font-weight:500">' + esc(r.reviewer || '--') + '</span>'
      + '<span style="color:' + srcColor + '">' + esc(r.source || '--') + '</span>'
      + '<span style="color:var(--text-secondary);font-family:\'JetBrains Mono\',monospace">' + age + '</span>'
      + '<span style="font-family:\'JetBrains Mono\',monospace">' + deadlineHtml + '</span>'
      + '</div>';
  }
};

