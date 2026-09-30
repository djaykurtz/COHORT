// @ts-check
// Targeted regression tests for TWO OPERATOR-reported kanban card bugs:
//
// Bug 1 (3 screenshots): long task_id/swat_id slugs (and long assignee
// names) overflowed .kanban-card's box HORIZONTALLY, leaking past the card
// boundary and forcing an unwanted page-level horizontal scrollbar. Fixed
// via min-width:0 + text-overflow:ellipsis on .kanban-card-meta's children.
//
// Bug 2 (4th screenshot -- caught by OPERATOR reviewing the live site with
// real data after Bug 1's fix landed): the defense-in-depth overflow:hidden
// added to .kanban-card for Bug 1 exposed a SECOND, pre-existing bug: as a
// flex item inside .kanban-col-body (display:flex; flex-direction:column),
// .kanban-card defaulted to flex-shrink:1, so with many cards (e.g. the 36
// SWATS column) collectively exceeding the column's available height, cards
// were silently shrunk below their own title's natural (wrapped, multi-
// line) height instead of the column's overflow-y:auto handling it via
// scroll. This was invisible before Bug 1's fix (overflow:visible let the
// "clipped" second line spill out and still render), but became an ACTIVE,
// worse-than-before vertical clip once overflow:hidden was added. Fixed via
// flex-shrink:0 on .kanban-card.
const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8433/';

// Exact reproduction of the reported slugs, long enough to overflow a
// typical ~260px kanban card at 9px monospace.
const LONG_TASK_ID = 'fleet-tracking-vs-reality-reconciliation-pass-rfc114-561x1-599-624x1-643x6';
const LONG_TITLE = 'Fleet-wide tracking-vs-reality reconciliation pass (RFC114/561x1/599/624x1/643/6...)';

test.describe('superdash-v2 kanban card overflow bug fix', () => {
  test('@card-overflow-fix long task_id truncates with ellipsis, never exceeds the card box', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.TaskBoard !== 'undefined' && typeof window.Components !== 'undefined', { timeout: 5000 });

    // Render a single synthetic card directly via TaskBoard._renderCard,
    // independent of live coordinator task data, so the test is deterministic
    // and reproduces the EXACT reported content.
    const result = await page.evaluate(({ taskId, title }) => {
      var html = window.TaskBoard._renderCard({
        task_id: taskId,
        title: title,
        assigned_to: 'DRAGON',
        priority: 2,
        updated_at: new Date().toISOString(),
      });
      var container = document.createElement('div');
      container.style.width = '260px'; // typical kanban column card width
      container.innerHTML = html;
      document.body.appendChild(container);

      var card = container.querySelector('.kanban-card');
      var idEl = container.querySelector('.kanban-card-id');
      var cardRect = card.getBoundingClientRect();
      var idRect = idEl.getBoundingClientRect();

      return {
        cardRight: cardRect.right,
        idRight: idRect.right,
        idScrollWidth: idEl.scrollWidth,
        idClientWidth: idEl.clientWidth,
        idComputedOverflow: getComputedStyle(idEl).textOverflow,
        idComputedWhiteSpace: getComputedStyle(idEl).whiteSpace,
        cardComputedOverflow: getComputedStyle(card).overflow,
        bodyScrollWidth: document.body.scrollWidth,
        windowInnerWidth: window.innerWidth,
      };
    }, { taskId: LONG_TASK_ID, title: LONG_TITLE });

    expect(result.idComputedOverflow, '.kanban-card-id must use ellipsis truncation').toBe('ellipsis');
    expect(result.idComputedWhiteSpace, '.kanban-card-id must not wrap (required for ellipsis to apply)').toBe('nowrap');
    expect(result.cardComputedOverflow, '.kanban-card must clip overflow as defense-in-depth').toBe('hidden');

    // The core visible-bug assertion: the id element's rendered right edge
    // must NOT extend past the card's right edge (previously it did).
    expect(result.idRight, 'the id text must not render past the card boundary').toBeLessThanOrEqual(result.cardRight + 1); // +1px rounding tolerance

    // The id's actual text content is wider than its box (scrollWidth >
    // clientWidth) -- confirms this test genuinely exercises the overflow
    // case rather than accidentally using a short string that never overflows.
    expect(result.idScrollWidth, 'sanity check: the long slug must actually be wider than the box for this test to be meaningful').toBeGreaterThan(result.idClientWidth);

    // And critically: this overflowing card must NOT have expanded the page's
    // own horizontal scroll extent -- this was the OPERATOR-reported downstream
    // symptom ("causing a horizontal scroll bar to appear... affecting the
    // window shape").
    expect(result.bodyScrollWidth, 'the page itself must not gain horizontal scroll from an overflowing card').toBeLessThanOrEqual(result.windowInnerWidth + 20); // small tolerance for scrollbar width itself
  });

  test('@card-overflow-fix long swat_id + long author both truncate correctly in the SWAT card variant', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.TaskBoard !== 'undefined', { timeout: 5000 });

    const result = await page.evaluate(() => {
      var html = window.TaskBoard._renderSwatCard({
        swat_id: 'SWAT-20260730-0001-close-swat-ancestry-gate-flip-coord-swat-ancestry-gate',
        title: 'Activate SWAT-0008 close_swat ancestry gate (flip COORD_SWAT_ANCESTRY_GATE + restart)',
        created_by: 'ZBPRIME-VERY-LONG-NODE-NAME-EXAMPLE',
        severity: 'low',
        stage: 'in_review',
        current_reviewer: 'NIMBUS',
        updated_at: new Date().toISOString(),
      });
      var container = document.createElement('div');
      container.style.width = '260px';
      container.innerHTML = html;
      document.body.appendChild(container);

      var card = container.querySelector('.kanban-card');
      var idEl = container.querySelector('.kanban-card-id');
      var assigneeEl = container.querySelector('.kanban-card-assignee');
      var cardRect = card.getBoundingClientRect();

      return {
        cardRight: cardRect.right,
        idRight: idEl.getBoundingClientRect().right,
        assigneeRight: assigneeEl.getBoundingClientRect().right,
      };
    });

    expect(result.idRight, 'swat_id must not overflow the card').toBeLessThanOrEqual(result.cardRight + 1);
    expect(result.assigneeRight, 'long author name must not overflow the card').toBeLessThanOrEqual(result.cardRight + 1);
  });

  test('@card-overflow-fix Bug 2: cards in a densely-packed scrollable column never clip their own title vertically', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.TaskBoard !== 'undefined', { timeout: 5000 });

    // Reproduce the REAL failure condition: many cards (like the live SWATS
    // column's 36 items) stacked in a height-constrained flex column with
    // overflow-y:auto, several with long titles that need 2-4 wrapped
    // lines. Bug 2 only manifests when the column's TOTAL content height
    // exceeds its available space -- a single isolated card (as in the
    // tests above) never triggers the flex-shrink squish, which is exactly
    // why the original test suite missed it.
    const result = await page.evaluate(() => {
      var col = document.createElement('div');
      col.className = 'kanban-col-body';
      col.style.height = '300px'; // constrained, like the real column
      document.body.appendChild(col);

      var longTitles = [
        'WORKER_HOST launch observability and bounded handoff',
        'CRITICAL: PG connection-pool idle-in-transaction leak -- root cause of recurring coordinator wedges (4+/day)',
        'Live topology_lens reach matrix stale: shows COORD_HOST>WORKER_HOST:0 asymmetric, contradicts confirmed bidirectional reach',
        'Activate SWAT-0008 close_swat ancestry gate (flip COORD_SWAT_ANCESTRY_GATE_ENUM + restart) -- tracks binding follow-through',
      ];
      // Repeat to comfortably exceed the 300px constrained height, matching
      // the real column's "too many cards for the visible area" condition.
      var allTitles = longTitles.concat(longTitles).concat(longTitles);

      allTitles.forEach(function(title, i) {
        col.insertAdjacentHTML('beforeend', window.TaskBoard._renderSwatCard({
          swat_id: 'SWAT-2026081' + i,
          title: title,
          created_by: 'DRAGON',
          severity: 'low',
          stage: 'open',
          updated_at: new Date().toISOString(),
        }));
      });

      var cards = Array.from(col.querySelectorAll('.kanban-card'));
      var clipped = cards.filter(function(card) {
        var title = card.querySelector('.kanban-card-title');
        // +0.5px tolerance for sub-pixel rendering rounding.
        return title.getBoundingClientRect().height > card.getBoundingClientRect().height + 0.5;
      });

      return {
        totalCards: cards.length,
        clippedCount: clipped.length,
        clippedTitles: clipped.map(function(c) { return c.querySelector('.kanban-card-title').textContent; }),
        columnScrollable: col.scrollHeight > col.clientHeight,
      };
    });

    expect(result.columnScrollable, 'sanity check: the column must actually be overflowing for this test to be meaningful').toBe(true);
    expect(result.clippedCount, 'no card should ever clip its own title -- got: ' + JSON.stringify(result.clippedTitles)).toBe(0);
  });
});
