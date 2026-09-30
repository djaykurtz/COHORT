const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'assets');
const evidence = process.env.SHOWCASE_EVIDENCE_DIR;
async function routeProjectPrefix(page) {
  await page.route('**/COHORT/**', async route => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/COHORT/, '');
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });
}

test('sample navigation, drilldowns, local state and network isolation', async ({ page }) => {
  const errors = [];
  const violations = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    window.testViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.testViolations.push(event.blockedURI));
  });
  await page.goto('/demo/');
  await expect(page.getByText('OFFLINE / SYNTHETIC', { exact: true })).toBeVisible();
  await expect(page.locator('.node-card')).toHaveCount(6);
  await expect(page.locator('.kanban-col')).toHaveCount(4);
  await expect(page.locator('.card-detail-button')).toHaveCount(8);
  await page.locator('#owner-filter').selectOption('BIRCH');
  await expect(page.locator('.card-detail-button')).toHaveCount(2);
  await page.locator('#owner-filter').selectOption('');
  await page.locator('#priority-filter').selectOption('1');
  await expect(page.locator('.card-detail-button')).toHaveCount(3);
  await page.locator('#priority-filter').selectOption('');
  await page.locator('#task-search').fill('ownership');
  await expect(page.locator('.card-detail-button')).toHaveCount(1);
  await page.locator('#task-search').fill('');
  await page.getByRole('button', { name: 'Capture task ownership atomically', exact: true }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.locator('#sample-status').selectOption('in_progress');
  await page.locator('#sample-owner').selectOption('CEDAR');
  await page.getByRole('button', { name: 'Apply local simulation' }).click();
  await expect(page.locator('.col-in_progress')).toContainText('Capture task ownership atomically');
  await expect(page.locator('#activity-log')).toContainText('simulated in_progress / CEDAR');
  await page.locator('.node-card[data-node="ATLAS"]').click();
  await expect(page.locator('#detail-title')).toContainText('sample architect');
  await page.getByRole('button', { name: 'Close detail' }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.locator('#main-content')).toContainText('10m overdue');
  await page.getByRole('tab', { name: 'Cairn / Design' }).click();
  await expect(page.locator('.design-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'reliability', exact: true }).click();
  await expect(page.locator('.design-card')).toHaveCount(2);
  await page.locator('[data-design="design-002"]').click();
  await expect(page.locator('#detail-body')).toContainText('Linked sample work');
  await page.getByRole('button', { name: 'Close detail' }).click();
  await page.getByRole('tab', { name: 'Knowledge', exact: true }).click();
  await expect(page.locator('.knowledge-article')).toHaveCount(1);
  await page.locator('.knowledge-article summary').click();
  await expect(page.locator('.knowledge-article[open]')).toContainText('degraded');
  await page.getByRole('tab', { name: 'Health states' }).click();
  for (const [label, state] of [['SSH banner observed', 'green'], ['Port open, no banner', 'degraded'], ['Listener unavailable', 'red']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#health-observation')).toHaveClass('health-observation ' + state);
  }
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await expect(page.locator('.col-ready')).toContainText('Capture task ownership atomically');
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage), session: Object.keys(sessionStorage)
  }))).toEqual({ local: [], session: [] });
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
  expect(await page.evaluate(() => indexedDB.databases().then(items => items.length))).toBe(0);
  expect(await page.context().cookies()).toEqual([]);
  violations.push(...await page.evaluate(() => window.testViolations));
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:8497/') && !url.includes('/api/'))).toBe(true);
});

test('project-prefix routing, movement disclosure, mobile layout and screenshots', async ({ page }) => {
  await routeProjectPrefix(page);
  await page.goto('/COHORT/');
  await page.locator('[data-movement="review"]').click();
  await expect(page.locator('[data-panel="review"]')).toBeVisible();
  await expect(page.locator('[data-panel="ownership"]')).toBeHidden();
  await page.locator('[data-panel="review"] summary').click();
  await expect(page.locator('[data-panel="review"] details[open]')).toBeVisible();
  await page.getByRole('link', { name: 'Explore ZeroBrain' }).click();
  await expect(page).toHaveURL(/\/COHORT\/demo\/$/);
  await expect(page.locator('.kanban-col')).toHaveCount(4);
  fs.mkdirSync(assets, { recursive: true });
  await page.screenshot({ path: path.join(assets, 'dashboard-tasks.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: path.join(assets, 'dashboard-review.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: 'Cairn / Design' }).click();
  await expect(page.getByRole('tab', { name: 'Cairn / Design' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: path.join(assets, 'dashboard-design.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('OFFLINE / SYNTHETIC', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Capture task ownership atomically', exact: true }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close detail' }).click();
  await page.goto('/demo/?view=health');
  await expect(page.locator('#main-panel-title')).toContainText('Health states');
  await page.goto('/demo/?view=review');
  await expect(page.locator('#main-panel-title')).toContainText('Review Pipeline');
});

test('research, waves, votes and legal-basis illustration stay synthetic and disconnected', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demo/?view=governance');
  await expect(page.locator('#research-content')).toContainText('not the backend relevance engine');
  await page.locator('#research-query').fill('freshness');
  await expect(page.locator('.research-result')).toHaveCount(2);
  await page.locator('#research-kind').selectOption('kb');
  await expect(page.locator('.research-result')).toHaveCount(1);
  await page.locator('[data-research-record="SAMPLE-KB-1"]').click();
  await expect(page.locator('#detail-body')).toContainText('Invented Cairn knowledge record');
  await page.getByRole('button', { name: 'Close detail' }).click();
  await page.locator('#inspect-proposal').click();
  await expect(page.locator('.stage-rail li')).toHaveText(['seed', 'ideation', 'in_round', 'ratified', 'shipped']);
  await expect(page.locator('#research-content')).toContainText('not a production submission');
  await page.locator('[data-research-panel="decision"]').click();
  for (const voter of ['ATLAS', 'BIRCH', 'CEDAR', 'DELTA', 'EMBER', 'FABLE']) {
    await page.locator('#sample-voter').selectOption(voter);
    await page.locator('#sample-vote').selectOption('approve');
    await page.locator('#record-sample-vote').click();
  }
  await expect(page.locator('#sample-vote-tally')).toContainText('6 approve / 0 reject / 0 abstain');
  await page.locator('#ratify-sample').click();
  await expect(page.locator('#decision-outcome')).toContainText('Not ratified');
  await expect(page.locator('#decision-outcome')).toContainText('Approve votes alone');
  await page.locator('[data-research-panel="waves"]').click();
  await page.locator('#wave-synthesis').fill('');
  await page.locator('#close-sample-wave').click();
  await expect(page.locator('#wave-outcome')).toContainText('non-empty synthesis is required');
  await page.locator('#wave-synthesis').fill('Synthetic synthesis: keep authoritative state and snapshot freshness distinct; retain the sample dissent.');
  await page.locator('#close-sample-wave').click();
  await expect(page.locator('.sample-wave summary').last()).toContainText('closed + synthesized');
  await page.locator('.council-note summary').click();
  await expect(page.locator('.council-note')).toContainText('author and prior vessels cannot host');
  await expect(page.locator('.council-note')).toContainText('different coordinator worker');
  await page.locator('[data-research-panel="decision"]').click();
  await page.locator('#ratify-sample').click();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('#decision-outcome')).toContainText('Sample ratified via wave_quorum');
  await expect(page.locator('#decision-outcome')).toContainText('Dissent and votes remain recorded');
  await page.locator('.legal-bases summary').click();
  await expect(page.locator('.legal-bases li')).toHaveCount(5);
  await page.locator('[data-research-panel="delivery"]').click();
  await expect(page.locator('#research-content')).toContainText('A vote on a proposal does not approve an implementation');
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await page.getByRole('tab', { name: 'Research / Decisions', exact: true }).click();
  expect(await page.evaluate(() => sample.governance.status)).toBe('in_round');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-research-panel="decision"]').click();
  await page.locator('#ratify-sample').click();
  await page.locator('#main-content').evaluate(element => { element.scrollTop = 0; });
  fs.mkdirSync(assets, { recursive: true });
  await page.screenshot({ path: path.join(assets, 'dashboard-governance.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:8497/') && !url.includes('/api/'))).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length)).toBe(0);
  expect(await page.evaluate(() => indexedDB.databases().then(items => items.length))).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
});

test('system atlas exposes source-grounded aliases, filters, relationship inspection and keyboard controls', async ({ page }) => {
  await routeProjectPrefix(page);
  await page.goto('/COHORT/systems/');
  await expect(page.locator('.system-card')).toHaveCount(37);
  await expect(page.getByText('A task count looks current. It is not.', { exact: true })).toBeVisible();
  await page.locator('#system-query').fill('Spyglass');
  await expect(page.locator('#spyglass')).toBeVisible();
  await page.locator('#spyglass summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#spyglass details')).toHaveAttribute('open', '');
  await expect(page.locator('#spyglass')).toContainText('Derived index only');
  await page.locator('#spyglass .related a[href="#cairn"]').click();
  await expect(page.locator('#cairn details')).toHaveAttribute('open', '');
  await expect(page.locator('.system-card:visible')).toHaveCount(37);
  await page.locator('#system-availability').selectOption('included');
  await expect(page.locator('.system-card:visible')).toHaveCount(4);
  await page.locator('#clear-filters').click();
  await page.locator('#system-query').fill('no-such-component');
  await expect(page.locator('#system-count')).toContainText('0 of 37');
  await page.locator('#clear-filters').click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('atlas remains an inspectable textual reference without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8497/systems/');
  await expect(page.locator('.system-card')).toHaveCount(37);
  await expect(page.locator('.atlas-controls')).toBeHidden();
  await page.locator('#rfc-governance summary').click();
  await expect(page.locator('#rfc-governance details')).toHaveAttribute('open', '');
  await expect(page.locator('#rfc-governance')).toContainText('not a numeric ratification threshold');
  await page.locator('.text-map summary').click();
  await expect(page.locator('.text-map')).toContainText('Cairn owns the source revisions');
  await context.close();
});

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900]]) {
  test(`laptop ${width}x${height}: actual rendered text, transforms, contrast and reflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const measurements = [];
    async function measure(selector, minimum, requireLineHeight = false) {
      const result = await page.locator(selector).evaluateAll((elements, input) => {
        function rgba(value) {
          const parts = value.match(/[\d.]+/g).map(Number);
          return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
        }
        function luminance(color) {
          const linear = color.slice(0, 3).map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
        }
        return elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => {
          const style = getComputedStyle(element);
          let scale = 1;
          let background = [22, 22, 27, 1];
          const ancestors = [];
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
          for (const ancestor of ancestors) {
            const computed = getComputedStyle(ancestor);
            if (!(element instanceof SVGElement) && computed.transform !== 'none') {
              const matrix = new DOMMatrixReadOnly(computed.transform);
              scale *= Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
            }
            if (!(element instanceof SVGElement)) scale *= Number.parseFloat(computed.zoom) || 1;
            const color = rgba(computed.backgroundColor);
            background = color.slice(0, 3).map((channel, index) => color[3] * channel + (1 - color[3]) * background[index]).concat(1);
          }
          if (element instanceof SVGElement) {
            const matrix = element.getScreenCTM();
            scale = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
          }
          const foreground = rgba(element instanceof SVGElement ? style.fill : style.color);
          const contrast = (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
          const canvas = document.createElement('canvas').getContext('2d');
          canvas.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
          const characters = element.getBoundingClientRect().width / canvas.measureText('0').width;
          return { text: element.textContent.trim().slice(0, 70), pixels: Number.parseFloat(style.fontSize) * scale, scale, lineRatio: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize), contrast, characters, minimum: input.minimum };
        });
      }, { minimum });
      expect(result.length, selector).toBeGreaterThan(0);
      for (const item of result) {
        expect(item.pixels, item.text).toBeGreaterThanOrEqual(minimum - .01);
        expect(item.scale, item.text + ' whole-page scaling').toBeGreaterThanOrEqual(1);
        expect(item.contrast, item.text + ' contrast').toBeGreaterThanOrEqual(4.5);
        if (requireLineHeight) {
          expect(item.lineRatio, item.text).toBeGreaterThanOrEqual(1.5);
          expect(item.characters, item.text + ' line length').toBeLessThanOrEqual(80);
        }
      }
      measurements.push({ selector, result });
    }
    await page.goto('/');
    await measure('.lede, .boundary, .origin-story p, [data-panel="research"] > p, .scope p', 18, true);
    await measure('.actions a, .movement-nav button, [data-panel="research"] summary, [data-panel="research"] .movement-links a', 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `root-${width}x${height}.png`), animations: 'disabled' });
    }
    await page.goto('/systems/#rfc-governance');
    await measure('.atlas-opening p, .story-steps li, #rfc-governance p, #rfc-governance dd', 18, true);
    await measure('.atlas-controls input, .atlas-controls select, .atlas-controls button, .system-heading, .connection-legend li', 16);
    await measure('.diagram-scroll svg text', 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (evidence) {
      await page.screenshot({ path: path.join(evidence, `atlas-${width}x${height}.png`), animations: 'disabled' });
      await page.locator('.overall').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, `map-${width}x${height}.png`), animations: 'disabled' });
    }
    await page.goto('/demo/?view=governance');
    await measure('.view-note, #research-content > p, .research-result p:not(.research-meta), .boundary, .demo-hint', 18, true);
    await measure('.sample-label, .main-tabs .tab, .research-steps button, .research-controls label, .research-controls input, .research-controls select, .demo-button, .status-bar', 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const usable = await page.locator('#main-panel').boundingBox();
    expect(usable.height).toBeGreaterThanOrEqual(200);
    measurements.push({ usablePanel: usable, viewport: { width, height } });
    await page.locator('[data-research-panel="decision"]').click();
    await measure('#research-content > p, .legal-bases p', 18, true);
    await measure('#record-sample-vote, #ratify-sample, .legal-bases summary', 16);
    await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
    await measure('.kanban-col-title, .card-detail-button, .kanban-action-btn, .demo-filters label, .demo-filters input, .demo-filters select', 16);
    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await measure('.view-note', 18, true);
    await measure('.sample-review-table span', 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('tab', { name: 'Research / Decisions', exact: true }).click();
    if (evidence) {
      await page.screenshot({ path: path.join(evidence, `demo-${width}x${height}.png`), animations: 'disabled' });
      fs.writeFileSync(path.join(evidence, `readability-${width}x${height}.json`), JSON.stringify(measurements, null, 2));
    }
  });
}
