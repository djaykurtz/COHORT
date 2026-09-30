/* Superdash v2 -- Top-bar BreathBus pill
 *
 * Replaces the previous "Nodes 6/6" header stat with a compact per-host /
 * per-rider status line:
 *
 *     BB: D * | N *, U *, Z * | Q *, T *
 *
 * Hosts are grouped by CONFIG.HOSTS, separated by ' | '. Within each host
 * group, each rider's first letter is followed by an indicator '*' coloured
 * by its breathbus reachability/heartbeat status. Hourly refresh + on-demand
 * refresh via BBPill.refresh(); never blocks main page load.
 */

var BBPill = {
  _POLL_MS: 3600000,  // 1h per OPERATOR ("polls every hour and on refresh")
  _timer: null,
  _data: null,

  init: function() {
    var el = document.getElementById('stat-bb-pill');
    if (!el) return;
    el.textContent = '…';
    // Defer first refresh so it doesn't block main render
    setTimeout(BBPill.refresh, 2000);
    BBPill._timer = setInterval(BBPill.refresh, BBPill._POLL_MS);
  },

  _hostState: function(hostName) {
    if (typeof BusPanel === 'undefined' || !BusPanel._data || !BusPanel._data.hosts) {
      return { hostOk: false, riders: {} };
    }
    var host = BusPanel._data.hosts.filter(function(h) { return h.name === hostName; })[0];
    if (!host) return { hostOk: false, riders: {} };

    var hostOk = !!host._reachable;
    var riderState = {};

    // Use BusPanel._fleetNodes (already keyed by node_id) for rider heartbeat freshness.
    var fleetMap = BusPanel._fleetNodes || {};
    var riderIds = CONFIG.HOSTS[hostName] || [];
    riderIds.forEach(function(rid) {
      var node = fleetMap[rid];
      var fresh = false;
      if (node && node.last_seen) {
        var age = Date.now() - new Date(node.last_seen).getTime();
        fresh = age < 300000;  // 5min freshness window
      }
      riderState[rid] = fresh;
    });

    return { hostOk: hostOk, riders: riderState };
  },

  refresh: function() {
    var el = document.getElementById('stat-bb-pill');
    if (!el) return;

    var run = function() {
      // Current node-bearing hosts: COORD_HOST and WORKER_HOST. WORKER_HOST_2 is retired.
      var hostNames = ['COORD_HOST', 'WORKER_HOST'].filter(function(h) { return CONFIG.HOSTS[h]; });
      // Append any extras not in the canonical order
      Object.keys(CONFIG.HOSTS).forEach(function(h) {
        if (hostNames.indexOf(h) === -1) hostNames.push(h);
      });
      // UXIA 2026-06-06 visual upgrade: CSS-dots + visual separators (no text * | ,)
      var groups = [];
      hostNames.forEach(function(hostName) {
        var state = BBPill._hostState(hostName);
        var hostLetter = hostName.charAt(0);
        var riderIds = (CONFIG.HOSTS[hostName] || []).slice().sort();
        var riderHtml = riderIds.map(function(rid) {
          var fresh = state.riders[rid] ? 'true' : 'false';
          var letter = rid.charAt(0);
          return '<span class="bb-pill-rider" data-fresh="' + fresh + '" title="' + rid + '">'
            + '<span class="bb-pill-letter">' + letter + '</span>'
            + '<span class="bb-pill-dot" aria-hidden="true"></span>'
            + '</span>';
        });
        if (riderHtml.length === 0) {
          var hostFresh = state.hostOk ? 'true' : 'false';
          riderHtml.push('<span class="bb-pill-rider" data-fresh="' + hostFresh + '" title="' + hostName + '">'
            + '<span class="bb-pill-letter">' + hostLetter + '</span>'
            + '<span class="bb-pill-dot" aria-hidden="true"></span>'
            + '</span>');
        }
        groups.push('<span class="bb-pill-group">' + riderHtml.join('') + '</span>');
      });
      el.innerHTML = groups.join('<span class="bb-pill-sep" aria-hidden="true"></span>');
      el.title = 'BreathBus snapshot (refreshes hourly) -- '
        + 'green dot = rider heartbeat fresh (<5min), grey dot = stale/offline';
    };

    // Ensure BusPanel data exists; if not, ask it to refresh first.
    if (typeof BusPanel !== 'undefined' && BusPanel.refresh) {
      if (!BusPanel._data) {
        BusPanel.refresh().then(run).catch(run);
      } else {
        // Fire async refresh in background; render with current data immediately,
        // then re-render when fresh data arrives.
        run();
        BusPanel.refresh().then(run).catch(function() { /* keep stale */ });
      }
    } else {
      el.textContent = 'BB?';
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', BBPill.init);
} else {
  BBPill.init();
}
