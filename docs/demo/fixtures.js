var CONFIG = {
  NODE_COLORS: { ATLAS: '#d9b66f', BIRCH: '#71a4dc', CEDAR: '#78b78e', DELTA: '#b49ed4', EMBER: '#d39373', FABLE: '#cc91b0' },
  HOSTS: { 'SAMPLE-COORD': ['ATLAS', 'BIRCH', 'FABLE'], 'SAMPLE-WORKER': ['CEDAR', 'DELTA', 'EMBER'] }
};

function createSampleState() {
  var now = Date.now();
  function ago(minutes) { return new Date(now - minutes * 60000).toISOString(); }
  var roles = ['architect', 'builder', 'builder', 'reviewer', 'project manager', 'analyst'];
  var nodes = Object.keys(CONFIG.NODE_COLORS).map(function(id, index) {
    return {
      node_id: id, role: roles[index], lifecycle_state: index === 4 ? 'offline' : 'running',
      last_seen: ago(index === 4 ? 20 : index === 1 ? 7 : 1),
      bootstrapped_at: ago(120 + index * 15), workload_score: index + 1,
      heartbeat_status: index === 4 ? 'overdue' : 'healthy'
    };
  });
  var specifications = [
    ['Capture task ownership atomically', 'ready', 'BIRCH', 1, 'design-001'],
    ['Surface a blocked dependency chain', 'ready', 'FABLE', 2, 'design-002'],
    ['Document authoritative data owners', 'ready', 'ATLAS', 2, 'design-001'],
    ['Invalidate a stale task-count cache', 'in_progress', 'CEDAR', 1, 'design-002'],
    ['Bind a review to an immutable revision', 'in_progress', 'BIRCH', 2, 'design-003'],
    ['Make unknown health visibly distinct', 'in_progress', 'FABLE', 3, 'design-002'],
    ['Check peer recusal before acceptance', 'review', 'DELTA', 1, 'design-003'],
    ['Verify a restored sample database', 'review', 'CEDAR', 2, 'design-004'],
    ['Wait for the sample schema contract', 'blocked', 'EMBER', 2, 'design-001']
  ];
  return {
    nodes: nodes,
    tasks: specifications.map(function(row, index) {
      return {
        task_id: 'sample-task-' + (index + 1), title: row[0], status: row[1],
        assigned_to: row[2], priority: row[3], design_id: row[4],
        updated_at: ago(index + 2), artifact_count: index % 3,
        review_acks: row[1] === 'review' ? ['ATLAS'] : [],
        description: 'Invented example illustrating the ' + row[0].toLowerCase() + ' workflow. It does not represent a real assignment or an operational result.'
      };
    }),
    swats: [
      { swat_id: 'sample-swat-1', title: 'Count a fixed-but-unclosed issue as active', stage: 'open', severity: 'high', created_by: 'FABLE', updated_at: ago(4) },
      { swat_id: 'sample-swat-2', title: 'Distinguish port-open from service-responsive', stage: 'in_review', severity: 'medium', created_by: 'CEDAR', current_reviewer: 'DELTA', updated_at: ago(8) },
      { swat_id: 'sample-swat-3', title: 'Keep expanded blocked-work details stable', stage: 'fixed', severity: 'low', created_by: 'BIRCH', updated_at: ago(12) }
    ],
    reviews: [
      { task_title: 'Check peer recusal before acceptance', cluster_id: 'sample-review-a', reviewer: 'DELTA', source: 'BIRCH', claim_age_s: 2400, deadline_countdown_s: -600 },
      { task_title: 'Verify a restored sample database', cluster_id: 'sample-review-b', reviewer: 'ATLAS', source: 'CEDAR', claim_age_s: 900, deadline_countdown_s: 1200 },
      { task_title: 'Bind a review to an immutable revision', cluster_id: 'sample-review-c', reviewer: 'FABLE', source: 'BIRCH', claim_age_s: 300, deadline_countdown_s: 5400 }
    ],
    designs: [
      { id: 'design-001', title: 'Single-winner work claims', stage: 'ratified', author: 'ATLAS', domain: 'coordination', summary: 'A losing claim must not consume work-in-progress or imply ownership.', body: 'Sample contract: an atomic claim returns either owned or lost. Messaging order is not the authority. A retry must preserve the original outcome.' },
      { id: 'design-002', title: 'Visible freshness and unknown state', stage: 'in_round', author: 'FABLE', domain: 'reliability', summary: 'Absence of an observation is not evidence of a healthy service.', body: 'Sample review question: distinguish unavailable, stale and verified observations. A rebuildable cache may retain last-known-good data only when the age is visible.' },
      { id: 'design-003', title: 'Artifact-bound independent review', stage: 'ratified', author: 'DELTA', domain: 'governance', summary: 'Acceptance follows evidence about one immutable revision.', body: 'Sample contract: review points to an artifact revision and names the reviewer. Authorship and recusal are checked separately from assertions of approval.' },
      { id: 'design-004', title: 'Restore before trusting a backup', stage: 'ideation', author: 'CEDAR', domain: 'reliability', summary: 'A backup exists; a recovery path still needs to be demonstrated.', body: 'Sample experiment: restore a disposable dataset, check consistency and document authority. No production recovery result is claimed by this example.' },
      { id: 'design-005', title: 'Separate an index from its source', stage: 'ideation', author: 'BIRCH', domain: 'coordination', summary: 'Search is a disposable projection, never the write-of-record.', body: 'Sample decision: an index can be rebuilt from durable knowledge revisions. Its failure must not invalidate the authoritative records.' }
    ],
    knowledge: [
      { title: 'Who owns each fact?', tag: 'coordination', body: 'Operational records own task lifecycle and claims. The knowledge store owns document revisions. A dashboard renders these facts; it does not own them.' },
      { title: 'Three health states, not one optimistic signal', tag: 'reliability', body: 'A closed listener is unavailable. An open listener with no identification banner is degraded. Only a verified response supports a healthy observation.' },
      { title: 'Completion requires evidence', tag: 'governance', body: 'In this design, work completion, independent review, delivery and authority are separate obligations. A cheap check-in cannot stand in for all of them.' },
      { title: 'Continuity is a contract', tag: 'coordination', body: 'A successor needs identity, durable context and the authoritative work claim. Process survival is not proof that context was preserved.' }
    ],
    activity: ['Sample state loaded. No coordinator or agent session exists.']
  };
}
