const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'assets');

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
  await page.route('**/COHORT/**', async route => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/COHORT/, '');
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });
  await page.goto('/COHORT/');
  await page.getByRole('button', { name: '02 Review has an artifact' }).click();
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
