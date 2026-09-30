/* Superdash v2 -- MOTD Schedule Manager
   Wires to coordinator /api/motd endpoints (Option A: coordinator-native timer) */

var MOTD = {
  schedules: [],
  loading: false,
  editingId: null,

  async load() {
    MOTD.loading = true;
    try {
      var resp = await fetch(CONFIG.API_BASE + '/api/motd', {
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
      });
      if (resp.ok) {
        var data = await resp.json();
        MOTD.schedules = Array.isArray(data) ? data : (data.schedules || []);
      }
    } catch (e) {
      console.error('[MOTD] Load failed:', e.message);
    }
    MOTD.loading = false;
  },

  renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'MOTD Schedules';
    badge.textContent = MOTD.schedules.length ? MOTD.schedules.length + ' active' : '';

    var html = '<div class="motd-panel">';

    // Create/Edit form
    var formTitle = MOTD.editingId ? 'Edit MOTD Schedule' : 'New MOTD Schedule';
    var formBtn = MOTD.editingId ? 'Save Changes' : 'Create Schedule';
    var cancelBtn = MOTD.editingId ? ' <button class="btn btn-cancel" onclick="MOTD.cancelEdit()">Cancel</button>' : '';
    html += '<div class="motd-create">'
      + '<div class="motd-section-title">' + formTitle + '</div>'
      + '<div class="form-group"><label class="form-label">Message Content</label>'
      + '<textarea class="form-textarea" id="motd-content" rows="3" placeholder="MOTD message body -- supports markdown..."></textarea></div>'
      + '<div class="form-row">'
      + '<div class="form-group"><label class="form-label">Interval (min)</label>'
      + '<input type="number" class="form-input" id="motd-interval" value="45" min="5" max="1440"></div>'
      + '<div class="form-group"><label class="form-label">Priority</label>'
      + '<select class="form-select" id="motd-priority">'
      + '<option value="1">1 -- Critical</option>'
      + '<option value="2" selected>2 -- High</option>'
      + '<option value="3">3 -- Normal</option>'
      + '</select></div>'
      + '<div class="form-group"><label class="form-label">Subject</label>'
      + '<input type="text" class="form-input" id="motd-subject" placeholder="MOTD subject line..." value="MOTD"></div>'
      + '</div>'
      + '<div class="form-actions">'
      + '<button class="btn btn-send" onclick="MOTD.create()">' + formBtn + '</button>'
      + cancelBtn
      + '</div>'
      + '<div id="motd-result" class="motd-result" style="display:none"></div>'
      + '</div>';

    // Active schedules list
    html += '<div class="motd-section-title" style="margin-top:16px">Active Schedules</div>';

    if (MOTD.loading) {
      html += '<div class="motd-empty">Loading...</div>';
    } else if (!MOTD.schedules.length) {
      html += '<div class="motd-empty">No MOTD schedules configured. Create one above.</div>';
    } else {
      html += '<div class="motd-list">';
      MOTD.schedules.forEach(function(s) {
        var lastSent = s.last_fired_at ? MOTD.relativeTime(s.last_fired_at) : (s.last_sent ? MOTD.relativeTime(s.last_sent) : 'never');
        var interval = s.interval_minutes || s.interval || '?';
        var pLabel = s.priority === 1 ? 'P1' : s.priority === 2 ? 'P2' : 'P3';
        var enabled = s.enabled !== false;

        html += '<div class="motd-card">'
          + '<div class="motd-card-header">'
          + '<span class="motd-card-subject">' + Panels.esc(s.subject || 'MOTD') + '</span>'
          + '<span class="motd-card-meta">' + pLabel + ' - every ' + interval + 'min' + (enabled ? '' : ' - DISABLED') + '</span>'
          + '<button class="motd-edit" onclick="MOTD.edit(\'' + s.id + '\')" title="Edit">&#9998;</button>'
          + '<button class="motd-delete" onclick="MOTD.remove(\'' + s.id + '\')" title="Delete">&#10005;</button>'
          + '</div>'
          + '<div class="motd-card-content">' + Panels.esc(s.message || s.content || '').substring(0, 200) + '</div>'
          + '<div class="motd-card-timing">'
          + '<span>Last sent: ' + lastSent + '</span>'
          + '<span>By: ' + Panels.esc(s.created_by || '--') + '</span>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    content.innerHTML = html;
  },

  async create() {
    var contentEl = document.getElementById('motd-content');
    var intervalEl = document.getElementById('motd-interval');
    var priorityEl = document.getElementById('motd-priority');
    var subjectEl = document.getElementById('motd-subject');
    var resultEl = document.getElementById('motd-result');

    var body = (contentEl.value || '').trim();
    if (!body) {
      MOTD.showResult(resultEl, 'error', 'Content is required');
      return;
    }

    var payload = {
      message: body,
      subject: subjectEl.value || 'MOTD',
      interval_minutes: parseInt(intervalEl.value) || 45,
      priority: parseInt(priorityEl.value) || 2,
      created_by: 'OPERATOR',
      msg_type: 'motd',
      targets: 'all'
    };

    MOTD.showResult(resultEl, 'sending', MOTD.editingId ? 'Saving changes...' : 'Creating schedule...');

    try {
      // If editing, delete the old schedule first
      if (MOTD.editingId) {
        var delResp = await fetch(CONFIG.API_BASE + '/api/motd/' + MOTD.editingId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
        });
        if (!delResp.ok) {
          MOTD.showResult(resultEl, 'error', 'Failed to remove old schedule');
          return;
        }
      }

      var resp = await fetch(CONFIG.API_BASE + '/api/motd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        MOTD.showResult(resultEl, 'success', MOTD.editingId ? '[ok] MOTD schedule updated' : '[ok] MOTD schedule created');
        MOTD.editingId = null;
        contentEl.value = '';
        await MOTD.load();
        MOTD.renderPanel();
      } else {
        var err = await resp.text();
        MOTD.showResult(resultEl, 'error', 'Failed: ' + err);
      }
    } catch (e) {
      MOTD.showResult(resultEl, 'error', 'Error: ' + e.message);
    }
  },

  async remove(id) {
    try {
      var resp = await fetch(CONFIG.API_BASE + '/api/motd/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN }
      });
      if (resp.ok) {
        if (MOTD.editingId === id) MOTD.editingId = null;
        await MOTD.load();
        MOTD.renderPanel();
      }
    } catch (e) {
      console.error('[MOTD] Delete failed:', e.message);
    }
  },

  edit(id) {
    var schedule = MOTD.schedules.find(function(s) { return String(s.id) === String(id); });
    if (!schedule) return;

    MOTD.editingId = id;
    // Re-render to update form title/button
    MOTD.renderPanel();

    // Pre-fill form fields after render
    setTimeout(function() {
      var contentEl = document.getElementById('motd-content');
      var intervalEl = document.getElementById('motd-interval');
      var priorityEl = document.getElementById('motd-priority');
      var subjectEl = document.getElementById('motd-subject');

      if (contentEl) contentEl.value = schedule.message || schedule.content || '';
      if (intervalEl) intervalEl.value = schedule.interval_minutes || schedule.interval || 45;
      if (priorityEl) priorityEl.value = String(schedule.priority || 2);
      if (subjectEl) subjectEl.value = schedule.subject || 'MOTD';

      // Scroll to form
      var form = document.querySelector('.motd-create');
      if (form) form.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  },

  cancelEdit() {
    MOTD.editingId = null;
    MOTD.renderPanel();
  },

  showResult(el, type, msg) {
    el.style.display = 'block';
    el.className = 'motd-result ' + type;
    el.textContent = msg;
    if (type === 'success') {
      setTimeout(function() { el.style.display = 'none'; }, 3000);
    }
  },

  relativeTime(ts) {
    var now = Date.now();
    var t = new Date(ts).getTime();
    var diff = Math.abs(now - t);
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ' + (t > now ? 'from now' : 'ago');
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ' + (t > now ? 'from now' : 'ago');
    var days = Math.floor(hrs / 24);
    return days + 'd ' + (t > now ? 'from now' : 'ago');
  },

  renderInto(container) {
    var html = '<div class="motd-panel">';

    var formTitle = MOTD.editingId ? 'Edit MOTD Schedule' : 'New MOTD Schedule';
    var formBtn = MOTD.editingId ? 'Save Changes' : 'Create Schedule';
    var cancelBtn = MOTD.editingId ? ' <button class="btn btn-cancel" onclick="MOTD.cancelEdit()">Cancel</button>' : '';
    html += '<div class="motd-create">'
      + '<div class="motd-section-title">' + formTitle + '</div>'
      + '<div class="form-group"><label class="form-label">Message Content</label>'
      + '<textarea class="form-textarea" id="motd-content" rows="3" placeholder="MOTD message body -- supports markdown..."></textarea></div>'
      + '<div class="form-row">'
      + '<div class="form-group"><label class="form-label">Interval (min)</label>'
      + '<input type="number" class="form-input" id="motd-interval" value="45" min="5" max="1440"></div>'
      + '<div class="form-group"><label class="form-label">Priority</label>'
      + '<select class="form-select" id="motd-priority">'
      + '<option value="1">1 -- Crit</option>'
      + '<option value="2" selected>2 -- High</option>'
      + '<option value="3">3 -- Normal</option>'
      + '</select></div>'
      + '<div class="form-group"><label class="form-label">Subject</label>'
      + '<input type="text" class="form-input" id="motd-subject" placeholder="MOTD subject..." value="MOTD"></div>'
      + '</div>'
      + '<div class="form-actions">'
      + '<button class="btn btn-send" onclick="MOTD.create()">' + formBtn + '</button>'
      + cancelBtn
      + '</div>'
      + '<div id="motd-result" class="motd-result" style="display:none"></div>'
      + '</div>';

    html += '<div class="motd-section-title" style="margin-top:12px">Active Schedules</div>';

    if (MOTD.loading) {
      html += '<div class="motd-empty">Loading...</div>';
    } else if (!MOTD.schedules.length) {
      html += '<div class="motd-empty">No MOTD schedules configured. Create one above.</div>';
    } else {
      html += '<div class="motd-list">';
      MOTD.schedules.forEach(function(s) {
        var lastSent = s.last_fired_at ? MOTD.relativeTime(s.last_fired_at) : (s.last_sent ? MOTD.relativeTime(s.last_sent) : 'never');
        var interval = s.interval_minutes || s.interval || '?';
        var pLabel = s.priority === 1 ? 'P1' : s.priority === 2 ? 'P2' : 'P3';
        var enabled = s.enabled !== false;

        html += '<div class="motd-card">'
          + '<div class="motd-card-header">'
          + '<span class="motd-card-subject">' + Panels.esc(s.subject || 'MOTD') + '</span>'
          + '<span class="motd-card-meta">' + pLabel + ' - every ' + interval + 'min' + (enabled ? '' : ' - DISABLED') + '</span>'
          + '<button class="motd-edit" onclick="MOTD.edit(\'' + s.id + '\')" title="Edit">&#9998;</button>'
          + '<button class="motd-delete" onclick="MOTD.remove(\'' + s.id + '\')" title="Delete">&#10005;</button>'
          + '</div>'
          + '<div class="motd-card-content">' + Panels.esc(s.message || s.content || '').substring(0, 200) + '</div>'
          + '<div class="motd-card-timing">'
          + '<span>Last: ' + lastSent + '</span>'
          + '<span>By: ' + Panels.esc(s.created_by || '--') + '</span>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }
};
