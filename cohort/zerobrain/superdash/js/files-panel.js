/* Superdash v2 -- Files Panel (combined: Pictures, Scripts, Legacy Documents) */

var FilesPanel = {
  _state: {},

  _loadState: function() {
    try {
      var saved = localStorage.getItem('superdash.filesPanel.v1');
      if (saved) {
        FilesPanel._state = JSON.parse(saved);
      } else {
        FilesPanel._state = { pictures: true, scripts: false, legacy: false };
      }
    } catch (e) {
      FilesPanel._state = { pictures: true, scripts: false, legacy: false };
    }
  },

  _saveState: function() {
    try {
      localStorage.setItem('superdash.filesPanel.v1', JSON.stringify(FilesPanel._state));
    } catch (e) { /* ignore */ }
  },

  renderPanel: function() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = '📁 Files';
    badge.textContent = '';

    FilesPanel._loadState();

    var html = '<div class="fleet-sections" id="files-sections">';
    html += FilesPanel._sectionShell('pictures', '📷', 'Pictures');
    html += FilesPanel._sectionShell('scripts', '⚙', 'Scripts');
    html += FilesPanel._sectionShell('legacy', '📄', 'Legacy Documents');
    html += '</div>';

    content.innerHTML = html;

    // Bind click handlers
    document.querySelectorAll('#files-sections .fleet-section-header').forEach(function(el) {
      el.addEventListener('click', function() {
        var section = el.parentElement.getAttribute('data-section');
        FilesPanel._toggle(section);
      });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var section = el.parentElement.getAttribute('data-section');
          FilesPanel._toggle(section);
        }
      });
    });

    // Render expanded sections
    if (FilesPanel._state.pictures) FilesPanel._renderPictures();
    if (FilesPanel._state.scripts) FilesPanel._renderScripts();
    if (FilesPanel._state.legacy) FilesPanel._renderLegacy();
  },

  _sectionShell: function(name, icon, title) {
    var expanded = FilesPanel._state[name] !== false;
    var cls = expanded ? ' expanded' : '';
    return '<div class="fleet-section' + cls + '" data-section="' + name + '">'
      + '<button class="fleet-section-header" aria-expanded="' + expanded + '" aria-controls="files-body-' + name + '">'
      + '  <span class="fleet-section-chevron">▸</span>'
      + '  <span class="fleet-section-icon">' + icon + '</span>'
      + '  <span class="fleet-section-title">' + title + '</span>'
      + '  <span class="fleet-section-badge" id="files-badge-' + name + '"></span>'
      + '</button>'
      + '<div class="fleet-section-body" id="files-body-' + name + '">'
      + '  <div class="loading-text">Loading...</div>'
      + '</div>'
      + '</div>';
  },

  _toggle: function(name) {
    var section = document.querySelector('#files-sections .fleet-section[data-section="' + name + '"]');
    if (!section) return;

    var expanded = section.classList.toggle('expanded');
    FilesPanel._state[name] = expanded;
    FilesPanel._saveState();

    var header = section.querySelector('.fleet-section-header');
    if (header) header.setAttribute('aria-expanded', String(expanded));

    if (expanded) {
      switch (name) {
        case 'pictures': FilesPanel._renderPictures(); break;
        case 'scripts': FilesPanel._renderScripts(); break;
        case 'legacy': FilesPanel._renderLegacy(); break;
      }
    }
  },

  // ── Pictures (Images panel content) ──
  _renderPictures: function() {
    var body = document.getElementById('files-body-pictures');
    if (!body) return;

    body.innerHTML = [
      '<div class="images-panel">',
      '  <div class="images-upload-zone" id="image-drop-zone">',
      '    <input type="file" id="image-file-input" accept="image/*" style="display:none" multiple>',
      '    <div class="drop-label">📷 Drop images here or <a href="#" onclick="document.getElementById(\'image-file-input\').click();return false">browse</a></div>',
      '    <div class="upload-caption-row">',
      '      <input type="text" id="image-caption" placeholder="Caption (optional)" class="caption-input">',
      '      <button onclick="Images.handleUpload()" class="upload-btn">Upload</button>',
      '    </div>',
      '    <div id="upload-status" class="upload-status"></div>',
      '  </div>',
      '  <div class="images-grid" id="images-grid">',
      '    <div class="loading-text">Loading images...</div>',
      '  </div>',
      '</div>'
    ].join('\n');

    // Wire up file input and drag-drop
    var dropZone = document.getElementById('image-drop-zone');
    var fileInput = document.getElementById('image-file-input');

    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      fileInput.files = e.dataTransfer.files;
      Images.handleUpload();
    });

    fileInput.addEventListener('change', function() {
      if (fileInput.files.length > 0) {
        Images.handleUpload();
      }
    });

    Images.refreshGrid();
  },

  // ── Scripts ──
  _renderScripts: function() {
    var body = document.getElementById('files-body-scripts');
    if (!body) return;

    if (!Scripts.data || !Scripts.data.length) {
      body.innerHTML = '<div class="empty-text">No scripts published</div>';
      Scripts.load().then(function() {
        FilesPanel._renderScriptsContent(body);
      });
      return;
    }
    FilesPanel._renderScriptsContent(body);
  },

  _renderScriptsContent: function(body) {
    if (!Scripts.data || !Scripts.data.length) {
      body.innerHTML = '<div class="empty-text">No scripts published</div>';
      return;
    }

    var badge = document.getElementById('files-badge-scripts');
    if (badge) badge.textContent = Scripts.data.length + ' scripts';

    var html = '<div class="scripts-grid">';
    Scripts.data.forEach(function(s) {
      var color = Nodes.getColor(s.node_id);
      var lang = s.language || 'text';
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

    body.innerHTML = html;

    body.querySelectorAll('.script-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = parseInt(card.getAttribute('data-script-id'));
        Scripts.showDetail(id);
      });
    });
  },

  // ── Legacy Documents (formerly Docs) ──
  _renderLegacy: function() {
    var body = document.getElementById('files-body-legacy');
    if (!body) return;

    // Render docs tabs and content inside the collapsible body
    var tabsHtml = '<div class="docs-tabs">';
    Docs.categories.forEach(function(cat) {
      var active = (cat === Docs.currentCategory) ? ' active' : '';
      tabsHtml += '<button class="docs-tab' + active + '" onclick="FilesPanel._switchDocsCategory(\'' + cat + '\')">'
        + Docs.categoryLabels[cat] + '</button>';
    });
    tabsHtml += '</div>';

    body.innerHTML = tabsHtml + '<div class="docs-body" id="docs-body"><div class="loading-text">Loading...</div></div>';
    Docs.loadCategory(Docs.currentCategory);
  },

  _switchDocsCategory: function(cat) {
    Docs.currentCategory = cat;
    Docs.currentFile = null;
    document.querySelectorAll('#files-body-legacy .docs-tab').forEach(function(t) {
      t.classList.toggle('active', t.textContent === Docs.categoryLabels[cat]);
    });
    var body = document.getElementById('docs-body');
    if (body) {
      body.innerHTML = '<div class="loading-text">Loading...</div>';
      Docs.loadCategory(cat);
    }
  }
};
