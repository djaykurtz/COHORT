/* Superdash v2 -- App Bootstrap (S3) */

var App = {
  lastFleet: null,
  lastHealth: null,
  lastMolt: null,
  errorCount: 0,
  pollTimer: null,
  clockTimer: null,
  currentTab: 'taskboard',

  // SWAT-superdash-perf-G: clock previously ticked every 1s unconditionally, even
  // with the tab hidden/backgrounded. Store the interval handle + expose start/stop
  // so PerfGuard's pause()/resume() registry (js/perf-guard.js, ZBPRIME's A+B
  // consolidation) can wire these in alongside its other ~18 timers -- NOT
  // self-wired here anymore (see ZBPRIME thread 2026-08-13: folding G into A+B
  // to avoid two independent visibilitychange listeners doing the same job).
  updateClock: function() {
    var el = document.getElementById('clock');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }
  },

  startClock: function() {
    if (App.clockTimer) return;
    App.clockTimer = setInterval(App.updateClock, 1000);
    App.updateClock();
  },

  stopClock: function() {
    if (App.clockTimer) {
      clearInterval(App.clockTimer);
      App.clockTimer = null;
    }
  },

  init: function() {
    // Clock (paused/resumed on tab visibility -- App.startClock()/stopClock() are
    // wired into PerfGuard's pause()/resume() registry in js/perf-guard.js, not
    // here, to keep a single source of truth for visibility-driven timer control).
    App.startClock();

    // Wire up tabs (skip cairn -- it uses its own toggle handler)
    document.querySelectorAll('#main-tabs .tab').forEach(function(tab) {
      if (tab.getAttribute('data-tab') === 'cairn') return;
      tab.addEventListener('click', function() {
        var tabName = tab.getAttribute('data-tab');
        App.switchTab(tabName);
      });
    });

    // SWAT-2026-06-05 (NIMBUS, ref UXIA #49015): Fleet legacy-overflow drawer.
    // Trigger toggles popup; menuitems dispatch to App.switchTab (FleetSections.init
    // remains lazy through existing switchTab gate -- no new lazy-load machinery).
    (function wireOverflowDrawer() {
      var trigger = document.getElementById('tabs-overflow-trigger');
      var popup = document.getElementById('tabs-overflow-popup');
      if (!trigger || !popup) return;
      function setOpen(open) {
        popup.hidden = !open;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();  // guard outside-click handler from same event
        setOpen(popup.hidden);
      });
      popup.querySelectorAll('.tabs-overflow-item[data-tab]').forEach(function(item) {
        item.addEventListener('click', function() {
          App.switchTab(item.getAttribute('data-tab'));
          setOpen(false);
          trigger.focus();
        });
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !popup.hidden) {
          setOpen(false);
          trigger.focus();
        }
      });
      document.addEventListener('click', function(e) {
        if (popup.hidden) return;
        if (popup.contains(e.target) || trigger.contains(e.target)) return;
        setOpen(false);
      });
    })();

    // Wire up node selection to show messages
    Nodes.selectNode = function(nodeId) {
      Nodes.currentNode = nodeId;
      document.querySelectorAll('.node-card').forEach(function(c) {
        c.classList.toggle('active', c.getAttribute('data-node') === nodeId);
      });
      // Clear active tab styling (node view overrides tabs)
      document.querySelectorAll('#main-tabs .tab').forEach(function(t) {
        t.classList.remove('active');
      });
      // SWAT-2026-06-05: also clear overflow-trigger active when node view takes over.
      var ovfTrigger = document.getElementById('tabs-overflow-trigger');
      if (ovfTrigger) ovfTrigger.classList.remove('active');
      App.currentTab = 'node';
      App.showNodeMessages(nodeId);
    };

    // Initial fetch
    App.refresh();

    // SWAT-20260612-0039 Δ3: start the fleet-refresh age ticker so the header indicator
    // updates between fetches (5s tick; no extra coord load -- pure render-side).
    if (typeof Panels !== 'undefined' && Panels.startFleetRefreshTicker) {
      Panels.startFleetRefreshTicker();
    }

    // Poll loop (fallback render trigger -- FleetState handles actual fetching + dedup)
    // SWAT-20260612-0039 Δ1: drop the 60s floor -- respect CONFIG.FLEET_POLL_INTERVAL as-set.
    // Lowering the config value below 60000 is a separate OPERATOR-gated call (net-new coord poll load).
    App.pollTimer = setInterval(App.refresh, CONFIG.FLEET_POLL_INTERVAL);

    // Register service worker for offline support
    App.registerSW();

    // Try SSE connection
    SSE.connect();

    // Preload TaskBoard (default tab) and scripts
    TaskBoard.load().then(function() {
      BootLoader.step();
      if (App.currentTab === 'taskboard') TaskBoard.renderPanel();
    }).catch(function() { BootLoader.step(); });
    Scripts.load().then(function() { BootLoader.step(); }).catch(function() { BootLoader.step(); });

    console.log('[Superdash v2] S3 initialized -- tabs + scripts + broadcast + kanban');
  },

  registerSW: function() {
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] Service workers not supported');
      App.setSWStatus('n/a', 'var(--text-tertiary)');
      return;
    }
    if (!window.isSecureContext) {
      console.log('[SW] Insecure context (HTTP + non-localhost) -- SW disabled. Use HTTPS or localhost for offline support.');
      App.setSWStatus('insecure', 'var(--warning)');
      return;
    }
    // SW self-heal delivery (SWAT-20260628-0008): when a NEW service worker takes
    // control (a guard-ship / asset update), reload ONCE so the page picks up the
    // new JS instead of a stale cache-first SW serving old code indefinitely. This
    // is the durable fix for "shipped a fix but the client never gets it." Double-
    // guarded (in-flight flag + once-per-session sessionStorage cap) so it can NEVER
    // become a reload loop.
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (App._swReloading) return;
      try {
        if (sessionStorage.getItem('zb-sw-reloaded')) return;
        sessionStorage.setItem('zb-sw-reloaded', '1');
      } catch (e) { /* sessionStorage unavailable -- in-flight flag still guards */ }
      App._swReloading = true;
      console.log('[SW] New controller active -- reloading once to apply update');
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js')
      .then(function(reg) {
        console.log('[SW] Registered, scope:', reg.scope);
        App.swRegistration = reg;

        reg.addEventListener('updatefound', function() {
          var newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', function() {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] Update available');
              App.showSWUpdate();
            }
          });
        });

        App.setSWStatus('active', 'var(--success)');
      })
      .catch(function(err) {
        console.warn('[SW] Registration failed:', err);
        App.setSWStatus('failed', 'var(--error)');
      });
  },

  setSWStatus: function(text, color) {
    var el = document.getElementById('status-sw');
    if (el) {
      el.textContent = text;
      el.style.color = color;
    }
  },

  showSWUpdate: function() {
    if (typeof Notify !== 'undefined' && Notify.show) {
      Notify.show({
        type: 'info',
        icon: '🔄',
        title: 'Superdash updated',
        msg: 'Hard-refresh (Ctrl+Shift+R) to load new version'
      });
    }
  },

  switchTab: function(tabName) {
    App.currentTab = tabName;
    Nodes.currentNode = null;

    // Clean up chat layout class when switching away
    var mc = document.getElementById('main-content');
    if (mc) mc.classList.remove('chat-layout');
    var mainEl = document.querySelector('.main');
    if (mainEl) mainEl.classList.remove('chat-active');
    var cockpitEl = document.querySelector('.cockpit');
    if (cockpitEl) cockpitEl.classList.remove('chat-grid-mode');

    document.querySelectorAll('#main-tabs .tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    // SWAT-2026-06-05: Fleet tab lives in overflow drawer; reflect active state on trigger.
    var ovfTrigger = document.getElementById('tabs-overflow-trigger');
    if (ovfTrigger) {
      ovfTrigger.classList.toggle('active', tabName === 'overview');
    }
    document.querySelectorAll('.node-card').forEach(function(c) {
      c.classList.remove('active');
    });

    switch (tabName) {
      case 'overview':
        Panels.showFleetOverview();
        if (App.lastFleet && App.lastFleet.nodes) {
          if (typeof FleetSections !== 'undefined' && FleetSections._mounted) {
            FleetSections.renderResilience(App.lastFleet.nodes);
          } else {
            Nodes.renderOverviewCards(App.lastFleet.nodes);
          }
          if (App.lastFleet.recent_events) {
            App.showRecentEvents(App.lastFleet.recent_events);
          }
        }
        break;
      case 'taskboard':
        TaskBoard.renderPanel();
        break;
      case 'docs':
      case 'scripts':
      case 'images':
      case 'files':
        FilesPanel.renderPanel();
        break;
      case 'broadcast':
        Broadcast.renderPanel();
        break;
      case 'messages':
        Messaging.renderPanel();
        break;
      case 'guestbook':
        Guestbook.renderPanel();
        break;
      case 'cairn-panel':
        CairnPanel.renderPanel();
        break;
      case 'bus':
        // Redirect to Fleet tab, expand bus section
        if (typeof FleetSections !== 'undefined') {
          App.switchTab('overview');
          FleetSections.expand('bus');
          return;
        }
        BusPanel.renderPanel();
        break;
      case 'recovery':
        // Redirect to Fleet tab, expand recovery section
        if (typeof FleetSections !== 'undefined') {
          App.switchTab('overview');
          FleetSections.expand('recovery');
          return;
        }
        RecoveryPanel.renderPanel();
        break;
      case 'gary':
        // RFC588: OPERATOR-gated pull-only view -- explicit nav ONLY, no
        // auto-render/SSE. This case is the ONLY entry point into GaryPanel;
        // it must never be reached from a polling loop or App.lastFleet refresh.
        GaryPanel.renderPanel();
        break;
      case 'merit':
        Merit.renderPanel();
        break;
      case 'corrections':
        Corrections.load().then(function() { Corrections.renderPanel(); });
        break;
      case 'boomerang':
        Boomerang.renderPanel();
        break;
      case 'notifications':
        NotificationsPanel.renderPanel();
        break;
      case 'review-pipeline':
        ReviewPipeline.renderPanel();
        break;
    }
  },

  refresh: async function() {
    // RFC-FDDB12: Route all fetches through FleetState singleton for caching + dedup
    var settled = await Promise.allSettled([
      FleetState.get('/api/fleet'),
      FleetState.get('/api/health'),
      // MOLT fetch disabled per OPERATOR 2026-06-04 (UI card+pill hidden).
      // App.lastMolt is referenced nowhere else; Promise.resolve(null) preserves index alignment.
      Promise.resolve(null),
      FleetState.get('/api/dashboard/heartbeats')
    ]);

    // Boot loader: each resolved fetch = one step
    settled.forEach(function() { BootLoader.step(); });

    var fleet = settled[0].status === 'fulfilled' ? settled[0].value : null;
    var health = settled[1].status === 'fulfilled' ? settled[1].value : null;
    var molt = settled[2].status === 'fulfilled' ? settled[2].value : null;
    var heartbeats = settled[3].status === 'fulfilled' ? settled[3].value : null;

    // Build heartbeat lookup for life service indicators
    var hbMap = {};
    if (heartbeats && heartbeats.nodes) {
      heartbeats.nodes.forEach(function(hb) { hbMap[hb.node_id] = hb; });
    }

    if (!fleet && !health) {
      App.errorCount++;
      if (App.errorCount > 3) {
        Panels.setConnected(false);
        var content = document.getElementById('main-content');
        if (content && App.currentTab === 'overview') {
          // Use Components error banner if available, fallback to inline
          if (typeof Components !== 'undefined') {
            content.innerHTML = Components.errorBanner({
              message: 'Cannot reach coordinator API at ' + CONFIG.API_BASE
            });
          } else {
            content.innerHTML = '<div class="empty-text" style="color:var(--error)">'
              + '&#9888; Cannot reach coordinator API at ' + Panels.esc(CONFIG.API_BASE)
              + '<br><span style="font-size:11px;color:var(--text-tertiary)">'
              + 'Origin: ' + window.location.origin
              + ' -- Try hard-refresh (Ctrl+Shift+R) or check CORS/network</span></div>';
          }
        }
      }
      return;
    }

    App.errorCount = 0;
    if (!SSE.connected) {
      Panels.setConnected(true);
    }

    // Dirty-check: skip expensive DOM rewrites if data hasn't changed
    var pg = typeof PerfGuard !== 'undefined' ? PerfGuard : null;

    if (fleet && fleet.nodes) {
      var fleetHash = pg ? pg.quickHash(fleet.nodes) : '';
      var fleetChanged = !pg || fleetHash !== pg._lastFleetHash;
      if (fleetChanged) {
        if (pg) pg._lastFleetHash = fleetHash;
        App.lastFleet = fleet;
        Nodes.nodeData = {};
        fleet.nodes.forEach(function(n) {
          var hb = hbMap[n.node_id];
          if (hb) {
            n.heartbeat_status = hb.status;
            n.heartbeat_phase = hb.heartbeat_phase;
            n.heartbeat_last_seen = hb.last_seen;
          }
          Nodes.nodeData[n.node_id] = n;
        });

        Nodes.renderNav(fleet.nodes);

        if (App.currentTab === 'overview' && !Nodes.currentNode) {
          if (typeof FleetSections !== 'undefined' && FleetSections._mounted) {
            FleetSections.renderResilience(fleet.nodes);
            // RFC421 contract-drift fix: surface breakglass_overrides_24h on each refresh
            FleetSections.renderAuth(fleet);
          } else {
            Nodes.renderOverviewCards(fleet.nodes);
          }
          if (fleet.recent_events && fleet.recent_events.length) {
            App.showRecentEvents(fleet.recent_events);
          }
        }
      }

      // Active Tasks intel panel was removed 2026-06-06 (UXIA, OPERATOR-direct).
      // renderTasks still exists as a no-op-safe shim (guards missing #task-list)
      // so legacy callers don't throw, but we skip the call entirely now.
      // var taskData = { tasks: fleet.tasks || [] };
      // Panels.renderTasks(taskData);

      var taskCount = 0;
      (fleet.tasks || []).forEach(function(t) {
        if (t.status === 'in_progress' || t.status === 'ready' || t.status === 'review' || t.status === 'blocked') {
          taskCount++;
        }
      });
      document.getElementById('stat-tasks').textContent = taskCount;
    }

    if (health) {
      var healthHash = pg ? pg.quickHash(health) : '';
      var healthChanged = !pg || healthHash !== pg._lastHealthHash;
      if (healthChanged) {
        if (pg) pg._lastHealthHash = healthHash;
        App.lastHealth = health;
        Panels.renderHealth(health);
      }
    }

    if (molt) {
      App.lastMolt = molt;
      Panels.renderMolt(molt);
    }

    Panels.updateHeader(health, fleet);
    Panels.updateStatusBar(health, molt);
  },

  showNodeMessages: async function(nodeId) {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = nodeId + ' \u2014 Chat';
    badge.textContent = 'loading...';
    content.innerHTML = '<div class="loading-text">Loading messages...</div>';

    await Messages.loadForNode(nodeId);
    Messages.renderChat(nodeId);
  },

  showRecentEvents: function(events) {
    // Render into nodes section body if FleetSections is mounted, else main-content
    var content = (typeof FleetSections !== 'undefined' && FleetSections._mounted)
      ? document.getElementById('fleet-body-nodes')
      : document.getElementById('main-content');
    if (!content || !events || !events.length) return;

    // Remove previous recent-activity block to prevent DOM growth
    var existing = content.querySelector('.recent-activity-block');
    if (existing) existing.remove();

    var html = '<div class="recent-activity-block" style="margin-top:16px">'
      + '<div style="font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:8px">Recent Activity</div>';

    events.slice(0, 15).forEach(function(e) {
      var color = Nodes.getColor(e.node_id);
      var time = '';
      if (e.timestamp) {
        try { time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); }
        catch(err) { time = ''; }
      }
      var msg = e.message || '';
      if (msg.length > 100) msg = msg.substring(0, 100) + '...';

      html += '<div class="event-item">'
        + '<span class="event-time">' + time + '</span>'
        + '<span class="event-node" style="color:' + color + '">' + (e.node_id || '??') + '</span>'
        + '<span>' + Panels.esc(msg) + '</span>'
        + '</div>';
    });

    html += '</div>';
    content.insertAdjacentHTML('beforeend', html);
  }
};

// Boot
App.init();

// RFC-FDDB12: Refresh Now button handler
App.refreshNow = function() {
  var btn = document.getElementById('refresh-now');
  if (btn) { btn.classList.add('spinning'); }
  // Refresh both FleetState cache and legacy App.refresh rendering
  var p1 = typeof FleetState !== 'undefined' ? FleetState.refreshAll() : Promise.resolve();
  var p2 = App.refresh();
  Promise.all([p1, p2]).then(function() {
    if (btn) { setTimeout(function() { btn.classList.remove('spinning'); }, 300); }
  });
};
