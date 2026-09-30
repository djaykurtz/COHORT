var Governance = {
  panels: [
    ['research', '1 / Research'], ['proposal', '2 / Proposal'],
    ['waves', '3 / Deliberation'], ['decision', '4 / Decision'], ['delivery', '5 / Work + delivery']
  ],
  render: function() {
    var state = sample.governance;
    var content = Components.setupPanel('Research / decisions / sample workflow', 'No backend or real votes');
    var previousSelection = content.querySelector('[data-research-panel].selected');
    var previousPanel = previousSelection ? previousSelection.dataset.researchPanel : null;
    var previousScroll = content.scrollTop;
    content.innerHTML = '<p class="view-note">Invented evidence, roles and decisions. This is an educational local adapter, not Spyglass FTS5, Cairn enforcement or a running team.</p>'
      + '<div class="research-steps" aria-label="Research and decision inspection">'
      + Governance.panels.map(function(panel) {
        return '<button class="demo-button' + (state.panel === panel[0] ? ' selected' : '') + '" data-research-panel="' + panel[0] + '" aria-pressed="' + (state.panel === panel[0]) + '">' + panel[1] + '</button>';
      }).join('') + '</div><div id="research-content"></div>'
      + '<p class="view-note"><a href="../systems/#rfc-governance">Inspect the system atlas and exact evidence</a>. Votes, ratification, independent artifact review and delivery are different boundaries.</p>';
    document.querySelectorAll('[data-research-panel]').forEach(function(button) {
      button.addEventListener('click', function() { state.panel = button.dataset.researchPanel; Governance.render(); });
    });
    var render = { research: Governance.research, proposal: Governance.proposal, waves: Governance.waves, decision: Governance.decision, delivery: Governance.delivery }[state.panel];
    if (!render) throw new Error('Unknown research inspection panel');
    render();
    content.scrollTop = previousPanel === state.panel ? previousScroll : 0;
  },
  research: function() {
    var state = sample.governance;
    var element = document.getElementById('research-content');
    element.innerHTML = '<h3>Spyglass retrieves. The source record owns.</h3>'
      + '<p>Search and tags help find relevant research. A result must be checked against its durable source before it becomes current guidance. This sample uses a plain text filter, not the backend relevance engine.</p>'
      + '<div class="research-controls"><label>Search invented records<input type="search" id="research-query" value="' + escaped(state.query) + '" placeholder="Try freshness"></label>'
      + '<label>Record kind<select id="research-kind"><option value="">All kinds</option>' + ['kb', 'scratch', 'rfc'].map(function(kind) { return '<option' + (state.kind === kind ? ' selected' : '') + '>' + kind + '</option>'; }).join('') + '</select></label></div>'
      + '<div id="research-results"></div><button class="demo-button" id="inspect-proposal">Follow the sample evidence into a proposal</button>';
    function results() {
      var records = state.research.filter(function(record) {
        return (!state.kind || record.kind === state.kind) && (record.title + ' ' + record.text + ' ' + record.tag).toLowerCase().includes(state.query.toLowerCase());
      });
      document.getElementById('research-results').innerHTML = records.map(function(record) {
        return '<article class="research-result"><p class="research-meta">' + escaped(record.kind.toUpperCase() + ' / ' + record.id) + '</p><h4>' + escaped(record.title) + '</h4><p>' + escaped(record.text) + '</p>'
          + '<button class="demo-button" data-research-record="' + record.id + '">Inspect durable sample source</button></article>';
      }).join('') || '<p role="status">No invented records match this filter.</p>';
      document.querySelectorAll('[data-research-record]').forEach(function(button) {
        button.addEventListener('click', function() {
          var record = state.research.find(function(item) { return item.id === button.dataset.researchRecord; });
          showDetail(record.title, '<p>' + escaped(record.text) + '</p><p><strong>Source:</strong> ' + escaped(record.owner) + '</p><p class="detail-note">This invented source illustrates retrieval/provenance. It is not a historical research record or an external search result.</p>');
        });
      });
    }
    document.getElementById('research-query').addEventListener('input', function(event) { state.query = event.target.value; results(); });
    document.getElementById('research-kind').addEventListener('change', function(event) { state.kind = event.target.value; results(); });
    document.getElementById('inspect-proposal').addEventListener('click', function() { state.panel = 'proposal'; Governance.render(); });
    results();
  },
  proposal: function() {
    var state = sample.governance;
    document.getElementById('research-content').innerHTML = '<h3>' + escaped(state.title) + '</h3>'
      + '<p>Use an RFC for a new cross-system contract, not every narrow fix. The four-section proposal and adoption plan connect a problem to something the team can actually use.</p>'
      + '<ol class="stage-rail">' + Cairn.STAGE_ORDER.map(function(stage) { return '<li' + (stage === Cairn.normalizeStage(state.status) ? ' class="current-stage"' : '') + '>' + stage + '</li>'; }).join('') + '</ol>'
      + '<dl class="proposal-sections">' + Object.entries(state.body).map(function(section) { return '<dt>' + escaped(section[0]) + '</dt><dd>' + escaped(section[1]) + '</dd>'; }).join('')
      + '<dt>SOLIDPLAN / adoption</dt><dd>' + escaped(state.solidplan) + '</dd></dl>'
      + '<p class="view-note">These are condensed explanatory excerpts, not a production submission passing the backend substance floors. The body and plan have separate sample revision labels: ' + escaped(state.bodyRevision + ' / ' + state.planRevision) + '.</p>';
  },
  waves: function() {
    var state = sample.governance;
    var latest = state.waves[state.waves.length - 1];
    var element = document.getElementById('research-content');
    element.innerHTML = '<h3>Waves preserve the argument.</h3><p>A wave is a deliberation round, not a delivery batch. Responses, reactions, votes and PM synthesis are separate records. Dissent is retained rather than rewritten into agreement.</p>'
      + '<p class="wave-display">Original Superdash wave badge: ' + Cairn.renderWaveBadge(state.waves.length) + '</p>'
      + state.waves.map(function(wave) {
        return '<details class="sample-wave"' + (!wave.closed ? ' open' : '') + '><summary>Wave ' + wave.number + ' / ' + (wave.closed ? 'closed + synthesized' : 'open sample round') + '</summary>'
          + wave.responses.map(function(response) { return '<p><strong>' + escaped(response.node + ' / ' + response.stance) + '</strong> ' + escaped(response.text) + '</p>'; }).join('')
          + '<p><strong>Synthesis:</strong> ' + escaped(wave.synthesis || 'Not recorded. An open round is not wave_quorum.') + '</p></details>';
      }).join('')
      + '<details class="council-note"><summary>Inspect independent perspectives and recusal</summary><p>The RFC vessel-host Council uses five context-stripped lenses. The author and prior vessels cannot host; the vessel captures verbatim output and must not add a stance.</p>'
      + '<p>Sample author: ' + state.author + '. Prior vessel: ' + state.priorVessel + '. Illustrative remaining candidates: '
      + sample.nodes.filter(function(node) { return node.node_id !== state.author && node.node_id !== state.priorVessel; }).map(function(node) { return node.node_id; }).join(', ')
      + '.</p><p>The response-level LSG council is a different coordinator worker with three annotation lenses. Independent work-review recusal is also lane-specific; this example does not invent a blanket author-vote ban.</p></details>'
      + (latest.closed ? '<p class="view-note">Latest sample synthesis is write-once. Reset starts a new invented example.</p>'
        : '<label class="dialog-field">Sample PM synthesis<textarea id="wave-synthesis" rows="3">Keep authoritative counts distinct from cached display age. Preserve an explicit unavailable state and the recorded dissent; validate the implementation separately.</textarea></label><button class="demo-button" id="close-sample-wave">Simulate PM closure with synthesis</button><p id="wave-outcome" role="status"></p>');
    if (!latest.closed) document.getElementById('close-sample-wave').addEventListener('click', function() {
      var synthesis = document.getElementById('wave-synthesis').value.trim();
      if (!synthesis) {
        document.getElementById('wave-outcome').textContent = 'Not closed: a non-empty synthesis is required. No sample state changed.';
        return;
      }
      latest.synthesis = synthesis;
      latest.closed = true;
      localActivity('Sample PM synthesis recorded. No backend wave was closed.');
      Governance.render();
    });
  },
  decision: function() {
    var state = sample.governance;
    var tally = { approve: 0, reject: 0, abstain: 0 };
    Object.values(state.votes).forEach(function(vote) { tally[vote]++; });
    document.getElementById('research-content').innerHTML = '<h3>A vote is evidence. It is not the gate.</h3>'
      + '<p>One vote per node per RFC records approve, reject or abstain. The reference has no numeric vote threshold for ratification. The latest closed, synthesized wave is one legal basis; authority and other checks remain backend responsibilities.</p>'
      + '<p class="vote-tally" id="sample-vote-tally">' + tally.approve + ' approve / ' + tally.reject + ' reject / ' + tally.abstain + ' abstain (invented audit evidence)</p>'
      + '<div class="research-controls"><label>Sample voter<select id="sample-voter">' + sample.nodes.map(function(node) { return '<option>' + node.node_id + '</option>'; }).join('')
      + '</select></label><label>Recorded verdict<select id="sample-vote"><option>approve</option><option>reject</option><option>abstain</option></select></label><button class="demo-button" id="record-sample-vote">Record local sample vote</button></div>'
      + '<button class="demo-button" id="ratify-sample">Inspect sample wave_quorum ratification</button>'
      + '<p id="decision-outcome" class="decision-outcome" role="status">' + escaped(state.outcome || 'No sample ratification illustrated yet.') + '</p>'
      + '<details class="legal-bases"><summary>Inspect all five documented legal bases</summary><ol>'
      + '<li><strong>wave_quorum:</strong> latest wave closed, with non-empty synthesis; not a head count.</li>'
      + '<li><strong>blanket_citation:</strong> blanket-authority citation in the header.</li>'
      + '<li><strong>opa_provenance_citation:</strong> cited OPA grant provenance.</li>'
      + '<li><strong>family_child_citation:</strong> a valid citation to a ratified parent, directive and legal basis.</li>'
      + '<li><strong>operator_authored_call:</strong> operator override by the OPERATOR actor.</li></ol>'
      + '<p>The non-override path also requires a non-empty body and attached SOLIDPLAN. Operator override records warnings for those body/plan checks. The local example models only wave_quorum, not server authentication, citations, body floors or full enforcement.</p></details>';
    document.getElementById('record-sample-vote').addEventListener('click', function() {
      var voter = document.getElementById('sample-voter').value;
      var vote = document.getElementById('sample-vote').value;
      if (!sample.nodes.some(function(node) { return node.node_id === voter; }) || !Object.hasOwn(tally, vote)) throw new Error('Invalid sample vote');
      state.votes[voter] = vote;
      localActivity('Recorded an invented ' + vote + ' vote for ' + voter + '; no ratification implied.');
      Governance.render();
    });
    document.getElementById('ratify-sample').addEventListener('click', function() {
      var latest = state.waves[state.waves.length - 1];
      if (!latest.closed || !latest.synthesis.trim()) {
        state.outcome = 'Not ratified in this sample: the latest wave is not closed with synthesis. Approve votes alone do not establish wave_quorum.';
      } else {
        state.status = 'ratified';
        state.outcome = 'Sample ratified via wave_quorum. The decision references ' + state.bodyRevision + ', ' + state.planRevision + ' and wave ' + latest.number + ' synthesis. Dissent and votes remain recorded. No actual permission, cryptographic binding or backend transition was created.';
        localActivity('Illustrated sample ratification; implementation review and shipping are still separate.');
      }
      var outcome = document.getElementById('decision-outcome');
      outcome.textContent = state.outcome;
      outcome.scrollIntoView({ block: 'nearest' });
    });
  },
  delivery: function() {
    document.getElementById('research-content').innerHTML = '<h3>A decision is not a delivered change.</h3>'
      + '<p>Ratification records a legitimate design. PM-routed tasks implement it; independent reviewers check the artifact and lineage. Completion belongs to the task or SWAT owner, and ship/delivery evidence is another boundary.</p>'
      + '<ol class="governance-delivery"><li>Route scoped build work under an accepted design, or use the narrow-fix lane where appropriate.</li><li>Check reviewer eligibility and the exact artifact revision. A vote on a proposal does not approve an implementation.</li><li>Record accepted closure, then verify the operator actually receives the delivered interface.</li><li>Keep the decision, research pointers and evidenced lessons available for later work or a successor.</li></ol>'
      + '<p class="view-note">No implementation is built, reviewed or shipped by this inspection surface. Larger model context does not itself grant authority or establish a reviewed revision.</p>';
  }
};
