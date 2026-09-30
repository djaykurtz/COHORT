/* Superdash v2 — OPERATOR Scratchpad
 * Stores quick notes with optional reference (task, RFC, node, etc.)
 * Persisted to fleet-shared/scratchpad/ as markdown files.
 */

var Feedback = {
  submitting: false,

  async submit() {
    if (Feedback.submitting) return;

    var bodyEl = document.getElementById('feedback-body');
    var refEl = document.getElementById('feedback-title');
    var body = (bodyEl.value || '').trim();

    if (!body) {
      Feedback.showStatus('Write something first.', 'error');
      bodyEl.focus();
      return;
    }

    var ref = (refEl.value || '').trim();
    Feedback.submitting = true;
    Feedback.showStatus('Saving...', 'pending');

    var now = new Date();
    var ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var filename = ts + '.md';
    var content = (ref ? '**Ref:** ' + ref + '\n\n' : '') + body;

    var result = await API.post('/api/files/scratchpad/' + filename, content);

    Feedback.submitting = false;

    if (result && !result.error) {
      // Notify UXIA so she can triage (quick fix or promote to seed)
      API.post('/api/messages', {
        from_node: 'OPERATOR',
        to_node: 'UXIA',
        msg_type: 'request',
        subject: 'Scratch: ' + (ref || 'no ref'),
        content: body + (ref ? '\n\nRef: ' + ref : '') + '\n\nFile: scratchpad/' + filename,
        priority: 2
      });
      Feedback.showStatus('✓ Saved + notified UXIA', 'success');
      bodyEl.value = '';
      refEl.value = '';
      setTimeout(function() {
        var statusEl = document.getElementById('feedback-status');
        if (statusEl && statusEl.classList.contains('success')) {
          statusEl.textContent = '';
          statusEl.className = 'feedback-status';
        }
      }, 4000);
    } else {
      var errMsg = (result && result.error) ? result.error : 'Failed to save';
      Feedback.showStatus('✗ ' + errMsg, 'error');
    }
  },

  async loadRecent() {
    // History list intentionally removed (OPERATOR directive 2026-06-07 12:06 PDT
    // via UXIA chat — "serves no purpose and looks silly"). Stub kept as no-op
    // in case any caller still references it; safe to delete entirely once
    // confirmed no external callers remain.
    return;
  },

  showStatus(msg, type) {
    var el = document.getElementById('feedback-status');
    el.textContent = msg;
    el.className = 'feedback-status ' + (type || '');
  }
};
