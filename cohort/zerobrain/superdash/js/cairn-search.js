/* CAIRN search and lifecycle extensions */
Object.assign(Cairn, {
  doSearch() {
    var input = document.getElementById('cairn-search-input');
    if (input && input.value.trim()) Cairn.search(input.value.trim());
  },

  renderLifecycle() {
    Cairn.view = 'lifecycle';
    var body = document.getElementById('cairn-body');
    if (!Cairn.trailData) { body.innerHTML = '<div class="cairn-empty">Load board first</div>'; return; }

    // Count items per stage
    var counts = {};
    var items = {};
    Cairn.stages.forEach(function(s) { counts[s] = 0; items[s] = []; });
    var trail = Cairn.trailData;
    if (trail.columns) {
      Object.keys(trail.columns).forEach(function(s) {
        var mapped = s === 'rfc' ? 'ideation' : s;
        var list = trail.columns[s] || [];
        counts[mapped] = (counts[mapped] || 0) + list.length;
        items[mapped] = (items[mapped] || []).concat(list);
      });
    }
    var total = 0;
    Cairn.stages.forEach(function(s) { total += counts[s]; });

    var html = '<div class="cairn-lifecycle">';
    html += '<div class="cairn-lifecycle-nav"><button class="cairn-btn-back" onclick="Cairn.renderBoard()">← Board</button><span class="cairn-lifecycle-title">RFC Lifecycle Pipeline</span><span class="cairn-lifecycle-total">' + total + ' items</span></div>';

    // Pipeline flow
    html += '<div class="cairn-pipeline">';
    Cairn.stages.forEach(function(stage, idx) {
      var color = Cairn.stageColors[stage];
      var label = Cairn.stageLabels[stage];
      var count = counts[stage];
      var pct = total > 0 ? Math.round(count / total * 100) : 0;

      html += '<div class="cairn-pipe-stage">';
      html += '<div class="cairn-pipe-bar" style="--pipe-color:' + color + '; --pipe-pct:' + pct + '%">';
      html += '<div class="cairn-pipe-fill" style="background:' + color + '; width:' + Math.max(pct, 8) + '%"></div>';
      html += '</div>';
      html += '<div class="cairn-pipe-label">';
      html += '<span class="cairn-pipe-dot" style="background:' + color + '"></span>';
      html += '<span class="cairn-pipe-name">' + label + '</span>';
      html += '<span class="cairn-pipe-count">' + count + '</span>';
      html += '<span class="cairn-pipe-pct">(' + pct + '%)</span>';
      html += '</div>';
      // Show top 5 items in this stage
      if (items[stage] && items[stage].length > 0) {
        html += '<div class="cairn-pipe-items">';
        items[stage].slice(0, 5).forEach(function(r) {
          html += '<div class="cairn-pipe-item" data-rfc="' + Cairn.esc(r.rfc_id || r.id || '') + '">';
          html += Cairn.esc(Cairn.truncate(r.title, 50));
          if (r.star_count) html += ' ⭐' + r.star_count;
          html += '</div>';
        });
        if (items[stage].length > 5) {
          html += '<div class="cairn-pipe-more">+' + (items[stage].length - 5) + ' more</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      // Arrow between stages
      if (idx < Cairn.stages.length - 1) {
        html += '<div class="cairn-pipe-arrow">→</div>';
      }
    });
    html += '</div>';

    // Conversion funnel stats
    var seedCount = counts['seed'] || 0;
    var rfcCount = counts['rfc'] || 0;
    var ratifiedCount = counts['ratified'] || 0;
    var shippedCount = counts['shipped'] || 0;
    html += '<div class="cairn-funnel">';
    html += '<div class="cairn-funnel-title">Conversion Funnel</div>';
    html += '<div class="cairn-funnel-stats">';
    html += '<span class="cairn-funnel-stat">Seed→RFC: ' + (seedCount + rfcCount > 0 ? Math.round(rfcCount / (seedCount + rfcCount) * 100) : 0) + '%</span>';
    html += '<span class="cairn-funnel-stat">RFC→Ratified: ' + (rfcCount + ratifiedCount > 0 ? Math.round(ratifiedCount / (rfcCount + ratifiedCount) * 100) : 0) + '%</span>';
    html += '<span class="cairn-funnel-stat">Ratified→Shipped: ' + (ratifiedCount + shippedCount > 0 ? Math.round(shippedCount / (ratifiedCount + shippedCount) * 100) : 0) + '%</span>';
    html += '</div></div>';

    html += '</div>';
    body.innerHTML = html;

    // Wire item clicks
    body.querySelectorAll('.cairn-pipe-item[data-rfc]').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-rfc');
        if (id) Cairn.loadForum(id);
      });
    });
  },
});
