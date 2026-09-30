/* CAIRN scratch pad extensions */
Object.assign(Cairn, {
  async loadScratch() {
    Cairn.view = 'scratch';
    Cairn.setLoading(true);
    var data = await API.cairnScratchRead();
    Cairn.setLoading(false);
    if (!data || data.error) {
      Cairn.renderError('Failed to load scratch: ' + (data ? data.error : 'network'));
      return;
    }
    Cairn.scratchData = data;
    Cairn.renderScratch();
    Cairn.startScratchRefresh();
  },

  startScratchRefresh() {
    Cairn.stopScratchRefresh();
    Cairn.scratchRefreshTimer = setInterval(function() {
      if (Cairn.activeTab === 'scratch' && Cairn.open) {
        Cairn.loadScratch();
      }
    }, 30000); // refresh every 30s
  },

  stopScratchRefresh() {
    if (Cairn.scratchRefreshTimer) {
      clearInterval(Cairn.scratchRefreshTimer);
      Cairn.scratchRefreshTimer = null;
    }
  },

  renderScratch() {
    var body = document.getElementById('cairn-body');
    var entries = (Cairn.scratchData && Cairn.scratchData.entries) || [];

    var html = '<div class="cairn-scratch">';
    html += '<div class="cairn-scratch-header">';
    html += '<span class="cairn-scratch-title">📝 Scratch Pad</span>';
    html += '<span class="cairn-scratch-count">' + entries.length + ' note' + (entries.length !== 1 ? 's' : '') + '</span>';
    html += '<span class="cairn-scratch-live">● LIVE</span>';
    html += '</div>';

    if (!entries.length) {
      html += '<div class="cairn-empty">No scratch notes yet. Drop ideas via <code>cairn_scratch</code>.</div>';
    } else {
      html += '<div class="cairn-scratch-feed">';
      entries.forEach(function(entry, idx) {
        var timeLeft = Cairn.timeUntil(entry.expires_at);
        var tags = entry.tags ? entry.tags.split(',').filter(Boolean) : [];
        var isExpiring = timeLeft.hours < 24;
        var preview = (entry.content || '').substring(0, 180);
        if ((entry.content || '').length > 180) preview += '…';

        html += '<div class="cairn-scratch-entry' + (isExpiring ? ' cairn-expiring' : '') + '" data-scratch-id="' + Cairn.esc(entry.id) + '" style="cursor:pointer">';
        html += '<div class="cairn-scratch-entry-header">';
        html += '<span class="cairn-scratch-author">@' + Cairn.esc(entry.author_id) + '</span>';
        html += '<span class="cairn-scratch-time">' + Cairn.formatDate(entry.created_at) + '</span>';
        html += '<span class="cairn-scratch-ttl' + (isExpiring ? ' cairn-ttl-warn' : '') + '" title="Expires ' + Cairn.esc(entry.expires_at) + '">⏳ ' + timeLeft.label + '</span>';
        if (entry.ref_task_id) html += '<span class="cairn-scratch-task-badge">📋 ' + Cairn.esc(entry.ref_task_id) + '</span>';
        html += '</div>';
        html += '<div class="cairn-scratch-content"><div class="cairn-scratch-preview">' + Cairn.renderMd(preview) + '</div></div>';
        if (tags.length) {
          html += '<div class="cairn-scratch-tags">';
          tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t.trim()) + '</span>'; });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;

    // Wire click-to-open-detail on all entries
    body.querySelectorAll('.cairn-scratch-entry[data-scratch-id]').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-scratch-id');
        if (id) Cairn.openScratchDetail(id);
      });
    });
  },

  _scratchEditMode: false,
  _scratchCurrent: null,

  async openScratchDetail(scratchId) {
    Cairn.stopScratchRefresh();
    Cairn._scratchEditMode = false;
    var body = document.getElementById('cairn-body');
    body.innerHTML = '<div class="loading-text">Loading full scratch…</div>';

    var data = await API.cairnScratchDetail(scratchId);
    if (!data || data.error) {
      body.innerHTML = '<div class="cairn-scratch"><button class="cairn-back-btn" onclick="Cairn.loadScratch()">← Back</button><div class="empty-text">Error: ' + Cairn.esc((data && data.error) || 'failed to load') + '</div></div>';
      return;
    }
    Cairn._scratchCurrent = data;
    Cairn.renderScratchDetail();
  },

  renderScratchDetail() {
    var body = document.getElementById('cairn-body');
    var data = Cairn._scratchCurrent;
    if (!data) return;

    var timeLeft = Cairn.timeUntil(data.expires_at);
    var tags = data.tags ? data.tags.split(',').filter(Boolean) : [];
    var editing = Cairn._scratchEditMode;

    var html = '<div class="cairn-scratch cairn-scratch-detail-view">';
    html += '<div class="cairn-scratch-detail-toolbar">';
    html += '<button class="cairn-back-btn" onclick="Cairn.loadScratch()">← Back</button>';
    if (!editing) {
      html += '<button class="cairn-btn-edit" onclick="Cairn.enterScratchEdit()">✏️ Edit</button>';
      html += '<button class="cairn-btn-export" onclick="Cairn.exportScratchMd()">📥 Export MD</button>';
    }
    html += '</div>';

    html += '<div class="cairn-scratch-detail-header">';
    html += '<span class="cairn-scratch-author">@' + Cairn.esc(data.author_id) + '</span>';
    html += '<span class="cairn-scratch-time">' + Cairn.formatDate(data.created_at) + '</span>';
    html += '<span class="cairn-scratch-ttl">⏳ ' + timeLeft.label + '</span>';
    if (data.pinned) html += '<span class="cairn-scratch-pinned">📌 pinned</span>';
    html += '</div>';
    if (data.ref_task_id) html += '<div class="cairn-scratch-ref">Task: <code>' + Cairn.esc(data.ref_task_id) + '</code></div>';
    if (data.ref_rfc_id) html += '<div class="cairn-scratch-ref">RFC: <code>' + Cairn.esc(data.ref_rfc_id) + '</code></div>';
    if (tags.length) {
      html += '<div class="cairn-scratch-tags" style="margin-bottom:8px">';
      tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t.trim()) + '</span>'; });
      html += '</div>';
    }

    if (editing) {
      html += '<div class="cairn-scratch-edit-area">';
      html += '<textarea id="cairn-scratch-editor" class="cairn-kb-editor">' + Cairn.esc(data.content) + '</textarea>';
      html += '<div class="cairn-scratch-edit-actions">';
      html += '<button class="cairn-btn-save" onclick="Cairn.saveScratchEdit()">💾 Save</button>';
      html += '<button class="cairn-btn-cancel" onclick="Cairn.cancelScratchEdit()">Cancel</button>';
      html += '</div></div>';
    } else {
      html += '<div class="cairn-scratch-full-content md-rendered">' + Cairn.renderMd(data.content) + '</div>';
    }

    html += '<div class="cairn-scratch-footer">ID: <code>' + Cairn.esc(data.id) + '</code></div>';
    html += '</div>';
    body.innerHTML = html;

    if (editing) {
      var editor = document.getElementById('cairn-scratch-editor');
      if (editor) { editor.focus(); editor.setSelectionRange(0, 0); }
    }
  },

  enterScratchEdit() {
    Cairn._scratchEditMode = true;
    Cairn.renderScratchDetail();
  },

  cancelScratchEdit() {
    Cairn._scratchEditMode = false;
    Cairn.renderScratchDetail();
  },

  async saveScratchEdit() {
    var editor = document.getElementById('cairn-scratch-editor');
    if (!editor || !Cairn._scratchCurrent) return;
    var newContent = editor.value;
    var scratchId = Cairn._scratchCurrent.id;

    var saveBtn = document.querySelector('.cairn-btn-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    var result = await API.cairnScratchEdit(scratchId, newContent);
    if (result && result.ok) {
      Cairn.toast('✅ Scratch saved');
      Cairn._scratchEditMode = false;
      Cairn._scratchCurrent.content = newContent;
      Cairn.renderScratchDetail();
    } else {
      Cairn.toast('⚠️ ' + (result ? result.error : 'Save failed'), true);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; }
    }
  },

  timeUntil(isoStr) {
    if (!isoStr) return { hours: 999, label: '—' };
    var diff = new Date(isoStr) - new Date();
    if (diff <= 0) return { hours: 0, label: 'expired' };
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(hours / 24);
    if (days > 0) return { hours: hours, label: days + 'd ' + (hours % 24) + 'h' };
    return { hours: hours, label: hours + 'h' };
  },

  exportScratchMd() {
    var data = Cairn._scratchCurrent;
    if (!data || !data.content) { Cairn.toast('⚠️ Nothing to export', true); return; }
    var filename = (data.id || 'scratch') + '.md';
    var blob = new Blob([data.content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Cairn.toast('📥 Exported ' + filename);
  },
});
