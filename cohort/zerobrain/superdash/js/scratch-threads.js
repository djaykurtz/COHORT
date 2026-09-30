/* Scratch Threads — group-by-ref view, pin indicators, ref chips
 * Part of RFC-FEF0A7: Deprecate artifacts, enhance scratch as living blueprint surface
 *
 * API shape (after ZBPRIME ships ref-linking + pinning):
 *   entry.ref_task_id  — linked task ID (nullable)
 *   entry.ref_rfc_id   — linked RFC ID (nullable)
 *   entry.pinned       — boolean (opt out of 5-day expiry)
 *   entry.pinned_at    — timestamp when pinned (nullable)
 */

Object.assign(Cairn, {
  scratchViewMode: 'feed', // 'feed' | 'threads'

  renderScratchViewToggle() {
    return '<div class="scratch-view-toggle">'
      + '<button class="scratch-view-btn' + (Cairn.scratchViewMode === 'feed' ? ' active' : '') + '" onclick="Cairn.setScratchView(\'feed\')">Feed</button>'
      + '<button class="scratch-view-btn' + (Cairn.scratchViewMode === 'threads' ? ' active' : '') + '" onclick="Cairn.setScratchView(\'threads\')">Threads</button>'
      + '</div>';
  },

  setScratchView(mode) {
    Cairn.scratchViewMode = mode;
    Cairn.renderScratch();
  },

  // Override renderScratch to inject view toggle + thread support
  _origRenderScratch: null,

  renderScratch() {
    var body = document.getElementById('cairn-body');
    var entries = (Cairn.scratchData && Cairn.scratchData.entries) || [];

    var html = '<div class="cairn-scratch">';
    html += '<div class="cairn-scratch-header">';
    html += '<span class="cairn-scratch-title">📝 Scratch Pad</span>';
    html += Cairn.renderScratchViewToggle();
    html += '<span class="cairn-scratch-count">' + entries.length + ' note' + (entries.length !== 1 ? 's' : '') + '</span>';
    html += '<span class="cairn-scratch-live">● LIVE</span>';
    html += '</div>';

    if (!entries.length) {
      html += '<div class="cairn-empty">No scratch notes yet. Drop ideas via <code>cairn_scratch</code>.</div>';
    } else if (Cairn.scratchViewMode === 'threads') {
      html += Cairn.renderScratchThreads(entries);
    } else {
      html += Cairn.renderScratchFeed(entries);
    }

    html += '</div>';
    body.innerHTML = html;
    Cairn.wireScratchInteractions(body);
  },

  renderScratchFeed(entries) {
    var html = '<div class="cairn-scratch-feed">';
    entries.forEach(function(entry, idx) {
      html += Cairn.renderScratchEntry(entry, idx);
    });
    html += '</div>';
    return html;
  },

  renderScratchEntry(entry, idx) {
    var timeLeft = Cairn.timeUntil(entry.expires_at);
    var tags = entry.tags ? entry.tags.split(',').filter(Boolean) : [];
    var isExpiring = timeLeft.hours < 24 && !entry.pinned;
    var isLong = (entry.content || '').length > 300;

    var html = '<div class="cairn-scratch-entry' + (isExpiring ? ' cairn-expiring' : '') + (isLong ? ' cairn-scratch-collapsed' : '') + '" data-scratch-idx="' + idx + '">';
    html += '<div class="cairn-scratch-entry-header">';
    html += '<span class="cairn-scratch-author">@' + Cairn.esc(entry.author_id) + '</span>';
    html += '<span class="cairn-scratch-time">' + Cairn.formatDate(entry.created_at) + '</span>';

    // Pin indicator
    if (entry.pinned) {
      html += '<span class="scratch-pin">pinned</span>';
      html += '<span class="scratch-ttl-pinned">no expiry</span>';
    } else {
      html += '<span class="cairn-scratch-ttl' + (isExpiring ? ' cairn-ttl-warn' : '') + '" title="Expires ' + Cairn.esc(entry.expires_at || '') + '">⏳ ' + timeLeft.label + '</span>';
    }

    if (isLong) html += '<span class="cairn-scratch-expand-hint">click to expand</span>';
    html += '</div>';

    // Ref chips
    if (entry.ref_task_id || entry.ref_rfc_id) {
      html += '<div class="cairn-scratch-refs">';
      if (entry.ref_task_id) {
        html += Cairn.renderRefChip('task', entry.ref_task_id);
      }
      if (entry.ref_rfc_id) {
        html += Cairn.renderRefChip('rfc', entry.ref_rfc_id);
      }
      html += '</div>';
    }

    html += '<div class="cairn-scratch-content">' + Cairn.renderMd(entry.content) + '</div>';
    if (tags.length) {
      html += '<div class="cairn-scratch-tags">';
      tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t.trim()) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  renderScratchThreads(entries) {
    // Group entries by ref (task or rfc)
    var threads = {};
    var unlinked = [];

    entries.forEach(function(entry, idx) {
      entry._idx = idx;
      var refKey = null;
      if (entry.ref_rfc_id) {
        refKey = 'rfc:' + entry.ref_rfc_id;
      } else if (entry.ref_task_id) {
        refKey = 'task:' + entry.ref_task_id;
      }

      if (refKey) {
        if (!threads[refKey]) threads[refKey] = { type: refKey.split(':')[0], id: refKey.split(':').slice(1).join(':'), entries: [] };
        threads[refKey].entries.push(entry);
      } else {
        unlinked.push(entry);
      }
    });

    // Sort threads: pinned first, then by most recent entry
    var threadList = Object.values(threads).sort(function(a, b) {
      var aPinned = a.entries.some(function(e) { return e.pinned; });
      var bPinned = b.entries.some(function(e) { return e.pinned; });
      if (aPinned !== bPinned) return bPinned ? 1 : -1;
      var aLatest = a.entries[0] ? new Date(a.entries[0].created_at) : 0;
      var bLatest = b.entries[0] ? new Date(b.entries[0].created_at) : 0;
      return bLatest - aLatest;
    });

    var html = '<div class="scratch-threads">';

    // Render linked threads
    threadList.forEach(function(thread) {
      var hasPinned = thread.entries.some(function(e) { return e.pinned; });
      html += '<div class="scratch-thread-group">';
      html += '<div class="scratch-thread-header">';
      html += '<div class="scratch-thread-ref">';
      html += Cairn.renderRefChip(thread.type, thread.id);
      if (hasPinned) html += '<span class="scratch-pin">pinned</span>';
      html += '</div>';
      html += '<span class="scratch-thread-count">' + thread.entries.length + '</span>';
      html += '</div>';
      html += '<div class="scratch-thread-entries">';
      thread.entries.forEach(function(entry) {
        html += Cairn.renderThreadEntry(entry);
      });
      html += '</div></div>';
    });

    // Unlinked entries
    if (unlinked.length) {
      html += '<div class="scratch-thread-group unlinked">';
      html += '<div class="scratch-thread-header">';
      html += '<div class="scratch-thread-ref"><span style="color:var(--text-dim);font-size:12px">Unlinked notes</span></div>';
      html += '<span class="scratch-thread-count">' + unlinked.length + '</span>';
      html += '</div>';
      html += '<div class="scratch-thread-entries">';
      unlinked.forEach(function(entry) {
        html += Cairn.renderThreadEntry(entry);
      });
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  },

  renderThreadEntry(entry) {
    var html = '<div class="scratch-thread-entry" data-scratch-idx="' + entry._idx + '">';
    html += '<div class="scratch-thread-entry-meta">';
    html += '<span>@' + Cairn.esc(entry.author_id) + '</span>';
    html += '<span>' + Cairn.formatDate(entry.created_at) + '</span>';
    if (entry.pinned) {
      html += '<span class="scratch-pin">pinned</span>';
    } else {
      var timeLeft = Cairn.timeUntil(entry.expires_at);
      html += '<span class="cairn-scratch-ttl' + (timeLeft.hours < 24 ? ' cairn-ttl-warn' : '') + '">⏳ ' + timeLeft.label + '</span>';
    }
    html += '</div>';
    html += '<div class="cairn-scratch-content">' + Cairn.renderMd(entry.content) + '</div>';
    html += '</div>';
    return html;
  },

  renderRefChip(type, id) {
    var shortId = id.length > 30 ? id.substring(0, 28) + '…' : id;
    var cssClass = 'ref-chip ref-chip-' + type;
    var onclick = type === 'rfc'
      ? 'Cairn.loadForum(\'' + Cairn.escJs(id) + '\')'
      : '';
    return '<span class="' + cssClass + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + ' title="' + Cairn.esc(id) + '">' + Cairn.esc(shortId) + '</span>';
  },

  wireScratchInteractions(body) {
    var entries = (Cairn.scratchData && Cairn.scratchData.entries) || [];
    // Click to open detail view (full content + edit)
    body.querySelectorAll('.cairn-scratch-entry[data-scratch-idx]').forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-scratch-idx'), 10);
        var entry = entries[idx];
        if (entry && entry.id) {
          Cairn.openScratchDetail(entry.id);
        }
      });
    });
    // Thread entries also open detail
    body.querySelectorAll('.scratch-thread-entry[data-scratch-idx]').forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.getAttribute('data-scratch-idx'), 10);
        var entry = entries[idx];
        if (entry && entry.id) {
          Cairn.openScratchDetail(entry.id);
        }
      });
    });
    // Thread group collapse (on header only)
    body.querySelectorAll('.scratch-thread-header').forEach(function(el) {
      el.addEventListener('click', function() {
        var entries = el.parentElement.querySelector('.scratch-thread-entries');
        if (entries) entries.style.display = entries.style.display === 'none' ? '' : 'none';
      });
    });
  }
});
