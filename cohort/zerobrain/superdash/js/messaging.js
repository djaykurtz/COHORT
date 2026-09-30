/* Superdash v2 -- Messaging Center (OPERATOR-first UX)
   Full messaging: inbox, compose, expand, ack, filter, markdown rendering.
   RFC-FDDB12 P2: Uses /api/messages/recent + FleetState for live updates. */

var Messaging = {
  messages: [],
  currentView: 'inbox',   // inbox | compose | motd
  expandedId: null,
  filterNode: 'all',
  filterType: 'all',
  filterUnread: false,
  pollTimer: null,
  _subscribed: false,
  ENDPOINT: '/api/messages/recent?limit=100',

  /* --- Entry Point --- */
  renderPanel: function() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Messages';
    badge.textContent = '';
    content.innerHTML = '<div class="msg-panel" id="msg-panel">'
      + '<div class="msg-loading" id="msg-loading">'
      + '<div class="msg-loading-bar"><div class="msg-loading-fill" id="msg-loading-fill"></div></div>'
      + '<div class="msg-loading-label" id="msg-loading-label">Connecting...</div>'
      + '</div></div>';

    Messaging.loadAll();
  },

  /* --- Data Loading (FleetState integrated) --- */
  _loadStep: function(pct, label) {
    var fill = document.getElementById('msg-loading-fill');
    var lbl = document.getElementById('msg-loading-label');
    if (fill) fill.style.width = pct + '%';
    if (lbl) lbl.textContent = label;
  },

  loadAll: async function() {
    Messaging._loadStep(15, 'Connecting...');
    try {
      var data = await DataStore.get(Messaging.ENDPOINT, { maxAge: 15000 });
      Messaging._loadStep(50, 'Fetching messages...');
      if (data && (data.inbox || data.messages)) {
        Messaging.messages = data.inbox || data.messages || [];
        Messaging._loadStep(75, 'Processing ' + Messaging.messages.length + ' messages...');
      } else if (data && Array.isArray(data)) {
        Messaging.messages = data;
        Messaging._loadStep(75, 'Processing ' + Messaging.messages.length + ' messages...');
      } else {
        // Fallback: per-node fetch
        Messaging._loadStep(30, 'Fetching per node...');
        var allMsgs = [];
        var nodes = Object.keys(Nodes.nodeData || {});
        var results = await Promise.allSettled(nodes.map(function(n) {
          return fetch(CONFIG.API_BASE + '/api/messages/' + n + '?limit=30&status=all', {
            headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
          }).then(function(r) { return r.ok ? r.json() : null; });
        }));
        results.forEach(function(r) {
          if (r.status === 'fulfilled' && r.value && r.value.inbox) {
            allMsgs = allMsgs.concat(r.value.inbox);
          }
        });
        Messaging.messages = allMsgs;
        Messaging._loadStep(75, 'Processing ' + Messaging.messages.length + ' messages...');
      }
    } catch(e) {
      Messaging.messages = [];
    }

    // Subscribe for live updates
    if (!Messaging._subscribed) {
      Messaging._subscribed = true;
      DataStore.subscribe(Messaging.ENDPOINT, function(data) {
        if (data && (data.inbox || data.messages)) {
          Messaging.messages = data.inbox || data.messages || [];
        }
        Messaging.messages.sort(function(a, b) {
          return new Date(b.created_at) - new Date(a.created_at);
        });
        if (App.currentTab === 'messages') {
          Messaging.render();
        }
      });
    }

    Messaging._loadStep(90, 'Sorting...');

    // Sort newest first
    Messaging.messages.sort(function(a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    Messaging._loadStep(100, 'Done');
    var loader = document.getElementById('msg-loading');
    if (loader) loader.classList.add('done');
    await new Promise(function(r) { setTimeout(r, 350); });

    Messaging.render();
  },

  /* --- Main Render --- */
  render: function() {
    var panel = document.getElementById('msg-panel');
    if (!panel) return;

    var html = '';

    // Error banner + stale badge
    var errorHtml = Components.errorBanner();
    var staleHtml = Components.staleBadge(Messaging.ENDPOINT);
    if (errorHtml) html += errorHtml;
    if (staleHtml) html += '<div style="margin:8px 12px 0">' + staleHtml + '</div>';

    html += Messaging.renderToolbar();

    if (Messaging.currentView === 'compose') {
      html += Messaging.renderCompose();
    } else if (Messaging.currentView === 'motd') {
      html += '<div class="msg-list"><div id="motd-mount"></div></div>';
    } else {
      html += Messaging.renderInbox();
    }

    panel.innerHTML = html;
    Messaging.updateBadge();

    // Mount MOTD panel after DOM is ready
    if (Messaging.currentView === 'motd' && typeof MOTD !== 'undefined') {
      MOTD.load().then(function() {
        var mount = document.getElementById('motd-mount');
        if (mount) {
          var tmp = document.getElementById('main-panel-title');
          var badge = document.getElementById('main-panel-badge');
          if (tmp) tmp.textContent = 'MOTD Schedules';
          if (badge) badge.textContent = MOTD.schedules.length ? MOTD.schedules.length + ' active' : '';
          MOTD.renderInto(mount);
        }
      });
    }
  },

  /* ─── Toolbar ─── */
  renderToolbar: function() {
    var unreadCount = Messaging.messages.filter(function(m) { return m.status === 'unread'; }).length;
    var unreadBadge = unreadCount > 0 ? '<span class="tab-badge">' + unreadCount + '</span>' : '';

    var nodes = Object.keys(Nodes.nodeData || {}).sort();
    var nodeOptions = '<option value="all">All Nodes</option>' +
      nodes.map(function(n) {
        return '<option value="' + n + '"' + (Messaging.filterNode === n ? ' selected' : '') + '>' + n + '</option>';
      }).join('');

    var typeOptions = ['all', 'info', 'status_update', 'request', 'delegation', 'attention', 'help_request', 'error_report', 'reboot_request', 'reboot_ack'].map(function(t) {
      var label = t === 'all' ? 'All Types' : t.replace(/_/g, ' ');
      return '<option value="' + t + '"' + (Messaging.filterType === t ? ' selected' : '') + '>' + label + '</option>';
    }).join('');

    return '<div class="msg-toolbar">'
      + '<div class="msg-toolbar-left">'
      + '<div class="msg-view-tabs">'
      + '<button class="msg-view-tab' + (Messaging.currentView === 'inbox' ? ' active' : '') + '" onclick="Messaging.switchView(\'inbox\')">Inbox' + unreadBadge + '</button>'
      + '<button class="msg-view-tab' + (Messaging.currentView === 'compose' ? ' active' : '') + '" onclick="Messaging.switchView(\'compose\')">Compose</button>'
      + '<button class="msg-view-tab' + (Messaging.currentView === 'motd' ? ' active' : '') + '" onclick="Messaging.switchView(\'motd\')">📋 MOTD</button>'
      + '</div>'
      + '</div>'
      + '<div class="msg-toolbar-right">'
      + '<select class="msg-filter" onchange="Messaging.setFilterNode(this.value)">' + nodeOptions + '</select>'
      + '<select class="msg-filter" onchange="Messaging.setFilterType(this.value)">' + typeOptions + '</select>'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);cursor:pointer">'
      + '<input type="checkbox"' + (Messaging.filterUnread ? ' checked' : '') + ' onchange="Messaging.toggleUnread(this.checked)" style="accent-color:var(--accent)"> Unread'
      + '</label>'
      + '<button class="msg-action-btn" onclick="DataStore.refresh(Messaging.ENDPOINT); Messaging.loadAll()" title="Refresh">&#8635;</button>'
      + '</div>'
      + '</div>';
  },

  /* ─── Inbox View ─── */
  renderInbox: function() {
    var filtered = Messaging.getFiltered();

    if (!filtered.length) {
      return '<div class="msg-list"><div class="msg-empty">'
        + '<div class="msg-empty-icon">📭</div>'
        + '<div>No messages' + (Messaging.filterNode !== 'all' || Messaging.filterType !== 'all' || Messaging.filterUnread ? ' matching filters' : '') + '</div>'
        + '</div></div>';
    }

    var html = '<div class="msg-list">';

    // Group by date
    var groups = Messaging.groupByDate(filtered);
    Object.keys(groups).forEach(function(dateLabel) {
      html += '<div class="msg-thread-label">' + dateLabel + '</div>';
      groups[dateLabel].forEach(function(msg) {
        html += Messaging.renderCard(msg);
      });
    });

    html += '</div>';
    return html;
  },

  /* --- Single Message Card --- */
  renderCard: function(msg) {
    var isExpanded = Messaging.expandedId === msg.id;
    var classes = 'msg-card';
    if (msg.status === 'unread') classes += ' unread';
    if (isExpanded) classes += ' expanded';
    if (msg.priority && msg.priority <= 2) classes += ' priority-high';
    if (msg.attention) classes += ' attention';

    var fromColor = Components.nodeColor(msg.from_node);
    var toColor = msg.to_node ? Components.nodeColor(msg.to_node) : 'var(--text-secondary)';
    var time = Components.timeSince(msg.created_at);

    var html = '<div class="' + classes + '" onclick="Messaging.toggleExpand(' + msg.id + ')">';

    // Header row
    html += '<div class="msg-card-header">'
      + '<span class="msg-card-from" style="color:' + fromColor + '">' + (msg.from_node || '??') + '</span>';

    if (msg.to_node && !msg.is_broadcast) {
      html += '<span class="msg-card-arrow">&rarr;</span>'
        + '<span class="msg-card-to" style="color:' + toColor + '">' + msg.to_node + '</span>';
    } else if (msg.is_broadcast) {
      html += '<span class="msg-card-arrow">&rarr;</span>'
        + '<span class="msg-card-to" style="color:var(--text-tertiary)">fleet</span>';
    }

    html += '<div class="msg-card-meta">';
    if (msg.requires_ack) {
      var ackCls = msg.read_at ? 'acked' : '';
      html += '<span class="msg-ack-badge ' + ackCls + '">' + (msg.read_at ? '&#10003; acked' : '&#9203; ack needed') + '</span>';
    }
    // Priority badge using Components
    if (msg.priority && msg.priority <= 2) {
      var priCls = msg.priority <= 1 ? 'error' : 'warn';
      html += Components.statusBadge('P' + msg.priority, priCls);
    }
    html += '<span class="msg-card-type ' + (msg.msg_type || '') + '">' + (msg.msg_type || 'info').replace(/_/g, ' ') + '</span>'
      + '<span class="msg-card-time">' + time + '</span>'
      + '</div></div>';

    // Subject
    if (msg.subject) {
      html += '<div class="msg-card-subject">' + Components.esc(msg.subject) + '</div>';
    }

    // Preview (collapsed) or full body (expanded)
    if (isExpanded) {
      html += '<div class="msg-card-body">';
      if (msg.content) {
        html += Messaging.renderMarkdown(msg.content);
      }
      html += '</div>';

      // Actions
      html += '<div class="msg-card-actions">';
      if (msg.status === 'unread') {
        html += '<button class="msg-action-btn primary" onclick="event.stopPropagation(); Messaging.markRead(' + msg.id + ')">Mark Read</button>';
      }
      if (msg.requires_ack && !msg.read_at) {
        html += '<button class="msg-action-btn primary" onclick="event.stopPropagation(); Messaging.ackMessage(' + msg.id + ')">Acknowledge</button>';
      }
      html += '<button class="msg-action-btn" onclick="event.stopPropagation(); Messaging.replyTo(' + msg.id + ')">Reply</button>';
      html += '</div>';
    } else if (msg.content) {
      var preview = msg.content.length > 120 ? msg.content.substring(0, 120) + '...' : msg.content;
      preview = preview.replace(/[#*`_~\[\]]/g, '');
      html += '<div class="msg-card-preview">' + Components.esc(preview) + '</div>';
    }

    html += '</div>';
    return html;
  },

  /* ─── Compose View ─── */
  renderCompose: function() {
    var nodes = Object.keys(Nodes.nodeData || {}).sort();
    var nodeOptions = nodes.map(function(n) {
      return '<option value="' + n + '">' + n + '</option>';
    }).join('');

    var fromOptions = '<option value="OPERATOR">OPERATOR</option>' + nodeOptions;

    return '<div class="msg-list"><div class="msg-compose">'
      + '<div class="msg-compose-header">Compose Message</div>'

      + '<div class="form-row">'
      + '<div class="form-group"><label class="form-label">From</label>'
      + '<select class="form-select" id="msg-from">' + fromOptions + '</select></div>'
      + '<div class="form-group"><label class="form-label">To</label>'
      + '<select class="form-select" id="msg-to"><option value="__broadcast__">All (Broadcast)</option>' + nodeOptions + '</select></div>'
      + '<div class="form-group"><label class="form-label">Type</label>'
      + '<select class="form-select" id="msg-type">'
      + '<option value="info" selected>Info</option>'
      + '<option value="request">Request</option>'
      + '<option value="delegation">Delegation</option>'
      + '<option value="attention">Attention</option>'
      + '<option value="status_update">Status Update</option>'
      + '<option value="help_request">Help Request</option>'
      + '<option value="error_report">Error Report</option>'
      + '<option value="reboot_request">Reboot Request</option>'
      + '</select></div>'
      + '<div class="form-group"><label class="form-label">Priority</label>'
      + '<select class="form-select" id="msg-priority">'
      + '<option value="1">1 - Crit</option>'
      + '<option value="2">2 - High</option>'
      + '<option value="3" selected>3 - Normal</option>'
      + '</select></div>'
      + '</div>'

      + '<div class="form-group"><label class="form-label">Subject</label>'
      + '<input type="text" class="form-input" id="msg-subject" placeholder="Brief subject line…"></div>'

      + '<div class="form-group"><label class="form-label">Content <span style="font-weight:400;opacity:0.6">(markdown supported)</span></label>'
      + '<textarea class="form-textarea" id="msg-content" rows="8" placeholder="Message body…\n\nSupports **bold**, *italic*, `code`, lists, headers."></textarea></div>'

      + '<div class="form-options">'
      + '<label class="form-check"><input type="checkbox" id="msg-attention"> Attention flag</label>'
      + '<label class="form-check"><input type="checkbox" id="msg-ack"> Requires acknowledgement</label>'
      + '</div>'

      + '<div class="form-actions">'
      + '<button class="btn btn-send" onclick="Messaging.send()">Send Message</button>'
      + '<button class="btn btn-secondary" onclick="Messaging.switchView(\'inbox\')">Cancel</button>'
      + '</div>'

      + '<div id="msg-compose-result" class="msg-compose-result" style="display:none"></div>'
      + '</div></div>';
  },

  /* ─── Actions ─── */
  switchView: function(view) {
    Messaging.currentView = view;
    Messaging.render();
  },

  toggleExpand: function(msgId) {
    if (Messaging.expandedId === msgId) {
      Messaging.expandedId = null;
    } else {
      Messaging.expandedId = msgId;
      // Auto mark-read on expand
      var msg = Messaging.messages.find(function(m) { return m.id === msgId; });
      if (msg && msg.status === 'unread') {
        Messaging.markRead(msgId);
        return; // markRead re-renders
      }
    }
    Messaging.render();
  },

  markRead: async function(msgId) {
    try {
      await fetch(CONFIG.API_BASE + '/api/messages/' + msgId + '/acknowledge', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: 'OPERATOR' })
      });
    } catch(e) { /* best effort */ }

    var msg = Messaging.messages.find(function(m) { return m.id === msgId; });
    if (msg) {
      msg.status = 'read';
      msg.read_at = new Date().toISOString();
    }
    Messaging.expandedId = msgId;
    Messaging.render();
  },

  ackMessage: async function(msgId) {
    try {
      await fetch(CONFIG.API_BASE + '/api/messages/' + msgId + '/acknowledge', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: 'OPERATOR' })
      });
    } catch(e) { /* best effort */ }

    var msg = Messaging.messages.find(function(m) { return m.id === msgId; });
    if (msg) {
      msg.status = 'read';
      msg.read_at = new Date().toISOString();
    }
    Messaging.render();
  },

  replyTo: function(msgId) {
    var msg = Messaging.messages.find(function(m) { return m.id === msgId; });
    if (!msg) return;

    Messaging.currentView = 'compose';
    Messaging.render();

    // Pre-fill reply fields
    setTimeout(function() {
      var toEl = document.getElementById('msg-to');
      var subjectEl = document.getElementById('msg-subject');
      if (toEl && msg.from_node) {
        toEl.value = msg.from_node;
      }
      if (subjectEl && msg.subject) {
        var re = msg.subject.startsWith('Re:') ? msg.subject : 'Re: ' + msg.subject;
        subjectEl.value = re;
      }
    }, 50);
  },

  send: async function() {
    var from = document.getElementById('msg-from').value;
    var to = document.getElementById('msg-to').value;
    var type = document.getElementById('msg-type').value;
    var priority = parseInt(document.getElementById('msg-priority').value, 10);
    var subject = document.getElementById('msg-subject').value;
    var content = document.getElementById('msg-content').value;
    var attention = document.getElementById('msg-attention').checked;
    var ack = document.getElementById('msg-ack').checked;
    var resultEl = document.getElementById('msg-compose-result');

    if (!subject) {
      resultEl.style.display = 'block';
      resultEl.className = 'msg-compose-result error';
      resultEl.textContent = 'Subject is required';
      return;
    }

    resultEl.style.display = 'block';
    resultEl.className = 'msg-compose-result';
    resultEl.textContent = 'Sending…';
    resultEl.style.color = 'var(--text-secondary)';

    try {
      var isBroadcast = (to === '__broadcast__');
      var url = isBroadcast
        ? CONFIG.API_BASE + '/api/messages/broadcast'
        : CONFIG.API_BASE + '/api/messages';

      var payload = {
        from_node: from,
        msg_type: type,
        subject: subject,
        content: content || '',
        priority: priority,
        attention: attention,
        requires_ack: ack
      };
      if (!isBroadcast) {
        payload.to_node = to;
      }

      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        resultEl.className = 'msg-compose-result success';
        resultEl.textContent = '✓ Message sent' + (isBroadcast ? ' to fleet' : ' to ' + to);
        // Clear form
        document.getElementById('msg-subject').value = '';
        document.getElementById('msg-content').value = '';
        // Refresh after short delay
        setTimeout(function() { Messaging.loadAll(); }, 1500);
      } else {
        var err = await resp.text();
        resultEl.className = 'msg-compose-result error';
        resultEl.textContent = '✗ Failed: ' + (err || resp.status);
      }
    } catch(e) {
      resultEl.className = 'msg-compose-result error';
      resultEl.textContent = '✗ Error: ' + e.message;
    }
  },

  /* ─── Filters ─── */
  setFilterNode: function(val) {
    Messaging.filterNode = val;
    Messaging.render();
  },
  setFilterType: function(val) {
    Messaging.filterType = val;
    Messaging.render();
  },
  toggleUnread: function(checked) {
    Messaging.filterUnread = checked;
    Messaging.render();
  },

  getFiltered: function() {
    return Messaging.messages.filter(function(m) {
      if (Messaging.filterNode !== 'all') {
        if (m.from_node !== Messaging.filterNode && m.to_node !== Messaging.filterNode) return false;
      }
      if (Messaging.filterType !== 'all' && m.msg_type !== Messaging.filterType) return false;
      if (Messaging.filterUnread && m.status !== 'unread') return false;
      return true;
    });
  },

  /* ─── Grouping ─── */
  groupByDate: function(messages) {
    var groups = {};
    var tz = CONFIG.DISPLAY_TIME_ZONE;
    var dateFmt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
    var todayStr = new Date().toLocaleDateString('en-US', dateFmt);
    var yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-US', dateFmt);

    messages.forEach(function(m) {
      var d = new Date(m.created_at);
      var ds = d.toLocaleDateString('en-US', dateFmt);
      var label;
      if (ds === todayStr) label = 'Today';
      else if (ds === yesterdayStr) label = 'Yesterday';
      else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });

      if (!groups[label]) groups[label] = [];
      groups[label].push(m);
    });

    return groups;
  },

  /* ─── Helpers ─── */
  formatTime: function(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: CONFIG.DISPLAY_TIME_ZONE
      });
    } catch(e) { return ''; }
  },

  renderMarkdown: function(text) {
    // Reuse Cairn's markdown renderer if available
    if (typeof Cairn !== 'undefined' && Cairn.renderMd) {
      return Cairn.renderMd(text);
    }
    // Fallback: basic markdown to HTML
    if (typeof marked !== 'undefined') {
      var html = marked.parse(text);
      return '<div class="cairn-markdown md-rendered">' + html + '</div>';
    }
    // Plain text fallback with line breaks
    return '<div class="cairn-markdown md-rendered"><p>' + Messaging.esc(text).replace(/\n/g, '<br>') + '</p></div>';
  },

  esc: function(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  updateBadge: function() {
    var badge = document.getElementById('main-panel-badge');
    if (!badge) return;
    var unread = Messaging.messages.filter(function(m) { return m.status === 'unread'; }).length;
    badge.textContent = unread > 0 ? unread + ' unread' : Messaging.messages.length + ' messages';
  }
};
