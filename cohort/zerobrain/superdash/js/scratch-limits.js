/* Scratch Limits UX -- RFC-FEF0A7
 * Enforces size awareness on scratch creation:
 *   15KB soft warning (approaching limit)
 *   25KB hard cap (reject with explanation)
 * Also renders artifact deprecation notice on compose flows.
 *
 * Wire: loaded after scratch-threads.js
 * API expects: scratchData.usage = { bytes_used, entries_count, limit_soft, limit_hard }
 */

Object.assign(Cairn, {

  SCRATCH_SOFT_LIMIT: 15360,  // 15KB
  SCRATCH_HARD_LIMIT: 25600,  // 25KB

  // Per-row size accounting. Server contract (RFC437 / KB cairn-scratch-no-multipart):
  //   - 25KB HARD cap PER SCRATCH ROW (rejected at create_scratch)
  //   - 15KB SOFT warning PER SCRATCH ROW
  //   - NO server-side aggregate quota -- so summing all entries was wrong
  //     and caused the "44.9KB / 25KB pad full" false-block. (UXIA 2026-06-04)
  // We surface the largest existing entry as a "how close any single note is to
  // the per-row cap" signal, NOT a pad-wide budget.
  getScratchUsage() {
    var entries = (Cairn.scratchData && Cairn.scratchData.entries) || [];
    var largest = 0;
    entries.forEach(function(e) {
      var sz = (e.content || '').length;
      if (sz > largest) largest = sz;
    });
    return {
      bytes: largest,
      softLimit: Cairn.SCRATCH_SOFT_LIMIT,
      hardLimit: Cairn.SCRATCH_HARD_LIMIT,
      count: entries.length
    };
  },

  // Returns usage tier: 'ok' | 'warn' | 'critical' | 'blocked'
  getScratchTier() {
    var usage = Cairn.getScratchUsage();
    var pct = usage.bytes / usage.hardLimit;
    if (usage.bytes >= usage.hardLimit) return 'blocked';
    if (usage.bytes >= usage.softLimit) return 'critical';
    if (pct >= 0.6) return 'warn';
    return 'ok';
  },

  // Render the usage meter bar + warning text
  renderScratchUsageMeter() {
    var usage = Cairn.getScratchUsage();
    var tier = Cairn.getScratchTier();
    var pct = Math.min(100, Math.round((usage.bytes / usage.hardLimit) * 100));
    var kbUsed = (usage.bytes / 1024).toFixed(1);
    var kbHard = (usage.hardLimit / 1024).toFixed(0);

    var html = '<div class="scratch-usage-meter tier-' + tier + '">';
    html += '<div class="scratch-usage-bar-track">';
    html += '<div class="scratch-usage-bar-fill" style="width:' + pct + '%"></div>';
    // Soft limit marker at proportional position
    var softPct = Math.round((usage.softLimit / usage.hardLimit) * 100);
    html += '<div class="scratch-usage-bar-marker" style="left:' + softPct + '%" title="Soft limit (' + (usage.softLimit / 1024).toFixed(0) + 'KB)"></div>';
    html += '</div>';
    html += '<div class="scratch-usage-label">Largest entry: ' + kbUsed + ' KB / ' + kbHard + ' KB per-row cap</div>';

    // Warning/blocking message (refers to the largest existing entry; per-row, not aggregate)
    if (tier === 'blocked') {
      html += '<div class="scratch-usage-msg scratch-msg-blocked">';
      html += '<span class="scratch-msg-icon">🚫</span>';
      html += '<span class="scratch-msg-text">An entry has hit the 25KB per-row cap. New scratches under 25KB still post fine.</span>';
      html += '</div>';
    } else if (tier === 'critical') {
      html += '<div class="scratch-usage-msg scratch-msg-critical">';
      html += '<span class="scratch-msg-icon">⚠️</span>';
      html += '<span class="scratch-msg-text">An entry is approaching the 25KB per-row hard cap. Split long content across multiple scratches.</span>';
      html += '</div>';
    } else if (tier === 'warn') {
      html += '<div class="scratch-usage-msg scratch-msg-warn">';
      html += '<span class="scratch-msg-icon">📊</span>';
      html += '<span class="scratch-msg-text">Largest entry is over 60% of the per-row cap. Keep individual notes under 25KB.</span>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  // Render blocked state (shown only when the current draft alone exceeds 25KB)
  renderScratchBlockedOverlay() {
    return '<div class="scratch-blocked-overlay">'
      + '<div class="scratch-blocked-card">'
      + '<div class="scratch-blocked-icon">🚫</div>'
      + '<h3 class="scratch-blocked-title">Entry exceeds per-row cap</h3>'
      + '<p class="scratch-blocked-body">A single scratch entry is hard-capped at <strong>25 KB</strong>. Options:</p>'
      + '<ul class="scratch-blocked-actions">'
      + '<li>Trim this draft to fit under 25 KB</li>'
      + '<li>Split the content across multiple scratches (link them via the same <code>ref_task_id</code> / <code>ref_rfc_id</code> to thread them)</li>'
      + '<li>Promote to a KB article if it\'s reference material</li>'
      + '</ul>'
      + '<p class="scratch-blocked-hint">There is no aggregate pad quota -- only the per-row 25 KB hard cap.</p>'
      + '<button class="scratch-blocked-dismiss" onclick="Cairn.dismissBlockedOverlay()">Got it</button>'
      + '</div></div>';
  },

  dismissBlockedOverlay() {
    var overlay = document.querySelector('.scratch-blocked-overlay');
    if (overlay) overlay.remove();
  },

  // Artifact deprecation notice component
  renderArtifactDeprecationNotice() {
    return '<div class="artifact-deprecation-notice">'
      + '<div class="artifact-dep-icon">📦→📝</div>'
      + '<div class="artifact-dep-content">'
      + '<strong>publish_artifact is deprecated</strong>'
      + '<p>Use <code>cairn_scratch</code> with ref-linking instead. Scratch entries are living documents -- pin important ones, link to tasks/RFCs, and they stay with the work.</p>'
      + '<div class="artifact-dep-migration">'
      + '<span class="artifact-dep-label">Migration path:</span>'
      + '<code>cairn_scratch content="..." ref_task_id="..." pinned=true</code>'
      + '</div>'
      + '</div></div>';
  },

  // Inject usage meter into scratch header (hook into renderScratch)
  _renderScratchWithLimits: null,

  initScratchLimits() {
    // Wrap existing renderScratch to inject usage meter
    var origRender = Cairn.renderScratch.bind(Cairn);
    Cairn._renderScratchWithLimits = origRender;

    Cairn.renderScratch = function() {
      origRender();
      // Inject usage meter after header
      var header = document.querySelector('.cairn-scratch-header');
      if (header) {
        var tier = Cairn.getScratchTier();
        if (tier !== 'ok') {
          var meterDiv = document.createElement('div');
          meterDiv.innerHTML = Cairn.renderScratchUsageMeter();
          header.parentElement.insertBefore(meterDiv.firstChild, header.nextSibling);
        }
      }
    };
  },

  // Call on scratch compose attempt -- returns true if allowed.
  // Server only rejects when the SINGLE compose buffer exceeds 25KB; there's
  // no aggregate quota. Block only when this specific entry would be rejected.
  canCreateScratch(contentBytes) {
    var hardLimit = Cairn.SCRATCH_HARD_LIMIT;
    if ((contentBytes || 0) >= hardLimit) {
      var body = document.getElementById('cairn-body');
      if (body) {
        var div = document.createElement('div');
        div.innerHTML = Cairn.renderScratchBlockedOverlay();
        body.appendChild(div.firstChild);
      }
      return false;
    }
    return true;
  }
});

// Auto-init when scratch-limits loads
if (typeof Cairn !== 'undefined') {
  Cairn.initScratchLimits();
}
