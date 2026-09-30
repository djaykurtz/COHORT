/* Superdash v2 S3 -- Docs Browser (Living Specs + Ideation) */

var Docs = {
  categories: ['living', 'ideation', 'ratified', 'implemented', 'rfc'],
  categoryLabels: {
    living: 'Living Docs',
    ideation: 'Ideation / RFCs',
    ratified: 'Ratified',
    implemented: 'Implemented',
    rfc: 'RFC Archive'
  },
  currentCategory: 'living',
  files: {},
  currentFile: null,

  renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Fleet Documentation';
    badge.textContent = '';

    var tabsHtml = '<div class="docs-tabs">';
    Docs.categories.forEach(function(cat) {
      var active = (cat === Docs.currentCategory) ? ' active' : '';
      tabsHtml += '<button class="docs-tab' + active + '" onclick="Docs.switchCategory(\'' + cat + '\')">'
        + Docs.categoryLabels[cat] + '</button>';
    });
    tabsHtml += '</div>';

    content.innerHTML = tabsHtml + '<div class="docs-body" id="docs-body"><div class="loading-text">Loading...</div></div>';

    Docs.loadCategory(Docs.currentCategory);
  },

  switchCategory(cat) {
    Docs.currentCategory = cat;
    Docs.currentFile = null;
    document.querySelectorAll('.docs-tab').forEach(function(t) {
      t.classList.toggle('active', t.textContent === Docs.categoryLabels[cat]);
    });
    var body = document.getElementById('docs-body');
    body.innerHTML = '<div class="loading-text">Loading...</div>';
    Docs.loadCategory(cat);
  },

  async loadCategory(cat) {
    var body = document.getElementById('docs-body');

    if (Docs.files[cat]) {
      Docs.renderFileList(Docs.files[cat], body);
      return;
    }

    var result = await API.get('/api/files/specs/' + cat);
    if (result && result.entries) {
      Docs.files[cat] = result.entries;
      Docs.renderFileList(result.entries, body);
    } else {
      body.innerHTML = '<div class="empty-text">No files in ' + cat + '</div>';
    }
  },

  renderFileList(entries, body) {
    if (!entries || !entries.length) {
      body.innerHTML = '<div class="empty-text">No files found</div>';
      return;
    }

    var html = '<div class="docs-list">';
    entries.forEach(function(f) {
      if (f.type === 'directory') return;
      var size = f.size ? Docs.formatSize(f.size) : '';
      var modified = f.last_modified ? Docs.formatDate(f.last_modified) : '';

      html += '<div class="docs-item" onclick="Docs.openFile(\'' + Panels.esc(f.path) + '\')">'
        + '<div class="docs-item-name">' + Panels.esc(f.name) + '</div>'
        + '<div class="docs-item-meta">'
        + '<span>' + size + '</span>'
        + '<span>' + modified + '</span>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  },

  async openFile(path) {
    var body = document.getElementById('docs-body');
    var badge = document.getElementById('main-panel-badge');
    body.innerHTML = '<div class="loading-text">Loading file...</div>';

    var content = await API.getRaw('/api/files/' + path);
    if (content) {
      Docs.currentFile = path;
      var filename = path.split('/').pop();
      badge.textContent = filename;

      var backBtn = '<button class="docs-back" onclick="Docs.currentFile=null;Docs.renderPanel()">← Back</button>';
      body.innerHTML = backBtn + '<div class="docs-content md-rendered">' + Docs.renderMarkdown(content) + '</div>';
    } else {
      body.innerHTML = '<div class="empty-text">Failed to load file</div>';
    }
  },

  renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      return marked.parse(text);
    }
    // Fallback: wrap in <pre>
    return '<pre>' + Panels.esc(text) + '</pre>';
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
  },

  formatDate(epoch) {
    try {
      var d = new Date(epoch * 1000);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch(e) { return ''; }
  }
};
