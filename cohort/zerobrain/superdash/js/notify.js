/* Superdash v2 -- Notification Queue + Bell (U4 v2, 2026-06-01)
 *
 * REPLACES the prior toast-popup system per OPERATOR directive 2026-06-01 21:01 PDT:
 *   "There's still toast popups on the right side that are pointless for me.
 *    There is not notification bell that consumes them with a counter."
 *
 * NEW MODEL:
 *  - Notify.show/message/task/alert/error/success push into Notify._queue
 *  - Bell counter (#notif-bell-count) reflects unread count
 *  - Notifications tab (NotificationsPanel) reads/renders the queue
 *  - NO floating toasts anywhere. Tab is the canonical surface, bell is the indicator.
 *
 * Backward-compat: all prior Notify.* call sites (sse.js, app.js SW prompt,
 * images.js link-copy) keep working unchanged -- they just route to the queue
 * instead of popping a toast.
 */

var Notify = {
  _queue: [],          // newest-first array of {id, type, icon, title, msg, ts, read}
  _maxQueue: 100,      // hard cap; older items drop off
  _seq: 0,
  _rateWindow: [],
  _rateLimit: 20,      // 20 events per 10s; protects queue from runaway SSE
  _rateWindowMs: 10000,
  _listeners: [],      // change subscribers (NotificationsPanel, bell counter)

  init: function() {
    // No-op: bell is in index.html, panel is rendered on tab switch.
    Notify._updateBell();
  },

  // type: 'message' | 'task' | 'alert' | 'error' | 'success'
  show: function(opts) {
    var now = Date.now();

    // Rate limit (protects against SSE storm flooding queue)
    Notify._rateWindow = Notify._rateWindow.filter(function(t) { return now - t < Notify._rateWindowMs; });
    if (Notify._rateWindow.length >= Notify._rateLimit) return null;
    Notify._rateWindow.push(now);

    var type = opts.type || 'message';
    var item = {
      id: ++Notify._seq,
      type: type,
      icon: opts.icon || Notify.icons[type] || '📌',
      title: opts.title || '',
      msg: opts.msg || '',
      ts: now,
      read: false
    };

    Notify._queue.unshift(item);
    if (Notify._queue.length > Notify._maxQueue) {
      Notify._queue.length = Notify._maxQueue;
    }

    Notify._updateBell();
    Notify._notifyListeners();
    return item;
  },

  // Mark all as read (called when user opens the Notifications tab)
  markAllRead: function() {
    var changed = false;
    for (var i = 0; i < Notify._queue.length; i++) {
      if (!Notify._queue[i].read) { Notify._queue[i].read = true; changed = true; }
    }
    if (changed) { Notify._updateBell(); Notify._notifyListeners(); }
  },

  // Clear queue entirely
  clear: function() {
    Notify._queue = [];
    Notify._updateBell();
    Notify._notifyListeners();
  },

  // Read access for the panel
  list: function() { return Notify._queue.slice(); },
  unreadCount: function() {
    var n = 0;
    for (var i = 0; i < Notify._queue.length; i++) { if (!Notify._queue[i].read) n++; }
    return n;
  },

  subscribe: function(fn) {
    if (typeof fn === 'function') Notify._listeners.push(fn);
  },

  _notifyListeners: function() {
    for (var i = 0; i < Notify._listeners.length; i++) {
      try { Notify._listeners[i](); } catch (e) { /* swallow */ }
    }
  },

  _updateBell: function() {
    var el = document.getElementById('notif-bell-count');
    if (!el) return;
    var n = Notify.unreadCount();
    if (n > 0) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  },

  // Convenience methods (preserved API surface)
  message: function(title, msg) { return Notify.show({ type: 'message', icon: '✉️', title: title, msg: msg }); },
  task:    function(title, msg) { return Notify.show({ type: 'task',    icon: '📋', title: title, msg: msg }); },
  alert:   function(title, msg) { return Notify.show({ type: 'alert',   icon: '⚠️', title: title, msg: msg }); },
  error:   function(title, msg) { return Notify.show({ type: 'error',   icon: '❌', title: title, msg: msg }); },
  success: function(title, msg) { return Notify.show({ type: 'success', icon: '✓',  title: title, msg: msg }); },

  // dismiss: legacy API kept for callers that pass element refs (no-op now)
  dismiss: function() { /* no-op: toasts removed; queue items are dismissed via the panel */ },

  icons: { message: '✉️', task: '📋', alert: '⚠️', error: '❌', success: '✓' },

  esc: function(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }
};

// Auto-init on DOM ready (just refreshes bell counter against any pre-populated state)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Notify.init);
} else {
  Notify.init();
}
