// @ts-check
// Targeted regression test for the Task Board height-resizer bug fix.
// OPERATOR reported the resize handle between Task Board and the lower
// intel cards (Active RFCs / Failure Episodes / Tool Cost) was invisible/
// non-functional at the width they were using. Root cause was TWO layered
// bugs, both fixed here:
//   1. js/layout-resizer.js + the #taskboard-height-resizer element in
//      index.html were shipped with NO CSS for the handle at all (added in
//      css/overrides.css) -- invisible/non-functional at any width.
//   2. Below the 1400px breakpoint (css/responsive.css), main+intel become
//      adjacent CSS GRID ROWS, not side-by-side flex columns. The original
//      JS only ever changed #main-panel's own flex/height, which has zero
//      effect on grid row track sizing -- so even a fully-CSS'd handle would
//      drag with no visible effect at the exact width OPERATOR's screenshot
//      showed. Fixed via a JS-driven --taskboard-row-size CSS custom
//      property that the stacked-mode grid-template-rows now consumes.
const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8433/';

test.describe('superdash-v2 taskboard height-resizer bug fix', () => {

  test.describe('desktop mode (>1400px): main/intel are separate columns', () => {
    test.use({ viewport: { width: 1600, height: 900 } });

    test('@resizer-fix handle is visible, positioned, and has the expected CSS treatment', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });

      const handle = page.locator('#taskboard-height-resizer');
      await expect(handle).toBeVisible();

      const box = await handle.boundingBox();
      expect(box, 'handle must have a real, non-zero bounding box').not.toBeNull();
      expect(box.width, 'handle width should match #main-panel width').toBeGreaterThan(200);

      const cursor = await handle.evaluate((el) => getComputedStyle(el).cursor);
      expect(cursor).toBe('ns-resize');

      const position = await handle.evaluate((el) => getComputedStyle(el).position);
      expect(position, 'must be position:absolute for the JS-set left/top inline styles to take effect').toBe('absolute');
    });

    test('@resizer-fix dragging resizes #main-panel only -- .intel is a separate column, unaffected', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });

      const panelHeightBefore = await page.evaluate(() => document.getElementById('main-panel').getBoundingClientRect().height);
      const intelHeightBefore = await page.evaluate(() => document.querySelector('.intel').getBoundingClientRect().height);

      const handle = page.locator('#taskboard-height-resizer');
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 10 }); // drag up -> shrink
      await page.mouse.up();

      const panelHeightAfter = await page.evaluate(() => document.getElementById('main-panel').getBoundingClientRect().height);
      const intelHeightAfter = await page.evaluate(() => document.querySelector('.intel').getBoundingClientRect().height);

      expect(panelHeightAfter, 'dragging up should shrink #main-panel').toBeLessThan(panelHeightBefore);
      expect(intelHeightAfter, '.intel is a separate grid column at this width -- must be unaffected').toBe(intelHeightBefore);

      const stored = await page.evaluate(() => window.localStorage.getItem('superdash.taskboard-height'));
      expect(stored, 'height should persist to localStorage after drag release').not.toBeNull();
    });
  });

  test.describe('stacked mode (1001-1400px): main/intel are adjacent grid rows', () => {
    test.use({ viewport: { width: 1200, height: 900 } }); // matches OPERATOR's reported screenshot layout

    test('@resizer-fix handle is visible at the exact width OPERATOR reported the bug in', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });
      await expect(page.locator('#taskboard-height-resizer')).toBeVisible();
    });

    test('@resizer-fix dragging DOWN grows main + correspondingly shrinks .intel (the actual OPERATOR ask)', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });

      const mainBefore = await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().height);
      const intelBefore = await page.evaluate(() => document.querySelector('.intel').getBoundingClientRect().height);

      const handle = page.locator('#taskboard-height-resizer');
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 15 });
      await page.mouse.up();

      const mainAfter = await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().height);
      const intelAfter = await page.evaluate(() => document.querySelector('.intel').getBoundingClientRect().height);
      const rowSize = await page.evaluate(() => getComputedStyle(document.querySelector('.cockpit')).getPropertyValue('--taskboard-row-size'));

      expect(mainAfter, 'dragging down should grow .main (this is the OPERATOR-requested behavior)').toBeGreaterThan(mainBefore);
      expect(intelAfter, '.intel must correspondingly shrink -- it shares the fixed cockpit height with .main at this width').toBeLessThan(intelBefore);
      expect(rowSize.trim(), '--taskboard-row-size must be set to drive the grid row').not.toBe('');

      const stored = await page.evaluate(() => window.localStorage.getItem('superdash.taskboard-height'));
      expect(stored).not.toBeNull();
    });

    test('@resizer-fix keyboard ArrowDown also grows .main in stacked mode', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });

      const mainBefore = await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().height);
      const handle = page.locator('#taskboard-height-resizer');
      await handle.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);

      const mainAfter = await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().height);
      expect(mainAfter, 'ArrowDown should grow .main in stacked mode too').toBeGreaterThan(mainBefore);
    });

    test('@resizer-fix a saved height from stacked mode persists and reapplies on reload', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });
      await page.evaluate(() => window.localStorage.setItem('superdash.taskboard-height', '600'));
      await page.reload();
      await page.waitForSelector('#taskboard-height-resizer', { timeout: 5000 });

      const rowSize = await page.evaluate(() => getComputedStyle(document.querySelector('.cockpit')).getPropertyValue('--taskboard-row-size'));
      expect(rowSize.trim()).toBe('600px');
    });
  });

  test.describe('mobile width (<641px): handle intentionally hidden', () => {
    test.use({ viewport: { width: 500, height: 800 } });

    test('@resizer-fix handle is hidden at genuinely mobile widths', async ({ page }) => {
      await page.goto(URL);
      await page.waitForSelector('body', { timeout: 5000 });
      const handle = page.locator('#taskboard-height-resizer');
      await expect(handle).toBeHidden();
    });
  });
});

