const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = path.resolve(__dirname, '..', 'js');

class SampleDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2030-01-02T00:30:00Z']));
  }
  static now() { return Date.parse('2030-01-02T00:30:00Z'); }
}
function load(zone = 'UTC') {
  const context = vm.createContext({
    Date: SampleDate,
    window: { location: { hostname: '127.0.0.1' } },
  });
  for (const name of ['config.js', 'messages.js', 'messaging.js']) {
    vm.runInContext(fs.readFileSync(path.join(source, name), 'utf8'), context);
  }
  context.CONFIG.DISPLAY_TIME_ZONE = zone;
  return context;
}
test('message renderers default to configurable UTC', () => {
  const context = load();
  assert.equal(context.CONFIG.DISPLAY_TIME_ZONE, 'UTC');
  for (const module of [context.Messages, context.Messaging]) {
    assert.equal(module.formatTime('2030-01-02T00:15:00Z'), '12:15 AM');
    assert.equal(module.formatTime(''), '');
  }
});
test('both message clocks respect a non-geographic IANA offset zone', () => {
  const context = load('Etc/GMT+2');
  for (const module of [context.Messages, context.Messaging]) {
    assert.equal(module.formatTime('2030-01-02T00:15:00Z'), '10:15 PM');
  }
});
test('date grouping and clock formatting use the same configured zone', () => {
  const message = { created_at: '2030-01-01T23:45:00Z' };
  assert.deepEqual(Object.keys(load().Messaging.groupByDate([message])), ['Yesterday']);
  assert.deepEqual(Object.keys(load('Etc/GMT+2').Messaging.groupByDate([message])), ['Today']);
});
test('recovery poll label displays the configured zone, not a fixed abbreviation', () => {
  const recovery = fs.readFileSync(path.join(source, 'recovery.js'), 'utf8');
  const body = recovery.match(/function renderPoll\(\) \{[\s\S]+?\n  \}/);
  assert.ok(body, 'Recovery renderer must be available');
  for (const zone of ['UTC', 'Etc/GMT+2']) {
    const output = { innerHTML: '' };
    const context = load(zone);
    context.state = { lastPoll: new SampleDate('2030-01-02T00:15:00Z'), pollCount: 1 };
    context.document = { getElementById: () => output };
    vm.runInContext(body[0] + '\nrenderPoll();', context);
    assert.ok(output.innerHTML.endsWith(' ' + zone));
  }
});
