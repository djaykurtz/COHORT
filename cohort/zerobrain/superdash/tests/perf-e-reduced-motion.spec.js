// @ts-check
// Targeted regression test for SWAT-superdash-perf-E: fleet-wide
// prefers-reduced-motion support added to base.css. Verifies (a) zero
// change to default animation behavior, and (b) correct engagement when
// the OS-level reduced-motion preference is emulated.
const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8433/';

test.describe('superdash-v2 perf-E reduced-motion regression', () => {
  test('@perf-e default (no reduced-motion): animations run normally, no visual regression', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');

    // Confirm the header (a representative backdrop-filter glass element)
    // still renders with its intended blur -- proves the new media query
    // block does not accidentally affect the non-reduced-motion default case.
    const headerBlur = await page.evaluate(() => {
      var el = document.querySelector('.header');
      return el ? getComputedStyle(el).backdropFilter : null;
    });
    expect(headerBlur, 'header backdrop-filter must be unaffected by default').toContain('blur');

    // Confirm animation-duration for a representative infinite animation
    // (drift, on .ambient::before) is NOT collapsed by default.
    const driftDuration = await page.evaluate(() => {
      var el = document.querySelector('.ambient');
      if (!el) return null;
      var style = getComputedStyle(el, '::before');
      return style.animationDuration;
    });
    // Only assert if the ambient element exists on this page (defensive --
    // element presence isn't the point of this test, duration value is).
    if (driftDuration) {
      expect(driftDuration, 'drift animation duration must be unaffected by default (not collapsed to 0.01ms)')
        .not.toBe('0.01ms');
    }

    expect(errors, `pageerror(s) on default load: ${errors.join(' | ')}`).toEqual([]);
  });

  test('@perf-e prefers-reduced-motion: reduce collapses animation/transition durations fleet-wide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');

    // Representative check: any element with an animation should now report
    // the collapsed duration. Header itself has no animation, so check a
    // known animated selector instead -- the notification bell's badge or
    // any status dot. Use a generic approach: inject a throwaway element
    // with an animation and confirm the media-query override applies to it
    // too (proves the universal *, *::before, *::after rule is in effect,
    // not just a hand-picked selector).
    const collapsedDuration = await page.evaluate(() => {
      var probe = document.createElement('div');
      probe.style.animation = 'spin 2s linear infinite';
      document.body.appendChild(probe);
      var duration = getComputedStyle(probe).animationDuration;
      probe.remove();
      // getComputedStyle serializes small values in scientific notation
      // (e.g. "1e-05s") rather than "0.01ms" -- parse to a number instead
      // of string-matching a specific serialization format.
      return parseFloat(duration);
    });
    expect(collapsedDuration, 'reduced-motion should collapse any animation duration to ~0').toBeLessThan(0.001);

    expect(errors, `pageerror(s) under reduced-motion: ${errors.join(' | ')}`).toEqual([]);
  });
});
