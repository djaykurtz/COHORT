/* Superdash v2 -- Review Pipeline Panel (RFC319 PR3 D2 / Project Codecrete)
 *
 * Read-only snapshot of the CODECRETE review-claim pipeline. One row per active
 * review claim: task title, cluster, reviewer, source (boomerang originator),
 * claim age, deadline countdown. Backend returns deadline-pressure order
 * (most-overdue first; claims with no deadline sort last).
 *
 * Role-gating is SERVER-SIDE: GET /api/review-pipeline returns 403 (with an
 * error body) for callers outside the PM / architect / OPERATOR axis. The
 * dashboard authenticates with the operator AUTH_TOKEN (Bearer) which the
 * coordinator maps to OPERATOR, so the dashboard sees data; a non-privileged
 * node token gets the restricted state. No client-side viewer-role is plumbed.
 * (Approved by TEMPO/PM + DRAGON/architect: server-side gate, always-show tab,
 * 403-graceful panel.)
 *
 * All four states share the same panel chrome (header + body) -- no error
 * banners or popups, so transitions don't flash:
 *   loading    -> placeholder text
 *   active     -> claim table
 *   dormant    -> CODECRETE_V1_ENABLED off (enabled:false)
 *   restricted -> 403 / auth failure (single role-agnostic message)
 */

var ReviewPipeline = {
  // undefined = never loaded; null = connection/auth failure; object otherwise.
  data: undefined,
  _subscribed: false,
  ENDPOINT: '/api/review-pipeline',
  REQUIRED_ROLES: 'PM / architect / OPERATOR',

  // Row grid -- shared by header + body so columns align. Token-only styling.
  _GRID: 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr 0.9fr 1.3fr;'
    + 'gap:8px;padding:6px 10px;align-items:center;',

  // -- Data --

  load: async function() {
    try {
      ReviewPipeline.data = await DataStore.get(ReviewPipeline.ENDPOINT, { maxAge: 15000 });
    } catch (e) {
      ReviewPipeline.data = null;
    }
    if (!ReviewPipeline._subscribed) {
      ReviewPipeline._subscribed = true;
      DataStore.subscribe(ReviewPipeline.ENDPOINT, function(data) {
        ReviewPipeline.data = data;
        if (App.currentTab === 'review-pipeline') ReviewPipeline.renderPanel();
      });
    }
    return ReviewPipeline.data;
  },

  // -- Render --

  renderPanel: function() {
    var content = Components.setupPanel('Review Pipeline', '');
    if (!content) return;

    // First paint: show loading, fetch, re-render once. Single transition only.
    if (ReviewPipeline.data === undefined) {
      content.innerHTML = Components.loading('Loading review pipeline...');
      ReviewPipeline.load().then(function() { ReviewPipeline.renderPanel(); });
      return;
    }

    var data = ReviewPipeline.data;

    // Restricted: 403 (error body) or hard connection/auth failure (null).
    // Single role-agnostic message -- states the required roles, never the
    // caller's role (no account-type leak).
    if (!data || data.error) {
      ReviewPipeline._setBadge('');
      content.innerHTML = Components.empty(
        'Restricted to ' + ReviewPipeline.REQUIRED_ROLES
        + '. Sign in with an authorized node token.'
      );
      return;
    }

    // Dormant: flag off -- same chrome, empty body.
    if (data.enabled === false) {
      ReviewPipeline._setBadge('dormant');
      content.innerHTML = Components.empty('CODECRETE v1 dormant (flag off).');
      return;
    }

    var rows = data.pipeline || [];
    ReviewPipeline._setBadge(rows.length + (rows.length === 1 ? ' claim' : ' claims'));

    if (!rows.length) {
      content.innerHTML = Components.empty('No active review claims.');
      return;
    }

    content.innerHTML = ReviewPipeline._renderTable(rows);
  },

  _setBadge: function(text) {
    var b = document.getElementById('main-panel-badge');
    if (b) b.textContent = text || '';
  },

  _renderTable: function(rows) {
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

  _renderRow: function(r) {
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
