var Governance = {
  panels: [
    ['research', '1 / Research'], ['proposal', '2 / Proposal'],
    ['waves', '3 / Team input'], ['decision', '4 / Decision'], ['delivery', '5 / Work + delivery']
  ],
  render: function() {
    var state = sample.governance;
    var content = Components.setupPanel('Research / decisions / sample workflow', 'Sample data, no backend');
    var previousSelection = content.querySelector('[data-research-panel].selected');
    var previousPanel = previousSelection ? previousSelection.dataset.researchPanel : null;
    var previousScroll = content.scrollTop;
    content.innerHTML = '<p class="view-note">Invented evidence, roles and decisions. This is an educational local adapter, not Spyglass FTS5, Cairn enforcement or a running team.</p>'
      + '<div class="research-steps" aria-label="Research and decision inspection">'
      + Governance.panels.map(function(panel) {
        return '<button class="demo-button' + (state.panel === panel[0] ? ' selected' : '') + '" data-research-panel="' + panel[0] + '" aria-pressed="' + (state.panel === panel[0]) + '">' + panel[1] + '</button>';
      }).join('') + '</div><div id="research-content"></div>'
      + '<p class="view-note"><a href="../systems/#rfc-governance">Inspect the system atlas and exact evidence</a>. Team input, the design decision, code review and delivery are separate steps.</p>';
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
    element.innerHTML = '<h3>Each node weighs in from its own specialty.</h3><p>A wave is a round of input on the proposal. Each node responds from its role and the work it usually leads, and can react to what the others said. Objections stay on the record and shape the design. The PM closes the round with a written summary of where the team landed.</p>'
      + '<p class="wave-display">Original Superdash wave badge: ' + Cairn.renderWaveBadge(state.waves.length) + '</p>'
      + state.waves.map(function(wave) {
        return '<details class="sample-wave"' + (!wave.closed ? ' open' : '') + '><summary>Wave ' + wave.number + ' / ' + (wave.closed ? 'closed + synthesized' : 'open sample round') + '</summary>'
          + wave.responses.map(function(response) { return '<p><strong>' + escaped(response.node + ' / ' + response.stance) + '</strong> <span class="response-frame">' + escaped(response.frame) + '</span><br>' + escaped(response.text) + '</p>'; }).join('')
          + '<p><strong>Synthesis:</strong> ' + escaped(wave.synthesis || 'Not written yet. The round is still open.') + '</p></details>';
      }).join('')
      + '<details class="council-note"><summary>Inspect the fresh-eyes council</summary><p>For an outside view, a council looks at the proposal through five lenses with the background stripped away. The author and the nodes that hosted earlier councils don\'t host it. The host passes the lenses\' output along word for word and adds no opinion of its own.</p>'
      + '<p>Sample author: ' + state.author + '. Earlier host: ' + state.priorVessel + '. Nodes that could host: '
      + sample.nodes.filter(function(node) { return node.node_id !== state.author && node.node_id !== state.priorVessel; }).map(function(node) { return node.node_id; }).join(', ')
      + '.</p><p>A separate coordinator worker can also annotate individual responses through three lenses. Who may review finished code is decided per task, apart from the design discussion.</p></details>'
      + (latest.closed ? '<p class="view-note">Latest sample synthesis is write-once. Reset starts a new invented example.</p>'
        : '<label class="dialog-field">Sample PM synthesis<textarea id="wave-synthesis" rows="3">Keep authoritative counts distinct from cached display age. Show an explicit unavailable state, as CEDAR asked, and review the implementation separately.</textarea></label><button class="demo-button" id="close-sample-wave">Close the round with this synthesis</button><p id="wave-outcome" role="status"></p>');
    if (!latest.closed) document.getElementById('close-sample-wave').addEventListener('click', function() {
      var synthesis = document.getElementById('wave-synthesis').value.trim();
      if (!synthesis) {
        document.getElementById('wave-outcome').textContent = 'Not closed: the round needs a written synthesis. No sample state changed.';
        return;
      }
      latest.synthesis = synthesis;
      latest.closed = true;
      localActivity('Sample PM synthesis recorded. No real round was closed.');
      Governance.render();
    });
  },
  decision: function() {
    var state = sample.governance;
    document.getElementById('research-content').innerHTML = '<h3>Approved once there\'s enough input.</h3>'
      + '<p>There\'s no head count. The PM sums up each round, and that summary carries the most weight. The operator always has the final say, approving the design as ready to build once the comments and considerations cover enough ground. If most of the team argues against building something, that weighs heavily. Every response is kept word for word, so the summary can always be checked against what the team actually said.</p>'
      + '<button class="demo-button" id="ratify-sample">Approve the sample design as ready to build</button>'
      + '<p id="decision-outcome" class="decision-outcome" role="status">' + escaped(state.outcome || 'No sample decision made yet.') + '</p>'
      + '<details class="legal-bases"><summary>Other ways a design can move forward</summary><ol>'
      + '<li><strong>Team input:</strong> the latest round is closed with the PM\'s written summary, and the operator approves. This is the usual route.</li>'
      + '<li><strong>Standing approval:</strong> the proposal cites an approval the operator already gave for this kind of work.</li>'
      + '<li><strong>Policy grant:</strong> the proposal cites a permission in the operator\'s policy rules.</li>'
      + '<li><strong>Follow-on work:</strong> the proposal builds on a design that was already accepted.</li>'
      + '<li><strong>Operator call:</strong> the operator decides directly.</li></ol>'
      + '<p>Outside an operator call, a design also needs a written proposal and an adoption plan. This sample only walks through the team-input route.</p></details>';
    document.getElementById('ratify-sample').addEventListener('click', function() {
      var latest = state.waves[state.waves.length - 1];
      if (!latest.closed || !latest.synthesis.trim()) {
        state.outcome = 'Not ready yet: the latest round of team input still needs the PM\'s written summary.';
      } else {
        state.status = 'ratified';
        state.outcome = 'Approved as ready to build in this sample. The approval points to ' + state.bodyRevision + ', ' + state.planRevision + ' and the wave ' + latest.number + ' summary. Every response, including the objection, stays on the record. Nothing real was approved or changed.';
        localActivity('Sample design approved as ready to build; code review and delivery are still ahead.');
      }
      var outcome = document.getElementById('decision-outcome');
      outcome.textContent = state.outcome;
      outcome.scrollIntoView({ block: 'nearest' });
    });
  },
  delivery: function() {
    document.getElementById('research-content').innerHTML = '<h3>An accepted design still has to be built and delivered.</h3>'
      + '<p>The PM routes the build work. Independent reviewers check the actual code and where it came from. The task or SWAT owner closes the work, and delivery is checked on its own.</p>'
      + '<ol class="governance-delivery"><li>Route scoped build work under an accepted design, or use the narrow-fix lane where appropriate.</li><li>Check who may review and which exact revision they reviewed. Agreeing on a design doesn\'t approve the code that implements it.</li><li>Record accepted closure, then verify the operator actually receives the delivered interface.</li><li>Keep the decision, research pointers and evidenced lessons available for later work or a successor.</li></ol>'
      + '<p class="view-note">No implementation is built, reviewed or shipped by this inspection surface. Larger model context does not itself grant authority or establish a reviewed revision.</p>';
  }
};
