var App = { currentTab: 'taskboard' };
var sample = createSampleState();
var selectedDomain = '';
var requestedView = new URLSearchParams(window.location.search).get('view');
if (['review', 'design', 'knowledge', 'health'].includes(requestedView)) App.currentTab = requestedView;

function escaped(value) { return Components.esc(String(value)); }
function localActivity(message) {
  sample.activity.unshift(message);
  sample.activity = sample.activity.slice(0, 6);
  document.getElementById('activity-log').innerHTML = sample.activity.map(function(item) {
    return '<li>' + escaped(item) + '</li>';
  }).join('');
}
function closeDetail() { document.getElementById('detail-dialog').close(); }
function showDetail(title, html) {
  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-dialog').showModal();
}
function inspectTask(id) {
  var task = sample.tasks.find(function(item) { return item.task_id === id; });
  if (!task) throw new Error('Unknown sample task: ' + id);
  var design = sample.designs.find(function(item) { return item.id === task.design_id; });
  showDetail(task.title, '<p>' + escaped(task.description) + '</p>'
    + '<dl class="detail-facts"><dt>Sample ID</dt><dd>' + escaped(task.task_id) + '</dd><dt>Design record</dt><dd>' + escaped(design.title) + '</dd><dt>Evidence</dt><dd>' + task.artifact_count + ' invented artifact(s); no actual work product attached</dd></dl>'
    + '<label class="dialog-field">Simulated status<select id="sample-status">'
    + ['ready', 'in_progress', 'review', 'blocked', 'done'].map(function(status) {
      return '<option value="' + status + '"' + (status === task.status ? ' selected' : '') + '>' + status.replace('_', ' ') + '</option>';
    }).join('') + '</select></label>'
    + '<label class="dialog-field">Simulated owner<select id="sample-owner">'
    + sample.nodes.map(function(node) { return '<option' + (node.node_id === task.assigned_to ? ' selected' : '') + '>' + node.node_id + '</option>'; }).join('')
    + '</select></label><button id="apply-sample" class="demo-button">Apply local simulation</button>'
    + '<p class="detail-note">Memory only. No claim, authorization, review or dispatch is performed.</p>');
  document.getElementById('apply-sample').addEventListener('click', function() {
    task.status = document.getElementById('sample-status').value;
    task.assigned_to = document.getElementById('sample-owner').value;
    task.updated_at = new Date().toISOString();
    localActivity(task.task_id + ': simulated ' + task.status + ' / ' + task.assigned_to + '.');
    closeDetail();
    renderCurrent();
  });
}
function inspectNode(id) {
  var node = sample.nodes.find(function(item) { return item.node_id === id; });
  var tasks = sample.tasks.filter(function(task) { return task.assigned_to === id && task.status !== 'done'; });
  showDetail(id + ' / sample ' + node.role, '<p>This is an invented role profile, not a running agent or a session.</p>'
    + '<dl class="detail-facts"><dt>Role</dt><dd>' + escaped(node.role) + '</dd><dt>Illustrated state</dt><dd>' + escaped(node.lifecycle_state) + '</dd><dt>Active sample work</dt><dd>' + tasks.length + '</dd></dl>'
    + '<ul>' + tasks.map(function(task) { return '<li>' + escaped(task.title) + '</li>'; }).join('') + '</ul>');
}
function renderTasks() {
  var owner = document.getElementById('owner-filter').value;
  var priority = document.getElementById('priority-filter').value;
  var query = document.getElementById('task-search').value.toLowerCase();
  TaskBoard.data = { tasks: sample.tasks.filter(function(task) {
    return task.status !== 'done' && (!owner || task.assigned_to === owner)
      && (!priority || String(task.priority) === priority) && task.title.toLowerCase().includes(query);
  }) };
  TaskBoard.swats = sample.swats;
  TaskBoard.swatCounts = { open: 1, in_review: 1, fixed: 1 };
  TaskBoard.swatLoadError = null;
  TaskBoard.renderPanel();
  document.querySelectorAll('.kanban-card-id').forEach(function(label) {
    var card = label.closest('.kanban-card');
    if (label.textContent.indexOf('sample-task-') !== 0) return;
    var title = card.querySelector('.kanban-card-title');
    var button = document.createElement('button');
    button.className = 'card-detail-button';
    button.textContent = title.textContent;
    button.addEventListener('click', function() { inspectTask(label.textContent); });
    title.replaceChildren(button);
  });
}
function renderReview() {
  var content = Components.setupPanel('Review Pipeline / sample deadlines', sample.reviews.length + ' synthetic claims');
  content.innerHTML = '<p class="view-note">These countdowns are fixed examples of overdue, near-deadline and comfortable states. They are not ticking live claims.</p>' + ReviewPipeline._renderTable(sample.reviews);
}
function inspectDesign(id) {
  var design = sample.designs.find(function(item) { return item.id === id; });
  var tasks = sample.tasks.filter(function(task) { return task.design_id === id; });
  showDetail(design.title, '<p>' + escaped(design.body) + '</p><p><strong>Sample stage:</strong> ' + escaped(design.stage) + '</p>'
    + '<h3>Linked sample work</h3><ul>' + tasks.map(function(task) {
      return '<li>' + escaped(task.title) + ' / ' + escaped(task.status) + '</li>';
    }).join('') + '</ul><p class="detail-note">This illustrates design-to-work traceability, not a real ratification or acceptance record.</p>');
}
function domainFilters() {
  return '<div class="domain-filters" aria-label="Sample domain filters">' + ['', 'coordination', 'reliability', 'governance'].map(function(domain) {
    return '<button class="demo-button' + (selectedDomain === domain ? ' selected' : '') + '" data-domain="' + domain + '" aria-pressed="' + (selectedDomain === domain) + '">' + (domain || 'All domains') + '</button>';
  }).join('') + '</div>';
}
function wireDomainFilters() {
  document.querySelectorAll('[data-domain]').forEach(function(button) {
    button.addEventListener('click', function() { selectedDomain = button.dataset.domain; renderCurrent(); });
  });
}
function renderDesign() {
  var content = Components.setupPanel('Cairn / sample design records', 'Invented proposal lifecycle');
  content.innerHTML = domainFilters() + '<div class="design-grid">' + ['ideation', 'in_round', 'ratified'].map(function(stage) {
    var designs = sample.designs.filter(function(design) { return design.stage === stage && (!selectedDomain || design.domain === selectedDomain); });
    return '<section class="design-column"><h3>' + stage.replace('_', ' ') + ' <span>' + designs.length + '</span></h3>'
      + designs.map(function(design) {
        return '<button class="design-card" data-design="' + design.id + '"><strong>' + escaped(design.title) + '</strong><p>' + escaped(design.summary) + '</p><span>' + escaped(design.domain) + ' / ' + design.author + '</span></button>';
      }).join('') + '</section>';
  }).join('') + '</div>';
  wireDomainFilters();
  document.querySelectorAll('[data-design]').forEach(function(button) {
    button.addEventListener('click', function() { inspectDesign(button.dataset.design); });
  });
}
function renderKnowledge() {
  var content = Components.setupPanel('Knowledge / sample engineering notes', 'Synthetic summaries');
  content.innerHTML = domainFilters() + '<div class="knowledge-list">' + sample.knowledge.filter(function(article) {
    return !selectedDomain || article.tag === selectedDomain;
  }).map(function(article) {
    return '<details class="knowledge-article"><summary>' + escaped(article.title) + '<span>' + article.tag + '</span></summary><p>' + escaped(article.body) + '</p></details>';
  }).join('') + '</div>';
  wireDomainFilters();
}
function renderHealth() {
  var content = Components.setupPanel('Health states / contract illustration', 'No probe is run');
  content.innerHTML = '<p class="view-note">Choose an observation to see why port-open alone cannot establish liveness. This simulation never opens a socket.</p>'
    + '<div class="health-choices"><button class="demo-button" data-health="green">SSH banner observed</button><button class="demo-button" data-health="degraded">Port open, no banner</button><button class="demo-button" data-health="red">Listener unavailable</button></div>'
    + '<div id="health-observation" class="health-observation" aria-live="polite">Select a synthetic observation.</div>';
  var descriptions = {
    green: ['VERIFIED RESPONSE / SAMPLE GREEN', 'Connection succeeded and an SSH identification banner arrived. Both tiers support this observation.'],
    degraded: ['UNVERIFIED LIVENESS / SAMPLE DEGRADED', 'The port accepted a connection, but no identification banner arrived. Do not call this healthy.'],
    red: ['UNAVAILABLE / SAMPLE RED', 'The connection failed. Reachability and liveness are not established.']
  };
  document.querySelectorAll('[data-health]').forEach(function(button) {
    button.addEventListener('click', function() {
      var state = button.dataset.health;
      document.getElementById('health-observation').className = 'health-observation ' + state;
      document.getElementById('health-observation').innerHTML = '<h3>' + descriptions[state][0] + '</h3><p>' + descriptions[state][1] + '</p>';
      localActivity('Simulated health observation: ' + state + '. No connection attempted.');
    });
  });
}
function renderCurrent() {
  document.getElementById('task-filters').hidden = App.currentTab !== 'taskboard';
  document.querySelectorAll('[data-tab]').forEach(function(button) {
    var active = button.dataset.tab === App.currentTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.getElementById('stat-tasks').textContent = sample.tasks.filter(function(task) { return task.status !== 'done'; }).length;
  var render = { taskboard: renderTasks, review: renderReview, design: renderDesign, knowledge: renderKnowledge, health: renderHealth }[App.currentTab];
  if (!render) throw new Error('Unknown sample view: ' + App.currentTab);
  render();
}
TaskBoard._wireActions = function(content) {
  content.querySelectorAll('[data-task-id]').forEach(function(button) {
    button.textContent = button.dataset.action === 'assign' ? 'Local owner' : 'Local status';
    button.addEventListener('click', function() { inspectTask(button.dataset.taskId); });
  });
  content.querySelectorAll('[data-swat-id]').forEach(function(card) {
    card.removeAttribute('data-action');
    card.style.cursor = 'default';
  });
};
Nodes.selectNode = inspectNode;
document.querySelectorAll('[data-tab]').forEach(function(button) {
  button.addEventListener('click', function() { App.currentTab = button.dataset.tab; renderCurrent(); });
});
['owner-filter', 'priority-filter'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', renderCurrent);
});
document.getElementById('task-search').addEventListener('input', renderCurrent);
document.getElementById('close-dialog').addEventListener('click', closeDetail);
document.getElementById('reset-demo').addEventListener('click', function() {
  sample = createSampleState();
  selectedDomain = '';
  document.getElementById('owner-filter').value = '';
  document.getElementById('priority-filter').value = '';
  document.getElementById('task-search').value = '';
  TaskBoard._lastRenderSig = null;
  App.currentTab = 'taskboard';
  Nodes.renderNav(sample.nodes);
  localActivity('Reset sample. All local simulations discarded.');
  renderCurrent();
});
sample.nodes.forEach(function(node) {
  var option = document.createElement('option');
  option.value = node.node_id;
  option.textContent = node.node_id;
  document.getElementById('owner-filter').appendChild(option);
});
Nodes.renderNav(sample.nodes);
document.getElementById('design-summary').innerHTML = sample.designs.map(function(design) {
  return '<button class="summary-card" data-summary="' + design.id + '"><span>' + escaped(design.stage.replace('_', ' ')) + '</span><strong>' + escaped(design.title) + '</strong></button>';
}).join('');
document.querySelectorAll('[data-summary]').forEach(function(button) {
  button.addEventListener('click', function() { inspectDesign(button.dataset.summary); });
});
localActivity(sample.activity.shift());
renderCurrent();
