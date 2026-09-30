/* CAIRN knowledge base extensions */
Object.assign(Cairn, {
  kbSearchQuery: '',

  async loadKb(tag) {
    Cairn.view = 'kb';
    Cairn.kbTagFilter = tag || null;

    // Fetch only if we don't have data cached in memory
    if (!Cairn.kbData) {
      Cairn.setLoading(true);
      var data = await API.cairnKbRead();
      Cairn.setLoading(false);
      if (!data || data.error) {
        Cairn.renderError('Failed to load KB: ' + (data ? data.error : 'network'));
        return;
      }
      Cairn.kbData = data;
    }
    Cairn.renderKb();
  },

  // Force refresh from API (e.g., after flagging)
  async refreshKb() {
    Cairn.kbData = null;
    return Cairn.loadKb(Cairn.kbTagFilter);
  },

  // Client-side filter: tag + search query applied to cached data
  _filterKbResults: function(results) {
    var filtered = results;
    // Tag filter
    if (Cairn.kbTagFilter) {
      filtered = filtered.filter(function(a) {
        var tags = a.tags ? (Array.isArray(a.tags) ? a.tags : a.tags.split(',')) : [];
        return tags.some(function(t) { return t.trim() === Cairn.kbTagFilter; });
      });
    }
    // Search filter
    var q = (Cairn.kbSearchQuery || '').toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(function(a) {
        var title = (a.title || a.topic || '').toLowerCase();
        var slug = (a.slug || '').toLowerCase();
        var author = (a.author_id || a.author || '').toLowerCase();
        var content = (a.content || a.body || '').toLowerCase();
        var tags = (Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || '')).toLowerCase();
        return title.indexOf(q) !== -1 || slug.indexOf(q) !== -1
          || author.indexOf(q) !== -1 || tags.indexOf(q) !== -1
          || content.indexOf(q) !== -1;
      });
    }
    return filtered;
  },

  renderKb() {
    var body = document.getElementById('cairn-body');
    var allResults = (Cairn.kbData && Cairn.kbData.results) || [];
    var results = Cairn._filterKbResults(allResults);

    // Build tag counts from ALL results (not filtered) so tags stay stable
    var tagCounts = {};
    allResults.forEach(function(r) {
      var tags = r.tags ? (Array.isArray(r.tags) ? r.tags : r.tags.split(',')) : [];
      tags.forEach(function(t) { var k = t.trim(); if (k) tagCounts[k] = (tagCounts[k] || 0) + 1; });
    });
    var MIN_TAG_THRESHOLD = 3;
    var tagList = Object.keys(tagCounts).filter(function(t) {
      return tagCounts[t] >= MIN_TAG_THRESHOLD || t === Cairn.kbTagFilter;
    }).sort();

    // Group filtered results into sections
    var sections = [
      { key: 'draft', label: 'DRAFTS', icon: '\uD83D\uDCDD', items: [] },
      { key: 'published', label: 'ACTIVE', icon: '\uD83D\uDCD7', items: [] },
      { key: 'living', label: 'LIVING', icon: '\uD83D\uDD04', items: [] },
      { key: 'archived', label: 'ARCHIVED', icon: '\uD83D\uDCE6', items: [] }
    ];
    var sectionMap = {};
    sections.forEach(function(s) { sectionMap[s.key] = s; });

    results.forEach(function(article) {
      var tags = article.tags ? (Array.isArray(article.tags) ? article.tags : article.tags.split(',')) : [];
      var isLiving = tags.some(function(t) { return t.trim() === 'living-doc'; });
      // Archived articles go to ARCHIVED even if tagged living-doc
      if (isLiving && article.status !== 'archived' && sectionMap.living) {
        sectionMap.living.items.push(article);
      } else {
        var s = sectionMap[article.status];
        if (s) s.items.push(article);
        else if (sectionMap.published) sectionMap.published.items.push(article);
      }
    });

    var html = '<div class="cairn-kb">';

    // Search bar + count
    html += '<div class="cairn-kb-header">';
    html += '<div class="cairn-kb-search-row">';
    html += '<input type="text" class="cairn-kb-search" id="cairn-kb-search" placeholder="Search ' + allResults.length + ' articles..." value="' + Cairn.esc(Cairn.kbSearchQuery || '') + '" autocomplete="off">';
    if (Cairn.kbSearchQuery || Cairn.kbTagFilter) {
      html += '<button class="cairn-kb-clear" id="cairn-kb-clear" title="Clear filters">\u2715</button>';
    }
    html += '</div>';
    if (results.length !== allResults.length) {
      html += '<span class="cairn-kb-count">' + results.length + ' of ' + allResults.length + '</span>';
    }
    html += '</div>';

    // Tag chips (always visible, not collapsible)
    html += '<div class="cairn-kb-tags" id="cairn-kb-tags">';
    tagList.forEach(function(t) {
      var active = Cairn.kbTagFilter === t ? ' active' : '';
      html += '<button class="cairn-chip cairn-kb-chip' + active + '" data-kbtag="' + Cairn.esc(t) + '">' + Cairn.esc(t) + ' <span class="cairn-chip-count">' + tagCounts[t] + '</span></button>';
    });
    html += '</div>';

    // Render each section
    sections.forEach(function(section) {
      if (section.items.length === 0) return; // hide empty sections when filtering
      html += '<div class="cairn-kb-section">';
      html += '<div class="cairn-kb-section-header" data-kb-section="' + section.key + '">';
      html += '<span class="cairn-kb-section-toggle">\u25BC</span>';
      html += '<span class="cairn-kb-section-icon">' + section.icon + '</span>';
      html += '<span class="cairn-kb-section-label">' + section.label + '</span>';
      html += '<span class="cairn-kb-section-count">' + section.items.length + '</span>';
      html += '</div>';

      html += '<div class="cairn-kb-list">';
      section.items.forEach(function(article) {
        var tags = article.tags ? (Array.isArray(article.tags) ? article.tags : article.tags.split(',')) : [];
        var flagged = article.is_flagged;
        var readonly = section.key === 'published' || section.key === 'archived';
        var classes = 'cairn-kb-article';
        if (flagged) classes += ' cairn-kb-flagged';
        if (readonly) classes += ' cairn-kb-readonly';
        html += '<div class="' + classes + '" data-slug="' + Cairn.esc(article.slug || article.id || article.kb_id || '') + '">';
        html += '<div class="cairn-kb-article-header">';
        html += '<span class="cairn-kb-article-title">' + Cairn.esc(article.title || article.topic || article.id || 'Untitled') + '</span>';
        if (article.display_rank) {
          html += '<span class="cairn-kb-rank">\u2B06 ' + article.display_rank + '</span>';
        }
        if (flagged) html += '<span class="cairn-kb-flag-badge">\uD83D\uDEA9 needs revision</span>';
        if (readonly) html += '<span class="cairn-kb-readonly-badge">read-only</span>';
        html += '</div>';
        html += '<div class="cairn-kb-article-body">' + Cairn.esc(Cairn.truncate(article.content || article.body || '', 200)) + '</div>';
        html += '<div class="cairn-kb-article-footer">';
        html += '<span class="cairn-kb-author">@' + Cairn.esc(article.author_id || article.author || '') + '</span>';
        if (article.updated_at) {
          html += '<span class="cairn-kb-date" title="' + Cairn.esc(article.updated_at) + '">' + Cairn.relTime(article.updated_at) + '</span>';
        }
        if (tags.length) {
          tags.forEach(function(t) { html += '<span class="cairn-tag">' + Cairn.esc(t.trim()) + '</span>'; });
        }
        if (section.key !== 'archived') {
          var articleId = article.id || article.kb_id || article.slug || '';
          html += '<button class="cairn-kb-flag-btn" onclick="Cairn.flagKb(\'' + Cairn.escJs(articleId) + '\')" title="Flag for revision">\uD83D\uDEA9 Flag</button>';
        }
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });

    if (results.length === 0 && (Cairn.kbSearchQuery || Cairn.kbTagFilter)) {
      html += '<div class="empty-text">No articles match your search</div>';
    }

    html += '</div>';
    body.innerHTML = html;

    // Wire search input (debounced, client-side only)
    var searchEl = document.getElementById('cairn-kb-search');
    if (searchEl) {
      var debounceTimer = null;
      searchEl.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          Cairn.kbSearchQuery = searchEl.value;
          Cairn.renderKb();
          // Re-focus and restore cursor
          var el = document.getElementById('cairn-kb-search');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 150);
      });
    }

    // Wire clear button
    var clearEl = document.getElementById('cairn-kb-clear');
    if (clearEl) {
      clearEl.addEventListener('click', function() {
        Cairn.kbSearchQuery = '';
        Cairn.kbTagFilter = null;
        Cairn.renderKb();
      });
    }

    // Wire article clicks for detail view
    document.querySelectorAll('.cairn-kb-article[data-slug]').forEach(function(card) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(e) {
        if (e.target.closest('.cairn-kb-flag-btn')) return;
        if (e.target.closest('.cairn-tag')) return;
        var slug = card.getAttribute('data-slug');
        if (slug) {
          card.style.opacity = '0.6';
          Cairn.loadKbDetail(slug);
        }
      });
    });

    // Wire tag chips (client-side toggle, no API call)
    document.querySelectorAll('.cairn-kb-chip[data-kbtag]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var t = chip.getAttribute('data-kbtag');
        Cairn.kbTagFilter = (Cairn.kbTagFilter === t) ? null : t;
        Cairn.renderKb();
      });
    });

    // Wire collapsible section headers
    document.querySelectorAll('.cairn-kb-section-header[data-kb-section]').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var section = hdr.closest('.cairn-kb-section');
        if (section) {
          section.classList.toggle('collapsed');
          var key = hdr.getAttribute('data-kb-section');
          Cairn._kbCollapsed = Cairn._kbCollapsed || {};
          Cairn._kbCollapsed[key] = section.classList.contains('collapsed');
        }
      });
      var key = hdr.getAttribute('data-kb-section');
      if (Cairn._kbCollapsed && Cairn._kbCollapsed[key]) {
        var section = hdr.closest('.cairn-kb-section');
        if (section) section.classList.add('collapsed');
      }
    });
  },

  async flagKb(kbId) {
    if (!kbId) return;
    var reason = prompt('Reason for flagging (optional):');
    if (reason === null) return;
    var result = await API.cairnKbFlag(kbId, reason);
    if (result && !result.error) {
      Cairn.toast('\uD83D\uDEA9 Flagged for review');
      Cairn.refreshKb();
    } else {
      Cairn.toast('\u26A0\uFE0F ' + (result ? result.error : 'Failed'), true);
    }
  },
});
