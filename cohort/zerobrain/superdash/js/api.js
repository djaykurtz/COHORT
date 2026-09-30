/* Superdash v2 -- API Layer */

const API = {
  async get(endpoint) {
    try {
      var headers = { 'Accept': 'application/json' };
      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      }
      const resp = await fetch(CONFIG.API_BASE + endpoint, { headers: headers });
      if (!resp.ok) {
        try { var errBody = await resp.json(); if (errBody && errBody.error) return errBody; } catch(e) {}
        throw new Error('HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] ' + endpoint + ' failed:', err.message);
      return null;
    }
  },

  async getFleetStatus() {
    return this.get('/api/fleet');
  },

  async getHealth() {
    return this.get('/api/health');
  },

  async getHeartbeats() {
    return this.get('/api/dashboard/heartbeats');
  },

  async getTaskBoard() {
    return this.get('/api/tasks?include_completed=false');
  },

  async updateTask(taskId, updates) {
    try {
      var token = localStorage.getItem('cairn_operator_token');
      if (!token) {
        token = prompt('Enter OPERATOR token to update tasks:');
        if (!token) return { error: 'No token provided' };
        localStorage.setItem('cairn_operator_token', token);
      }
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json',
        'X-Operator-Token': token };
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      var resp = await fetch(CONFIG.API_BASE + '/api/tasks/' + encodeURIComponent(taskId), {
        method: 'PUT', headers: headers, body: JSON.stringify(updates)
      });
      if (resp.status === 401 || resp.status === 403) {
        localStorage.removeItem('cairn_operator_token');
        return { error: 'Invalid token -- cleared. Try again.' };
      }
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || errBody.detail || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] PUT tasks/' + taskId + ' failed:', err.message);
      return { error: err.message };
    }
  },

  async getNodeLifecycle() {
    return this.get('/api/lifecycle/events');
  },

  async getMoltStatus() {
    return this.get('/api/molt/status');
  },

  async getMessages(nodeId, status) {
    var url = '/api/messages/' + nodeId;
    if (status) url += '?status=' + status;
    return this.get(url);
  },

  async getWorkload() {
    return this.get('/api/workload');
  },

  async getSwats(stages) {
    // Server accepts one stage per request. Fetch each active stage separately
    // so closed history cannot consume the shared page cap before the
    // client filters it.
    // SWAT-20260821-0009 (OPERATOR-direct): 'fixed' (fix landed, awaiting close)
    // is REAL unclosed workload, not administrative noise -- a fixed-but-unclosed
    // SWAT can still need an outstanding re-cosign, an OPERATOR activation
    // decision, or simply someone to run close_swat. Previously excluding it
    // caused Superdash to undercount active SWATs relative to the coordinator's
    // actual state (superdash needs to be accurate and up to date at all
    // times, it is my only view into workloads -- OPERATOR). Default now
    // includes all three non-terminal stages.
    var allow = stages || ['open', 'in_review', 'fixed'];
    var pages = await Promise.all(allow.map(function(stage) {
      return API.get('/api/swats?stage=' + encodeURIComponent(stage) + '&limit=200');
    }));
    pages.forEach(function(data, index) {
      if (!data || !Array.isArray(data.swats)) {
        var err = new Error('Incomplete SWAT response for stage ' + allow[index]);
        err.name = 'SwatCompletenessError';
        err.stage = allow[index];
        throw err;
      }
    });
    var swats = [];
    pages.forEach(function(data) { swats = swats.concat(data.swats); });
    return { swats: swats, count: swats.length };
  },

  async getSwat(swatId) {
    return this.get('/api/swats/' + encodeURIComponent(swatId));
  },

  async getSwatsCount(status) {
    // SWAT-20260612-0001 Defect-B fix: authoritative unbounded COUNT(*) for
    // badge surfaces. Server endpoint /api/swats/count?status=... returns
    // {count: N} with no LIMIT (mirrors /api/swats filter contract: status=
    // alias for stage=, both-supplied → 400). Use this for top-of-board
    // badge + column-header total; never relies on len(page).
    var qs = status ? '?status=' + encodeURIComponent(status) : '';
    var d = await this.get('/api/swats/count' + qs);
    return (d && typeof d.count === 'number') ? d.count : null;
  },

  async post(endpoint, body) {
    try {
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      }
      const resp = await fetch(CONFIG.API_BASE + endpoint, {
        method: 'POST', headers: headers, body: JSON.stringify(body)
      });
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] POST ' + endpoint + ' failed:', err.message);
      return { error: err.message };
    }
  },

  async put(endpoint, body) {
    try {
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      }
      const resp = await fetch(CONFIG.API_BASE + endpoint, {
        method: 'PUT', headers: headers, body: JSON.stringify(body)
      });
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || errBody.detail || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] PUT ' + endpoint + ' failed:', err.message);
      return { error: err.message };
    }
  },

  async getRaw(endpoint) {
    try {
      var headers = {};
      if (CONFIG.AUTH_TOKEN) {
        headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      }
      const resp = await fetch(CONFIG.API_BASE + endpoint, { headers: headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.text();
    } catch (err) {
      console.warn('[API] raw ' + endpoint + ' failed:', err.message);
      return null;
    }
  },

  // ── Cairn API ──
  // SWAT-20260611-0007: canonical 9-domain taxonomy (single source of truth).
  // The board filter chips read this instead of a hard-coded label list, so a
  // migration of the stored `domain` field surfaces on the chips automatically.
  // Returns {domains:[{token,label}], count} or null on any failure (caller falls
  // back to the static abbreviation map -- zero-regression when the endpoint is
  // absent, e.g. before the build-9domain deploy lands).
  async canonicalDomains() {
    return this.get('/api/canonical-domains');
  },

  async cairnTrail() {
    // USE_FIELDS_CARD: request lean card-shape projection from server (~30-40% bytes reduction).
    // Card shape: counts nested under rfc.counts, drops author_id/created_at/updated_at/source_seed_id.
    // Renderer adapts via Cairn.normalizeTrail() which hoists counts.* to flat. Author/date chips
    // are guarded to not render when missing. Detail view + forum responses use separate endpoints
    // and are unaffected. Flip to false to revert.
    //
    // 2026-05-29 UXIA: flipped to false per OPERATOR directive (cards must show author).
    // The lean projection silently dropped author_id which OPERATOR uses to identify card
    // authorship at a glance. Proper fix is server-side: add author_id to the fields=card
    // allowlist in coordinator api.py without losing the wave_count optimization. Filed as
    // follow-up. Until then, full-shape request restores OPERATOR's visibility.
    var USE_FIELDS_CARD = false;
    var trailUrl = '/api/cairn/trail' + (USE_FIELDS_CARD ? '?fields=card' : '');
    // Try dedicated trail endpoint first (proper filtering, grouping by status)
    var data = await this.get(trailUrl);
    if (data && data.columns) return data;
    // Fallback: search-based approach with dedup + filtering
    data = await this.get('/api/cairn/search?query=SEED OR RFC&scope=seeds,rfcs&limit=500');
    if (!data || data.error) return data;
    var columns = { seed: [], ideation: [], rfc: [], in_round: [], ratified: [], shipped: [] };
    var seen = {};
    (data.results || []).forEach(function(item) {
      var id = item.id || '';
      if (!id || seen[id]) return;
      var status = (item.status || '').toLowerCase();
      // Skip non-active statuses and response entries
      if (!status || status === 'archived' || status === 'deferred' || status === 'superseded' || status === 'cancelled' || status === 'unknown') return;
      var title = item.title || '';
      if (/^Response R\d/.test(title)) return;
      if (columns[status]) {
        item.rfc_id = item.rfc_id || item.id;
        columns[status].push(item);
        seen[id] = true;
      }
    });
    return { columns: columns };
  },

  async cairnForum(rfcId) {
    return this.get('/api/cairn/rfc/' + encodeURIComponent(rfcId) + '/forum');
  },

  async cairnSignal(responseId, signal, comment) {
    return this.post('/api/cairn/signal', { response_id: responseId, signal: signal, comment: comment || null });
  },

  async cairnStar(targetType, targetId) {
    return this.post('/api/cairn/star', { target_type: targetType, target_id: targetId });
  },

  async cairnTransition(rfcId, state, reason) {
    return this.post('/api/cairn/transition', { rfc_id: rfcId, state: state, reason: reason || null });
  },

  async cairnSearch(query, scope) {
    var s = scope ? scope.join(',') : 'all';
    // Wrap query in double-quotes so backend FTS treats hyphens/special chars as literals
    var safeQuery = '"' + query.replace(/"/g, '') + '"';
    return this.get('/api/cairn/search?query=' + encodeURIComponent(safeQuery) + '&scope=' + encodeURIComponent(s) + '&limit=30');
  },

  // ── Cairn 3-Tier APIs ──
  async cairnScratchRead() {
    var data = await this.get('/api/cairn/scratch');
    if (!data) return data;
    // Normalize: API returns {results:[]} but renderers expect {entries:[]}
    if (data.results && !data.entries) {
      data.entries = data.results;
    }
    return data;
  },

  async cairnScratchDetail(scratchId) {
    return this.get('/api/cairn/scratch/' + encodeURIComponent(scratchId));
  },

  async cairnScratchEdit(scratchId, content) {
    return this.nodePut('/api/cairn/scratch/' + encodeURIComponent(scratchId), { content: content });
  },

  async cairnKbRead(tag) {
    var endpoint = '/api/cairn/kb?limit=500';
    if (tag) endpoint += '&tag=' + encodeURIComponent(tag);
    return this.get(endpoint);
  },

  async cairnKbDetail(slug) {
    return this.get('/api/cairn/kb/' + encodeURIComponent(slug));
  },  async cairnKbFlag(slug, reason) {
    // Flag is non-destructive -- uses standard Bearer auth, no node token needed
    try {
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      var resp = await fetch(CONFIG.API_BASE + '/api/cairn/kb/' + encodeURIComponent(slug) + '/flag', {
        method: 'POST', headers: headers, body: JSON.stringify({ reason: reason || null })
      });
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || errBody.detail || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] KB flag failed:', err.message);
      return { error: err.message };
    }
  },

  // -- Cairn OPERATOR API (requires X-Operator-Token) --
  async operatorPost(endpoint, body) {
    try {
      var token = localStorage.getItem('cairn_operator_token');
      if (!token) {
        token = prompt('Enter OPERATOR token for CAIRN:');
        if (!token) return { error: 'No token provided' };
        localStorage.setItem('cairn_operator_token', token);
      }
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json',
        'X-Operator-Token': token };
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      const resp = await fetch(CONFIG.API_BASE + endpoint, {
        method: 'POST', headers: headers, body: JSON.stringify(body)
      });
      if (resp.status === 401 || resp.status === 403) {
        localStorage.removeItem('cairn_operator_token');
        return { error: 'Invalid operator token -- cleared. Try again.' };
      }
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || errBody.detail || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] OPERATOR POST ' + endpoint + ' failed:', err.message);
      return { error: err.message };
    }
  },

  async operatorStar(targetType, targetId) {
    return this.operatorPost('/api/cairn/star', { target_type: targetType, target_id: targetId });
  },

  // -- Node-authenticated PUT (requires X-Node-Token) --
  async nodePut(endpoint, body) {
    try {
      var token = localStorage.getItem('cairn_node_token');
      if (!token) {
        token = prompt('Enter your node session token to edit:');
        if (!token) return { error: 'No token provided' };
        localStorage.setItem('cairn_node_token', token);
      }
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json',
        'X-Node-Token': token };
      if (CONFIG.AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + CONFIG.AUTH_TOKEN;
      const resp = await fetch(CONFIG.API_BASE + endpoint, {
        method: 'PUT', headers: headers, body: JSON.stringify(body)
      });
      if (resp.status === 401 || resp.status === 403) {
        localStorage.removeItem('cairn_node_token');
        return { error: 'Invalid node token -- cleared. Try again.' };
      }
      if (!resp.ok) {
        var errBody = await resp.json().catch(function() { return {}; });
        throw new Error(errBody.error || errBody.detail || 'HTTP ' + resp.status);
      }
      return await resp.json();
    } catch (err) {
      console.warn('[API] NODE PUT ' + endpoint + ' failed:', err.message);
      return { error: err.message };
    }
  },

  async cairnKbEdit(slug, content, editSummary, title) {
    var body = { content: content, edit_summary: editSummary || 'Edited via superdash' };
    if (title !== undefined && title !== null) body.title = title;
    return this.put('/api/cairn/kb/' + encodeURIComponent(slug), body);
  },

  async operatorSignal(responseId, signal, comment) {
    return this.operatorPost('/api/cairn/signal', { response_id: responseId, signal: signal, comment: comment || null });
  },

  async operatorRespond(rfcId, roundNum, body, stance) {
    return this.operatorPost('/api/cairn/rfc/' + encodeURIComponent(rfcId) + '/respond', { round_num: roundNum, body: body, stance: stance });
  },

  async operatorFrame(responseId, body) {
    return this.operatorPost('/api/cairn/frame', { response_id: responseId, body: body });
  },

  async operatorRatify(rfcId, reason) {
    return this.operatorPost('/api/cairn/rfc/' + encodeURIComponent(rfcId) + '/ratify', { reason: reason || null });
  },

  async opaRevoke(opaId) {
    return this.post('/api/opa/revoke', { opa_id: opaId });
  },

  async operatorGetComments(rfcId) {
    return this.get('/api/cairn/rfc/' + encodeURIComponent(rfcId) + '/notes');
  },

  async operatorPostComment(rfcId, content) {
    return this.operatorPost('/api/cairn/rfc/' + encodeURIComponent(rfcId) + '/notes', { body: content });
  },

  async operatorSearch(query) {
    return this.get('/api/cairn/search?query=' + encodeURIComponent(query) + '&limit=30');
  },

  async operatorCreateSeed(title, body, tags) {
    return this.operatorPost('/api/cairn/seed', { title: title || '', body: body, tags: tags || [] });
  }
};
