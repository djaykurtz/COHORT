const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'docs', 'systems');
const catalog = JSON.parse(fs.readFileSync(path.join(folder, 'catalog.json'), 'utf8'));
const ids = new Set(catalog.map(item => item.id));
if (ids.size !== catalog.length) throw new Error('Duplicate atlas system ID');
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const labels = { included: 'Included reference code', documented: 'Documented / runtime external', historical: 'Historical / not active' };
const publicSource = 'https://github.com/djaykurtz/COHORT/blob/main/';
function sourceLink(value) {
  if (!fs.existsSync(path.join(root, ...value.split('#')[0].split('/')))) throw new Error(`Missing atlas evidence ${value}`);
  return `<a href="${publicSource + escape(value)}">${escape(value)}</a>`;
}
const cards = catalog.map(item => {
  for (const field of ['name', 'aliases', 'group', 'availability', 'purpose', 'inputs', 'outputs', 'owner', 'boundary', 'runtime']) {
    if (!item[field]) throw new Error(`Missing ${item.id}.${field}`);
  }
  if (!labels[item.availability]) throw new Error(`Unknown availability: ${item.availability}`);
  for (const id of item.relations) if (!ids.has(id)) throw new Error(`Unknown relationship: ${id}`);
  return `<article id="${item.id}" class="system-card" data-group="${escape(item.group)}" data-availability="${item.availability}">
<details><summary><span class="system-heading">${escape(item.name)}</span><span class="availability ${item.availability}">${labels[item.availability]}</span></summary>
<p class="aliases">${escape(item.aliases)}</p><p class="system-purpose">${escape(item.purpose)}</p>
<dl><dt>Inputs</dt><dd>${escape(item.inputs)}</dd><dt>Outputs</dt><dd>${escape(item.outputs)}</dd><dt>Source of truth / authority</dt><dd>${escape(item.owner)}</dd><dt>Runtime boundary</dt><dd>${escape(item.runtime)}</dd></dl>
<h3>Failure prevented / review boundary</h3><p>${escape(item.boundary)}</p>
<h3>Connected boundaries</h3><p class="related">${item.relations.map(id => `<a href="#${id}">${escape(catalog.find(entry => entry.id === id).name)}</a>`).join('')}</p>
<h3>Exact exported evidence</h3><ul class="evidence">${item.evidence.map(value => `<li>${sourceLink(value)}</li>`).join('')}</ul>
</details></article>`;
}).join('\n');
const groups = [...new Set(catalog.map(item => item.group))];
const map = fs.readFileSync(path.join(folder, 'map.svg'), 'utf8');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="description" content="COHORT system atlas: source-grounded roles, research, decisions, work, continuity, health and delivery with honest code/runtime boundaries.">
<title>COHORT system atlas / David Kurtz</title><link rel="stylesheet" href="../showcase.css"><link rel="stylesheet" href="atlas.css"><script src="atlas.js" defer></script></head>
<body><header class="masthead"><a class="wordmark" href="../">COHORT</a><span>SYSTEM ATLAS / DAVID KURTZ</span><a href="../demo/?view=governance">Sample research workflow</a></header>
<main>
<section class="atlas-opening"><p class="eyebrow">WHY THE PARTS EXIST</p><h1>A team needs shared context.<br>It still needs clear boundaries.</h1>
<p class="lede">David built COHORT to organize his own projects and tasks as a team of engineering roles with deliberately different perspectives. Research and recorded decisions helped that team develop and build ideas together.</p>
<p>These controls are not paperwork for its own sake. They prevent duplicate work, approval of the wrong revision, lost rationale after a handoff, and an unknown result being reported as done. More context helps a successor understand a decision; it cannot establish permission, ownership or which artifact was reviewed.</p>
<p class="boundary">This is a source-linked architecture atlas, not a running fleet. The dashboard reference code is included; most services below are documented contracts with externally required runtimes. The public demo is offline and entirely synthetic.</p></section>
<section class="story" aria-labelledby="story-title"><p class="eyebrow">ONE INVENTED EXAMPLE / NO HISTORICAL WORK DATA</p><h2 id="story-title">A task count looks current. It is not.</h2>
<ol class="story-steps">
<li><strong>Observe the failure.</strong> An analyst notices that a sample task counter misses a newly changed item. Spyglass helps locate relevant research; the team checks the durable Cairn source instead of treating a search snippet as authority.</li>
<li><strong>Choose the right lane.</strong> A narrow defect may be a SWAT. Existing approved build work may be a task. A new cross-system freshness contract belongs in an RFC. Not every task needs a new proposal.</li>
<li><strong>Keep the different perspectives.</strong> The architect asks who owns the count; the PM asks how adoption fits the work; builders ask how to implement it; reviewers ask which revision was checked; the analyst asks whether the operator can see uncertainty.</li>
<li><strong>Decide, then implement.</strong> In the RFC path, responses, dissent and votes are recorded; a deliberation wave is synthesized and an authorized legal basis supports ratification. Routed work and independent artifact review remain separate obligations.</li>
<li><strong>Deliver and carry the rationale forward.</strong> Completion must reach the owning record and the operator's view. A successor can retrieve the saved decision, handoff and evidenced lessons rather than reconstructing the reason from a larger chat context.</li></ol>
<p class="view-boundary">Reusable conventions can grow from preserved research and decision history. This does not claim model training, sentience, measured future intuition, or that every change must pass through the same process.</p>
<div class="actions"><a class="primary-link" href="../demo/?view=governance">Inspect the synthetic research-to-decision flow</a>${sourceLink('cohort/docs/systems/work-routing-and-evidence.md')}</div></section>
<section class="overall" aria-labelledby="map-heading"><p class="eyebrow">OVERALL HANDOFF MAP</p><h2 id="map-heading">Who carries a fact, and who owns it?</h2>
<p>Boxes group related boundaries for readability; they are not a claim that each box is a separate deployed service. Supporting components are browsable below.</p>
<div class="diagram-scroll" tabindex="0" aria-label="Architecture diagram; scroll horizontally on small screens">${map}</div>
<ul class="connection-legend"><li class="network">Network / API observations</li><li class="storage">Stored / retrieved context</li><li class="control">Control / authority</li><li class="orchestration">Execution / orchestration</li><li class="work">Work handoff</li></ul>
<p class="view-boundary">Dashed box: documented external runtime. Double outline: included reference UI. Hue identifies the connection kind, not whether a service is running.</p>
<details class="text-map"><summary>Read the same map as text</summary><ul>
<li>Operator intent and OPA constrain coordinator actions.</li><li>Research/search retrieves context; Cairn owns the source revisions and decisions.</li><li>RFC deliberation can authorize a new design; tasks and SWATs own their separate implementation/fix paths.</li><li>Agent identity, memory and handoff support execution without completing work.</li><li>Independent review binds to the artifact; accepted closure and delivery are separate from a message or vote.</li><li>Superdash consumes APIs and event projections, displaying facts without becoming their owner.</li></ul></details></section>
<section class="catalog-section" aria-labelledby="catalog-title"><p class="eyebrow">BROWSE THE SYSTEMS AND BOUNDARIES</p><h2 id="catalog-title">${catalog.length} connected entries. Not ${catalog.length} bundled services.</h2>
<p>The inventory follows the exported system catalog, architecture/rebuild guides and included frontend. Aliases are reconciled here: ZeroBrain is the integration umbrella, Superdash its operator UI; Spyglass is not Cairn; the two councils and the two search indexes are distinct.</p>
<div class="atlas-controls enhanced-only"><label>Find a system<input id="system-query" type="search" placeholder="Purpose, name, input or failure"></label><label>Area<select id="system-group"><option value="">All areas</option>${groups.map(group => `<option>${escape(group)}</option>`).join('')}</select></label><label>Availability<select id="system-availability"><option value="">All boundaries</option>${Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><button id="clear-filters" type="button">Clear filters</button></div>
<p id="system-count" aria-live="polite">${catalog.length} entries; open a system to inspect its purpose, authority, relationships and exact evidence.</p>
<noscript><p>All entries are available below without JavaScript. Use the native disclosure controls or your browser's Find command.</p></noscript>
<div id="system-catalog">${cards}</div></section>
<section class="scope"><h2>What this map does not establish.</h2><p>The exported guides describe reference implementations, design intent and explicit unresolved questions. They do not establish a current connected deployment, complete backend coverage or active use of every historical capability.</p><p>Role/persona documents preserve authored perspectives; typed memory, handoff, lessons and retrievable decisions preserve context. None replaces authority, reviewed revision or accepted completion.</p>
<p>${sourceLink('cohort/docs/system-catalog.md')} ${sourceLink('cohort/docs/architecture/data-ownership.md')}</p></section>
</main><footer class="page-footer"><a href="../">Project story</a><a href="../demo/?view=governance">Offline sample workflow</a><a href="https://github.com/djaykurtz/COHORT">Source and design record</a></footer></body></html>
`;
const destination = path.join(folder, 'index.html');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== html) throw new Error('Atlas output is stale');
} else {
  fs.writeFileSync(destination, html);
}
console.log(`Verified ${catalog.length} source-grounded atlas entries and their local evidence paths.`);
