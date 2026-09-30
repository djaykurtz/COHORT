/* Superdash v2 -- Notifications Tab Panel (U4 v2, 2026-06-01)
 *
 * Renders the Notify._queue list inside the Notifications tab. Replaces the
 * Boomerang tab in the same slot per OPERATOR directive 2026-06-01 21:01 PDT:
 *   "There is not Notifications Tab where boomerang button used to be.
 *    The tab was the groundwork for future decision system that hasn't been built yet."
 *
 * The Notifications tab is the canonical surface for queued events; the bell
 * icon in the header is the unread indicator. Future: decision-system widgets
 * land here (separate work).
 */

var NotificationsPanel = {
  _mounted: false,

  renderPanel: function() {
    var titleEl = document.getElementById('main-panel-title');
    if (titleEl) titleEl.textContent = 'Notifications';
    var badgeEl = document.getElementById('main-panel-badge');
    if (badgeEl) badgeEl.textContent = '';

    var content = document.getElementById('main-content');
    if (!content) return;

    if (!NotificationsPanel._mounted) {
      Notify.subscribe(function() {
        if (App && App.currentTab === 'notifications') NotificationsPanel._renderList();
      });
      NotificationsPanel._mounted = true;
    }

    content.innerHTML =
      '<div class="notif-panel">' +
        '<div class="notif-panel-actions">' +
          '<button class="notif-action-btn" onclick="NotificationsPanel.markAllRead()">Mark all read</button>' +
          '<button class="notif-action-btn" onclick="NotificationsPanel.clearAll()">Clear all</button>' +
          '<span class="notif-panel-future">Decision-system widgets will live here (future work).</span>' +
        '</div>' +
        '<div class="notif-panel-list" id="notif-panel-list"></div>' +
      '</div>';

    NotificationsPanel._renderList();
    // Auto-mark on view: bell indicator clears when the user is looking
    Notify.markAllRead();
  },

  _renderList: function() {
    var listEl = document.getElementById('notif-panel-list');
    if (!listEl) return;
    var items = Notify.list();
    if (!items.length) {
      listEl.innerHTML = '<div class="notif-empty">No notifications.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var when = NotificationsPanel._fmtTime(it.ts);
      html +=
        '<div class="notif-item notif-' + Notify.esc(it.type) + (it.read ? ' notif-read' : '') + '">' +
          '<span class="notif-item-icon">' + Notify.esc(it.icon) + '</span>' +
          '<div class="notif-item-body">' +
            (it.title ? '<div class="notif-item-title">' + Notify.esc(it.title) + '</div>' : '') +
            '<div class="notif-item-msg">' + Notify.esc(it.msg) + '</div>' +
          '</div>' +
          '<span class="notif-item-time">' + Notify.esc(when) + '</span>' +
        '</div>';
    }
    listEl.innerHTML = html;
  },

  markAllRead: function() { Notify.markAllRead(); NotificationsPanel._renderList(); },
  clearAll:    function() { Notify.clear();       NotificationsPanel._renderList(); },

  _fmtTime: function(ts) {
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
};
