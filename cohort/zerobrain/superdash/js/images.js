/* Superdash v2 -- Image Upload Panel */

var Images = (function() {
  var IMAGE_BASE = 'http://' + (window.location.hostname || '127.0.0.1') + ':8421';

  function getImageUrl(endpoint) {
    return IMAGE_BASE + endpoint;
  }

  async function upload(file, caption) {
    var form = new FormData();
    form.append('file', file);
    var url = getImageUrl('/upload?caption=' + encodeURIComponent(caption || ''));
    try {
      var resp = await fetch(url, {
        method: 'POST',
        body: form,
        headers: { 'Authorization': 'Bearer ' + (CONFIG.AUTH_TOKEN || 'REPLACE_WITH_FLEET_TOKEN') }
      });
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        var detail = err.detail;
        if (Array.isArray(detail)) detail = detail.map(function(d) { return d.msg || JSON.stringify(d); }).join('; ');
        throw new Error(detail || 'Upload failed: HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (e) {
      console.error('[Images] upload failed:', e);
      return { error: e.message };
    }
  }

  async function list() {
    try {
      var resp = await fetch(getImageUrl('/list'));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      console.warn('[Images] list failed:', e.message);
      return { images: [], count: 0, error: e.message };
    }
  }

  async function remove(imageId) {
    try {
      var resp = await fetch(getImageUrl('/img/' + imageId), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + (CONFIG.AUTH_TOKEN || 'REPLACE_WITH_FLEET_TOKEN') }
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      return { error: e.message };
    }
  }

  function renderPanel(container) {
    var title = document.getElementById('main-panel-title');
    if (title) title.textContent = '📷 Images';
    if (!container) container = document.getElementById('main-content');

    container.innerHTML = [
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
      showFilePreview(fileInput.files);
    });

    fileInput.addEventListener('change', function() {
      if (fileInput.files.length > 0) {
        showFilePreview(fileInput.files);
        Images.handleUpload();
      }
    });

    refreshGrid();
  }

  function showFilePreview(files) {
    var status = document.getElementById('upload-status');
    if (!status || !files || files.length === 0) return;
    var names = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var sizeKB = Math.round(f.size / 1024);
      names.push(f.name + ' (' + sizeKB + 'KB)');
    }
    status.textContent = '📎 ' + files.length + ' file(s) ready: ' + names.join(', ');
    status.className = 'upload-status uploading';
    var dropLabel = document.querySelector('.drop-label');
    if (dropLabel) dropLabel.textContent = '✓ ' + files.length + ' file(s) selected — click Upload or drop more';
  }

  async function handleUpload() {
    var fileInput = document.getElementById('image-file-input');
    var caption = document.getElementById('image-caption').value;
    var status = document.getElementById('upload-status');

    if (!fileInput.files || fileInput.files.length === 0) {
      status.textContent = 'No file selected';
      status.className = 'upload-status error';
      return;
    }

    var results = [];
    for (var i = 0; i < fileInput.files.length; i++) {
      status.textContent = 'Uploading ' + (i + 1) + '/' + fileInput.files.length + '...';
      status.className = 'upload-status uploading';
      var result = await upload(fileInput.files[i], caption);
      results.push(result);
    }

    var errors = results.filter(function(r) { return r.error; });
    if (errors.length > 0) {
      status.textContent = errors.length + ' upload(s) failed: ' + errors[0].error;
      status.className = 'upload-status error';
    } else {
      status.textContent = results.length + ' image(s) uploaded successfully';
      status.className = 'upload-status success';
      document.getElementById('image-caption').value = '';
      fileInput.value = '';
    }

    refreshGrid();
    setTimeout(function() { status.textContent = ''; }, 4000);
  }

  async function refreshGrid() {
    var grid = document.getElementById('images-grid');
    if (!grid) return;

    var data = await list();
    if (data.error) {
      grid.innerHTML = '<div class="images-error">Image service offline: ' + data.error + '</div>';
      return;
    }
    if (!data.images || data.images.length === 0) {
      grid.innerHTML = '<div class="images-empty">No images uploaded yet</div>';
      return;
    }

    grid.innerHTML = data.images.map(function(img) {
      var sizeKB = Math.round(img.size_bytes / 1024);
      var date = new Date(img.created_at).toLocaleDateString();
      return [
        '<div class="image-card">',
        '  <div class="image-thumb" onclick="Images.showFull(\'' + img.url + '\')">',
        '    <img src="' + img.url + '" alt="' + (img.caption || img.original_name) + '" loading="lazy">',
        '  </div>',
        '  <div class="image-meta">',
        '    <span class="image-name" title="' + img.original_name + '">' + (img.caption || img.original_name) + '</span>',
        '    <span class="image-info">' + sizeKB + 'KB · ' + date + '</span>',
        '  </div>',
        '  <div class="image-actions">',
        '    <button class="copy-link-btn" onclick="Images.copyLink(\'' + img.url + '\')" title="Copy shareable link">🔗</button>',
        '    <button class="delete-btn" onclick="Images.deleteImage(\'' + img.id + '\')" title="Delete">🗑️</button>',
        '  </div>',
        '</div>'
      ].join('\n');
    }).join('\n');
  }

  function showFull(url) {
    var overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = '<img src="' + url + '" onclick="event.stopPropagation()"><div class="overlay-close" onclick="this.parentElement.remove()">✕</div>';
    overlay.onclick = function() { overlay.remove(); };
    document.body.appendChild(overlay);
  }

  function copyLink(url) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          showCopyFeedback(url);
        }).catch(function() {
          fallbackCopy(url);
        });
      } else {
        fallbackCopy(url);
      }
    } catch (e) {
      prompt('Copy this image link:', url);
    }
  }

  function fallbackCopy(url) {
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) {
      showCopyFeedback(url);
    } else {
      prompt('Copy this image link:', url);
    }
  }

  function showCopyFeedback(url) {
    // Toast notification
    if (typeof Notify !== 'undefined' && Notify.success) {
      Notify.success('Link Copied', url);
    }
    // Visual flash on the button
    var btn = document.querySelector('.copy-link-btn');
    if (btn) {
      var orig = btn.textContent;
      btn.textContent = '✅';
      btn.style.background = 'rgba(80,200,120,0.3)';
      setTimeout(function() { btn.textContent = orig; btn.style.background = ''; }, 2000);
    }
  }

  async function deleteImage(id) {
    if (!confirm('Delete this image?')) return;
    var result = await remove(id);
    if (result.error) {
      Notify && Notify.show('Delete failed: ' + result.error, 'error');
    } else {
      refreshGrid();
    }
  }

  return {
    renderPanel: renderPanel,
    handleUpload: handleUpload,
    refreshGrid: refreshGrid,
    showFull: showFull,
    copyLink: copyLink,
    deleteImage: deleteImage
  };
})();
