/* Superdash v2 S3 -- Scripts Portal Panel */

var Scripts = {
  data: [],
  currentScript: null,

  async load() {
    var result = await API.get('/api/scripts');
    if (result && result.scripts) {
      Scripts.data = result.scripts;
    }
    return Scripts.data;
  },

  renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Scripts Portal';
    badge.textContent = Scripts.data.length + ' scripts';

    if (!Scripts.data.length) {
      content.innerHTML = '<div class="empty-text">No scripts published</div>';
      return;
    }

    var html = '<div class="scripts-grid">';
    Scripts.data.forEach(function(s) {
      var color = Nodes.getColor(s.node_id);
      var lang = s.language || 'text';
      var size = s.size_bytes ? Panels.formatBytes(s.size_bytes) : '';
      var time = Messages.formatTime(s.created_at);
      var host = s.target_host || 'ANY';

      html += '<div class="script-card" data-script-id="' + s.id + '">'
        + '<div class="script-card-header">'
        + '<span class="script-title">' + Panels.esc(s.title) + '</span>'
        + '<span class="script-lang">' + lang + '</span>'
        + '</div>'
        + '<div class="script-meta">'
        + '<span class="script-author" style="color:' + color + '">' + s.node_id + '</span>'
        + '<span class="script-host">' + host + '</span>'
        + '<span class="script-time">' + time + '</span>'
        + '</div>';

      if (s.description) {
        var desc = s.description.length > 80 ? s.description.substring(0, 80) + '...' : s.description;
        html += '<div class="script-desc">' + Panels.esc(desc) + '</div>';
      }

      html += '</div>';
    });
    html += '</div>';

    content.innerHTML = html;

    content.querySelectorAll('.script-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = parseInt(card.getAttribute('data-script-id'));
        Scripts.showDetail(id);
      });
    });
  },

  async showDetail(scriptId) {
    var content = document.getElementById('main-content');
    var badge = document.getElementById('main-panel-badge');
    content.innerHTML = '<div class="loading-text">Loading script...</div>';

    var result = await API.get('/api/scripts/' + scriptId);
    if (!result) {
      content.innerHTML = '<div class="empty-text">Failed to load script</div>';
      return;
    }

    var s = result;
    var color = Nodes.getColor(s.node_id);
    badge.textContent = s.filename || '';

    var html = '<div class="script-detail">'
      + '<div class="script-detail-header">'
      + '<button class="btn-back" onclick="Scripts.renderPanel()">← Back</button>'
      + '<h3 class="script-detail-title">' + Panels.esc(s.title) + '</h3>'
      + '</div>'
      + '<div class="script-detail-meta">'
      + '<span style="color:' + color + '">' + s.node_id + '</span>'
      + '<span>' + (s.filename || '') + '</span>'
      + '<span>' + (s.language || '') + '</span>'
      + '<span>' + (s.target_host || 'ANY') + '</span>'
      + '</div>';

    if (s.description) {
      html += '<div class="script-detail-desc">' + Panels.esc(s.description) + '</div>';
    }

    if (s.content) {
      html += '<div class="script-code-wrap">'
        + '<pre class="script-code"><code>' + Panels.esc(s.content) + '</code></pre>'
        + '</div>';
    }

    html += '</div>';
    content.innerHTML = html;
  }
};
