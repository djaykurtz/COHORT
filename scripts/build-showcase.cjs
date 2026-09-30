const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'cohort', 'zerobrain', 'superdash');
const target = path.join(root, 'docs', 'demo', 'ui');
const context = vm.createContext({ CONFIG: { NODE_COLORS: {} } });
for (const file of ['components.js', 'nodes.js', 'taskboard.js', 'review-pipeline.js']) {
  vm.runInContext(fs.readFileSync(path.join(source, 'js', file), 'utf8'), context, { timeout: 1000 });
}

const selections = {
  Components: ['esc', 'timeSince', 'formatDuration', 'nodeColor', 'nodeHost', 'statusBadge',
    'staleBadge', 'errorBanner', 'setupPanel', 'loading', 'empty'],
  Nodes: ['getColor', 'getHost', 'indicatorClass', 'timeSince', 'sessionAge', 'lifeSvcClass',
    'lifeSvcLabel', 'renderNav'],
  TaskBoard: ['COLUMNS', 'SWAT_COUNT_STAGES', 'SWAT_STAGE_ORDER', 'SWAT_SEVERITY_COLORS',
    'ENDPOINT', '_getSwats', '_getTasks', 'renderPanel', '_renderCard', '_renderSwatCard'],
  ReviewPipeline: ['_GRID', '_renderTable', '_renderRow'],
};
let javascript = '// Generated read-only renderers. Run node scripts\\build-showcase.cjs to refresh.\n';
for (const [name, keys] of Object.entries(selections)) {
  const module = vm.runInContext(name, context);
  const properties = keys.map(key => {
    const value = module[key];
    if (value === undefined) throw new Error(`Missing renderer ${name}.${key}`);
    let text = typeof value === 'function' ? value.toString() : JSON.stringify(value);
    if (typeof value === 'function' && !/^function\b/.test(text)) {
      text = text.replace(/^[A-Za-z_]\w*\(/, 'function(');
    }
    return `  ${JSON.stringify(key)}: ${text}`;
  });
  javascript += `var ${name} = {\n${properties.join(',\n')}\n};\n\n`;
}
if (/\b(fetch|XMLHttpRequest|EventSource|WebSocket|localStorage|sessionStorage|prompt)\s*[.(]/.test(javascript)) {
  throw new Error('Operational capability found in selected showcase renderers');
}
const outputs = new Map([['renderers.js', javascript]]);
for (const filename of ['base.css', 'components.css', 'cairn.css', 'responsive.css', 'overrides.css']) {
  const css = fs.readFileSync(path.join(source, 'css', filename), 'utf8')
    .replace(/^@import[^\n]*\n/gm, '');
  outputs.set(filename, css);
}
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(target, { recursive: true });
for (const [filename, content] of outputs) {
  const destination = path.join(target, filename);
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content) {
      throw new Error(`Stale generated showcase asset: ${filename}`);
    }
  } else {
    fs.writeFileSync(destination, content);
  }
}
console.log(`${check ? 'Verified' : 'Generated'} ${outputs.size} renderer/style assets; no operational clients included.`);
