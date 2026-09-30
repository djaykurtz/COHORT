/* Superdash v2 -- Configuration */

var CONFIG = (function() {
  // Auto-detect: use same hostname browser used to reach us, but coordinator port
  var host = window.location.hostname || '127.0.0.1';
  return {
    API_BASE: 'http://' + host + ':8420',
    AUTH_TOKEN: 'REPLACE_WITH_FLEET_TOKEN',
    DISPLAY_TIME_ZONE: 'UTC',
    POLL_INTERVAL: 60000,
  FLEET_POLL_INTERVAL: 60000,
  TASK_POLL_INTERVAL: 60000,
  HEALTH_POLL_INTERVAL: 45000,
  NODE_COLORS: {
    DRAGON: '#f0883e',
    ZBPRIME: '#58a6ff',
    NIMBUS: '#3fb950',
    QUATTRO: '#d2a8ff',
    TEMPO: '#d29922',
    UXIA: '#f778ba'
  },
  HOSTS: {
    COORD_HOST: ['ZBPRIME', 'NIMBUS', 'UXIA'],
    WORKER_HOST: ['QUATTRO', 'TEMPO', 'DRAGON']
  },
  BREATHBUS: {
    COORD_HOST: { port: 8440, ip: '127.0.0.1' },
    WORKER_HOST: { port: 8440, ip: '<worker-host-address>' }
  },
  BUS_POLL_INTERVAL: 30000
  };
})();

// RFC017-P5 AC18: enable the tool-cost intel widget by default. The P3.5 backend
// (GET /api/tool_costs) is shipped and tool_telemetry has accreted, so the widget
// is promoted from default-OFF to default-ON. Reversible: set to false here (or
// localStorage.removeItem('toolCostWidget')) to hide it again.
window.TOOL_COST_WIDGET_ENABLED = true;
