/* Superdash v2 -- Node Chat View (CLI-style per-node conversation)
   Default: OPERATOR <-> selected NODE. Filters for peers, noise types. */

var Messages = {
  cache: {},
  allMessages: [],
  activeNode: null,

  // Filter state
  viewMode: 'operator',        // 'operator' (OPERATOR<->NODE) | 'all'
  hiddenPeers: {},             // {nodeId: true} -- peers to hide
  hiddenTypes: {               // msg_types to hide by default
    'heartbeat': true,
    'motd': true,
    'ack': true,
    'status_update': true,
    'reboot_request': true,
    'victory': true,           // SWAT-0002: skill/MOLT victory blasts (forward-compat for SWAT-0001)
    'molt_announce': true      // SWAT-0002: MOLT lifecycle announcements (forward-compat for SWAT-0001)
  },
  hiddenSenders: {             // senders to hide
    'SYSTEM': false            // off by default, toggleable
  },

  // SWAT-0002: NOISE_TYPES drives the Hide-chip row.
  NOISE_TYPES: ['heartbeat', 'motd', 'ack', 'status_update', 'reboot_request', 'victory', 'molt_announce'],

  // SWAT-0002 v2 (DRAGON #58045): content/subject pattern overlay for retroactive
  // MOLT-blast catch + variant-resilience. Surgical pattern-match avoids the
  // 'toggle-off-info-as-class' footgun (info covers most legit peer DMs).
  MOLT_BLAST_PATTERNS: [
    /^To new beginnings!/,                 // existing 4 historical blasts content prefix
    /^MOLT (announce|complete|victory)/i,  // future variant subjects
    /molt-(blast|victory|announce)/i       // tag-style variants
  ],

  async loadForNode(nodeId) {
    Messages.activeNode = nodeId;
    // Fetch node messages AND OPERATOR messages in parallel
    // OPERATOR messages are stored in OPERATOR's queue, not the recipient's
    var results = await Promise.allSettled([
      API.get('/api/messages/' + nodeId + '?status=all&include_sent=true&limit=200'),
      API.get('/api/messages/OPERATOR?status=all&include_sent=true&limit=200')
    ]);
    var nodeData = results[0].status === 'fulfilled' ? results[0].value : null;
    var opData = results[1].status === 'fulfilled' ? results[1].value : null;

    var msgs = [];
    var seenIds = {};
    // Parse node messages
    if (nodeData && nodeData.messages) {
      nodeData.messages.forEach(function(m) {
        m._dir = (m.from_node === nodeId) ? 'outbound' : 'inbound';
        if (!seenIds[m.id]) { msgs.push(m); seenIds[m.id] = true; }
      });
    } else if (nodeData && nodeData.inbox) {
      (nodeData.inbox || []).forEach(function(m) { m._dir = 'inbound'; if (!seenIds[m.id]) { msgs.push(m); seenIds[m.id] = true; } });
      (nodeData.sent || []).forEach(function(m) { m._dir = 'outbound'; if (!seenIds[m.id]) { msgs.push(m); seenIds[m.id] = true; } });
    }
    // Merge OPERATOR messages that involve this node
    if (opData && opData.messages) {
      opData.messages.forEach(function(m) {
        if (seenIds[m.id]) return;
        if (m.from_node === 'OPERATOR' && m.to_node === nodeId) {
          m._dir = 'inbound';
          msgs.push(m); seenIds[m.id] = true;
        } else if (m.from_node === nodeId && m.to_node === 'OPERATOR') {
          m._dir = 'outbound';
          msgs.push(m); seenIds[m.id] = true;
        }
      });
    } else if (opData && opData.inbox) {
      (opData.inbox || []).forEach(function(m) {
        if (seenIds[m.id]) return;
        if (m.from_node === nodeId) { m._dir = 'outbound'; msgs.push(m); seenIds[m.id] = true; }
      });
      (opData.sent || []).forEach(function(m) {
        if (seenIds[m.id]) return;
        if (m.to_node === nodeId) { m._dir = 'inbound'; msgs.push(m); seenIds[m.id] = true; }
      });
    }
    // Sort chronological (oldest first, like CLI)
    msgs.sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    Messages.cache[nodeId] = msgs;
    Messages.allMessages = msgs;
    return msgs;
  },

  // Apply filters and return visible messages
  getFiltered: function() {
    var nodeId = Messages.activeNode;
    return Messages.allMessages.filter(function(m) {
      // View mode: operator = only OPERATOR<->NODE conversations
      if (Messages.viewMode === 'operator') {
        var isOperatorMsg = (m.from_node === 'OPERATOR' && m.to_node === nodeId)
          || (m.from_node === nodeId && m.to_node === 'OPERATOR');
        if (!isOperatorMsg) return false;
      }
      // Hidden peers
      if (Messages.hiddenPeers[m.from_node]) return false;
      if (Messages.hiddenPeers[m.to_node]) return false;
      // Hidden senders (e.g. SYSTEM)
      if (Messages.hiddenSenders[m.from_node]) return false;
      // Hidden msg types
      if (Messages.hiddenTypes[m.msg_type]) return false;
      // SWAT-0002 v2: pattern overlay for MOLT-blast/legacy noise (DRAGON #58045)
      var sub = m.subject || '';
      var body = m.content || '';
      for (var i = 0; i < Messages.MOLT_BLAST_PATTERNS.length; i++) {
        var p = Messages.MOLT_BLAST_PATTERNS[i];
        if (p.test(sub) || p.test(body)) return false;
      }
      return true;
    });
  },

  // Get unique peers in the message set (for filter chips)
  getPeers: function() {
    var nodeId = Messages.activeNode;
    var peers = {};
    Messages.allMessages.forEach(function(m) {
      if (m.from_node && m.from_node !== nodeId && m.from_node !== 'OPERATOR') peers[m.from_node] = true;
      if (m.to_node && m.to_node !== nodeId && m.to_node !== 'OPERATOR') peers[m.to_node] = true;
    });
    // Also add SYSTEM if present
    if (Messages.allMessages.some(function(m) { return m.from_node === 'SYSTEM'; })) {
      peers['SYSTEM'] = true;
    }
    return Object.keys(peers).sort();
  },

  // Render the full chat panel (filter bar + chat feed + composer)
  renderChat: function(nodeId) {
    var content = document.getElementById('main-content');
    var panelTitle = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');

    panelTitle.textContent = nodeId + ' -- Chat';
    Messages.activeNode = nodeId;

    var filtered = Messages.getFiltered();
    var totalCount = Messages.allMessages.length;
    var shownCount = filtered.length;
    badge.textContent = shownCount + '/' + totalCount;

    var html = '';

    // Filter bar
    html += Messages._renderFilterBar(nodeId);

    // Chat feed
    html += '<div class="chat-feed" id="chat-feed">';
    if (filtered.length === 0) {
      html += '<div class="chat-empty">No messages match filters</div>';
    } else {
      filtered.forEach(function(m) {
        html += Messages._renderBubble(m, nodeId);
      });
    }
    html += '</div>';

    // Composer
    html += Messages._renderComposer(nodeId);

    content.innerHTML = html;
    content.classList.add('chat-layout');

    // Mark main column for chat-active layout stretch
    var mainCol = content.closest('.main');
    if (mainCol) mainCol.classList.add('chat-active');
    var cockpit = document.querySelector('.cockpit');
    if (cockpit) cockpit.classList.add('chat-grid-mode');

    // Scroll feed to bottom
    var feed = document.getElementById('chat-feed');
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }

    // Wire composer
    Messages._wireComposer(nodeId);
    // Wire template prefill bar (OPERATOR shortcuts above composer)
    Messages._wireTemplateBar(nodeId);
    // Wire filters
    Messages._wireFilters(nodeId);
  },

  _renderFilterBar: function(nodeId) {
    var peers = Messages.getPeers();

    var html = '<div class="chat-filter-bar">';

    // Row 1: View mode
    html += '<div class="chat-filter-row">';
    html += '<span class="chat-filter-label">View</span>';
    html += '<button class="chat-chip' + (Messages.viewMode === 'operator' ? ' on' : '') + '" data-action="view" data-val="operator">OPERATOR \u2194 ' + nodeId + '</button>';
    html += '<button class="chat-chip' + (Messages.viewMode === 'all' ? ' on' : '') + '" data-action="view" data-val="all">All traffic</button>';
    html += '</div>';

    // Row 2: Peer toggles (only in 'all' mode)
    if (Messages.viewMode === 'all' && peers.length > 0) {
      html += '<div class="chat-filter-row">';
      html += '<span class="chat-filter-label">Show</span>';
      peers.forEach(function(p) {
        var hidden = Messages.hiddenPeers[p] || Messages.hiddenSenders[p];
        var color = (typeof Nodes !== 'undefined' && Nodes.getColor) ? Nodes.getColor(p) : '#888';
        html += '<button class="chat-chip peer-chip' + (hidden ? ' off' : ' on') + '" data-action="peer" data-val="' + p + '" style="' + (hidden ? '' : 'border-color:' + color + ';color:' + color) + '">' + p + '</button>';
      });
      html += '</div>';
    }

    // Row 3: Noise type toggles
    html += '<div class="chat-filter-row">';
    html += '<span class="chat-filter-label">Hide</span>';
    Messages.NOISE_TYPES.forEach(function(t) {
      var hidden = Messages.hiddenTypes[t];
      html += '<button class="chat-chip' + (hidden ? ' on' : ' off') + '" data-action="noise" data-val="' + t + '">' + t + '</button>';
    });
    html += '</div>';

    html += '</div>';
    return html;
  },

  _renderBubble: function(m, nodeId) {
    var isOutbound = (m.from_node === nodeId);
    var isOperator = (m.from_node === 'OPERATOR');
    var dirClass = isOperator ? 'chat-bubble-operator' : (isOutbound ? 'chat-bubble-out' : 'chat-bubble-in');
    var color = (typeof Nodes !== 'undefined' && Nodes.getColor) ? Nodes.getColor(m.from_node) : '#888';
    var time = Messages.formatTime(m.created_at);

    // RFC548x1 idle_burn_alert render: parse payload once, derive tier-aware chrome
    var ibPayload = null;
    var ibChrome = '';
    if (m.msg_type === 'idle_burn_alert') {
      try {
        ibPayload = JSON.parse(m.content || '{}');
        var ibTier = String(ibPayload.tier || '').toLowerCase();
        if (m.attention && ['t1', 't3', 't5'].indexOf(ibTier) >= 0) {
          ibChrome = ' chat-bubble-attention chat-bubble-attention-' + ibTier;
        }
      } catch (e) {
        console.warn('idle_burn_alert payload parse failed:', e, m.id);
        ibPayload = '__malformed__';
      }
    }

    var html = '<div class="chat-bubble ' + dirClass + ibChrome + '">';
    // Header: sender -> receiver, type, time
    html += '<div class="chat-bubble-header">';
    html += '<span class="chat-bubble-from" style="color:' + color + '">' + Panels.esc(m.from_node || '??') + '</span>';
    if (m.to_node) {
      var toColor = (typeof Nodes !== 'undefined' && Nodes.getColor) ? Nodes.getColor(m.to_node) : '#888';
      html += ' <span class="chat-bubble-arrow">\u2192</span> ';
      html += '<span style="color:' + toColor + '">' + Panels.esc(m.to_node) + '</span>';
    }
    html += '<span class="chat-bubble-meta">';
    html += '<span class="chat-bubble-type">' + Panels.esc(m.msg_type || 'info') + '</span>';
    if (m.msg_type === 'idle_burn_alert') {
      if (ibPayload === '__malformed__') {
        html += '<span class="tier-pill tier-pill-malformed">[malformed]</span>';
      } else if (ibPayload && ibPayload.tier) {
        var tierLc = String(ibPayload.tier).toLowerCase();
        html += '<span class="tier-pill tier-pill-' + Panels.esc(tierLc) + '">' + Panels.esc(ibPayload.tier) + '</span>';
      }
    }
    html += '<span class="chat-bubble-time">' + time + '</span>';
    html += '</span>';
    html += '</div>';

    // Subject -- collapse when it equals content (conversational msgs are typed
    // identically in subject+content -> doubled render). Superdash chat fix
    // (OPERATOR-routed via DRAGON; UXIA at-source, DRAGON cosign #78605).
    if (m.subject && m.subject !== m.content) {
      html += '<div class="chat-bubble-subject">' + Panels.esc(m.subject) + '</div>';
    }
    // RFC548x1 idle_burn_alert dense summary + collapsible payload (valid-payload path only)
    if (m.msg_type === 'idle_burn_alert' && ibPayload && ibPayload !== '__malformed__') {
      var pr = ibPayload.predicate_result || {};
      var rs = ibPayload.routing_state || {};
      var nh = function (v) { return (v === null || v === undefined) ? '--' : v; };
      html += '<div class="idle-burn-summary">';
      html += 'tier=' + Panels.esc(String(ibPayload.tier || '?')) + ' \u00b7 ';
      html += 'role=' + Panels.esc(String(ibPayload.role || '?')) + ' \u00b7 ';
      html += 'age=' + Panels.esc(String(nh(pr.artifact_age_seconds))) + 's \u00b7 ';
      html += 'session=' + Panels.esc(String(nh(rs.session_age_seconds))) + 's \u00b7 ';
      html += 'work=' + Panels.esc(String(nh(rs.active_work_turns))) + '/\u0394' + Panels.esc(String(nh(rs.active_work_turns_delta))) + ' \u00b7 ';
      html += 'budget=' + Panels.esc(String(nh(rs.budget_pct))) + '%';
      html += '</div>';
      html += '<details class="idle-burn-detail"><summary>payload</summary><pre>' + Panels.esc(JSON.stringify(ibPayload, null, 2)) + '</pre></details>';
    }
    // Content (with markdown if available, truncated)
    if (m.content) {
      var body = m.content;
      if (body.length > 500) body = body.substring(0, 500) + '...';
      if (typeof marked !== 'undefined') {
        try { html += '<div class="chat-bubble-body cairn-markdown">' + marked.parse(body) + '</div>'; }
        catch(e) { html += '<div class="chat-bubble-body">' + Panels.esc(body) + '</div>'; }
      } else {
        html += '<div class="chat-bubble-body">' + Panels.esc(body) + '</div>';
      }
    }
    html += '</div>';
    return html;
  },

  // Chat templates (OPERATOR-editable prefill buttons).
  // Persisted in localStorage so they survive reloads. Per-browser, fleet-wide
  // (not per-node) because OPERATOR sends the same canonical prompts to anyone.
  _TPL_KEY: 'chat-templates-v1',
  _TPL_DEFAULTS: [
    'Sitrep please -- what are you working on right now, and what is your next concrete next action?',
    'Pause whatever you are doing and reply with a one-line health check (node, role, last action, blockers).',
    'Hand this thread back to PM and stand down. Mark your queue idle until PM picks it up.'
  ],
  _tplEditing: false,

  _loadTemplates: function() {
    try {
      var raw = localStorage.getItem(Messages._TPL_KEY);
      if (!raw) return Messages._TPL_DEFAULTS.slice();
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== 3) return Messages._TPL_DEFAULTS.slice();
      return arr.map(function(s) { return typeof s === 'string' ? s : ''; });
    } catch (e) {
      return Messages._TPL_DEFAULTS.slice();
    }
  },

  _saveTemplates: function(arr) {
    try {
      localStorage.setItem(Messages._TPL_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  },

  _escAttr: function(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _renderTemplateBar: function() {
    var tpls = Messages._loadTemplates();
    if (Messages._tplEditing) {
      var html = '<div class="chat-templates chat-templates-edit" id="chat-templates">';
      for (var i = 0; i < 3; i++) {
        html += '<div class="chat-tpl-edit-row">';
        html += '<label class="chat-tpl-edit-label">Template ' + (i + 1) + '</label>';
        html += '<textarea class="chat-tpl-edit-area" data-tpl-idx="' + i + '" rows="2">' + Messages._escAttr(tpls[i] || '') + '</textarea>';
        html += '</div>';
      }
      html += '<div class="chat-tpl-edit-actions">';
      html += '<button class="chat-tpl-save-btn" id="chat-tpl-save">Save templates</button>';
      html += '<button class="chat-tpl-cancel-btn" id="chat-tpl-cancel">Cancel</button>';
      html += '<button class="chat-tpl-reset-btn" id="chat-tpl-reset" title="Restore default templates">Reset</button>';
      html += '</div>';
      html += '</div>';
      return html;
    }
    var html2 = '<div class="chat-templates" id="chat-templates">';
    for (var j = 0; j < 3; j++) {
      var label = (tpls[j] || '').split(/\s+/).slice(0, 4).join(' ') || ('Template ' + (j + 1));
      if (label.length > 32) label = label.substring(0, 30) + '…';
      html2 += '<button class="chat-tpl-btn" data-tpl-idx="' + j + '" title="' + Messages._escAttr(tpls[j] || '') + '">' + Messages._escAttr(label) + '</button>';
    }
    html2 += '<button class="chat-tpl-edit-btn" id="chat-tpl-edit" title="Edit templates">Edit ✎</button>';
    html2 += '</div>';
    return html2;
  },

  _wireTemplateBar: function(nodeId) {
    var bar = document.getElementById('chat-templates');
    if (!bar) return;
    var input = document.getElementById('chat-input');

    if (Messages._tplEditing) {
      var saveBtn = document.getElementById('chat-tpl-save');
      var cancelBtn = document.getElementById('chat-tpl-cancel');
      var resetBtn = document.getElementById('chat-tpl-reset');
      if (saveBtn) saveBtn.addEventListener('click', function() {
        var areas = bar.querySelectorAll('.chat-tpl-edit-area');
        var next = [];
        for (var i = 0; i < areas.length; i++) next.push(areas[i].value);
        while (next.length < 3) next.push('');
        Messages._saveTemplates(next.slice(0, 3));
        Messages._tplEditing = false;
        Messages._rerenderComposerArea(nodeId);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', function() {
        Messages._tplEditing = false;
        Messages._rerenderComposerArea(nodeId);
      });
      if (resetBtn) resetBtn.addEventListener('click', function() {
        var areas = bar.querySelectorAll('.chat-tpl-edit-area');
        for (var i = 0; i < areas.length && i < Messages._TPL_DEFAULTS.length; i++) {
          areas[i].value = Messages._TPL_DEFAULTS[i];
        }
      });
      return;
    }

    var editBtn = document.getElementById('chat-tpl-edit');
    if (editBtn) editBtn.addEventListener('click', function() {
      Messages._tplEditing = true;
      Messages._rerenderComposerArea(nodeId);
    });

    var tplButtons = bar.querySelectorAll('.chat-tpl-btn');
    var tpls = Messages._loadTemplates();
    for (var k = 0; k < tplButtons.length; k++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.getAttribute('data-tpl-idx'), 10);
          if (isNaN(idx) || !input) return;
          input.value = tpls[idx] || '';
          input.focus();
        });
      })(tplButtons[k]);
    }
  },

  _rerenderComposerArea: function(nodeId) {
    // Re-renders just the template-bar + composer block in-place after edit/save toggles.
    var existingBar = document.getElementById('chat-templates');
    var existingComposer = document.getElementById('chat-composer');
    if (!existingBar || !existingComposer || !existingComposer.parentNode) return;
    var parent = existingComposer.parentNode;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = Messages._renderTemplateBar() + Messages._renderComposerInner(nodeId);
    // Replace bar
    parent.replaceChild(wrapper.firstChild, existingBar);
    // Replace composer (now second child of wrapper after first was moved out)
    parent.replaceChild(wrapper.firstChild, existingComposer);
    Messages._wireTemplateBar(nodeId);
    Messages._wireComposer(nodeId);
  },

  _renderComposerInner: function(nodeId) {
    var html = '<div class="chat-composer" id="chat-composer">';
    html += '<input type="text" class="chat-input" id="chat-input" placeholder="Message ' + nodeId + ' as OPERATOR..." />';
    html += '<select class="chat-type-select" id="chat-type-select">';
    html += '<option value="info">info</option>';
    html += '<option value="request">request</option>';
    html += '<option value="delegation">delegation</option>';
    html += '</select>';
    html += '<button class="chat-send-btn" id="chat-send-btn">Send</button>';
    html += '<div class="chat-send-status" id="chat-send-status"></div>';
    html += '</div>';
    return html;
  },

  _renderComposer: function(nodeId) {
    return Messages._renderTemplateBar() + Messages._renderComposerInner(nodeId);
  },

  _wireComposer: function(nodeId) {
    var input = document.getElementById('chat-input');
    var btn = document.getElementById('chat-send-btn');
    var typeSelect = document.getElementById('chat-type-select');
    if (!input || !btn) return;

    var doSend = async function() {
      var text = input.value.trim();
      if (!text) return;
      var status = document.getElementById('chat-send-status');
      btn.disabled = true;
      if (status) { status.textContent = 'Sending...'; status.className = 'chat-send-status'; }

      try {
        var resp = await fetch(CONFIG.API_BASE + '/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN },
          body: JSON.stringify({
            from_node: 'OPERATOR',
            to_node: nodeId,
            msg_type: typeSelect ? typeSelect.value : 'info',
            subject: text.substring(0, 80),
            content: text
          })
        });
        if (!resp.ok) {
          var err = await resp.json().catch(function() { return {}; });
          throw new Error(err.error || err.detail || resp.statusText);
        }
        input.value = '';
        if (status) { status.textContent = '\u2713 Sent'; status.className = 'chat-send-status success'; }
        // Reload messages after delay (show "Sent" briefly first)
        setTimeout(async function() {
          await Messages.loadForNode(nodeId);
          Messages.renderChat(nodeId);
        }, 1500);
      } catch(e) {
        if (status) { status.textContent = '\u26a0 ' + e.message; status.className = 'chat-send-status error'; }
        btn.disabled = false;
      }
    };

    btn.addEventListener('click', doSend);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSend();
    });
  },

  _wireFilters: function(nodeId) {
    var bar = document.querySelector('.chat-filter-bar');
    if (!bar) return;
    bar.addEventListener('click', function(e) {
      var chip = e.target.closest('.chat-chip');
      if (!chip) return;
      var action = chip.dataset.action;
      var val = chip.dataset.val;

      if (action === 'view') {
        Messages.viewMode = val;
      } else if (action === 'peer') {
        // Toggle peer visibility
        if (Messages.hiddenPeers[val]) {
          delete Messages.hiddenPeers[val];
        } else {
          Messages.hiddenPeers[val] = true;
        }
        // Also handle SYSTEM in hiddenSenders
        if (val === 'SYSTEM') {
          Messages.hiddenSenders['SYSTEM'] = !Messages.hiddenSenders['SYSTEM'];
        }
      } else if (action === 'noise') {
        Messages.hiddenTypes[val] = !Messages.hiddenTypes[val];
      }
      // Re-render (preserves scroll intent)
      Messages.renderChat(nodeId);
    });
  },

  formatTime: function(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: CONFIG.DISPLAY_TIME_ZONE
      });
    } catch (e) {
      return '';
    }
  }
};
