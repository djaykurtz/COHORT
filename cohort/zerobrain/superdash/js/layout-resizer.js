// UXIA taskboard split: persisted keyboard/pointer resizing for the Task Board
// panel height. The right-side intel cards remain a fixed companion column
// at wide desktop widths (>1400px); below that breakpoint (css/responsive.css)
// main+intel stack as adjacent CSS Grid ROWS instead of side-by-side columns.
//
// BUG FIX (OPERATOR-reported, 2026-08): this file + the
// #taskboard-height-resizer element in index.html were both shipped with NO
// CSS at all for the handle (added separately in css/overrides.css) -- the
// handle was completely invisible/non-functional at any width. While fixing
// that, a second, deeper issue was found: below the 1400px breakpoint where
// main+intel visually stack (matching the exact layout OPERATOR reported the
// missing handle in), #main-panel's own flex/height was never the right
// lever -- CSS Grid track sizing for the "main" row is independent of a flex
// CHILD's inline height, so even a fully-CSS'd handle would drag with zero
// visible effect there. Fixed by driving the grid row's own track size via
// --taskboard-row-size (see css/responsive.css) whenever main+intel are
// stacked, and falling back to the original #main-panel flex/height approach
// at true wide-desktop widths where main/intel are separate columns instead.

(function() {
  'use strict';

  var STORAGE_KEY = 'superdash.taskboard-height';
  var MIN_HEIGHT = 360;
  var MAX_HEIGHT = 780;
  var MIN_INTEL_HEIGHT = 120; // keep at least a sliver of the intel row visible/scrollable
  var POINTER_SENSITIVITY = 0.55;
  var KEYBOARD_STEP = 12;
  // Matches css/responsive.css's tablet breakpoint exactly -- below this,
  // main+intel are stacked GRID ROWS (needs --taskboard-row-size); at/above
  // it, they're side-by-side GRID COLUMNS (needs #main-panel flex/height).
  var STACKED_BREAKPOINT = '(max-width: 1400px)';
  // Below this, the layout is single-column mobile enough that a persisted
  // height drag isn't a coherent affordance -- hide the handle entirely,
  // matching css/responsive.css's own mobile breakpoint.
  var MIN_USABLE_WIDTH = 641;

  function init() {
    var cockpit = document.querySelector('.cockpit');
    var main = document.querySelector('.main');
    var mainPanel = document.getElementById('main-panel');
    var intel = document.querySelector('.intel');
    var handle = document.getElementById('taskboard-height-resizer');
    if (!cockpit || !main || !mainPanel || !handle) return;

    var saved = parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
    var height = Number.isFinite(saved) ? saved : null;
    var dragging = false;
    var startY = 0;
    var startHeight = 0;

    function isUsableWidth() {
      return window.matchMedia('(min-width: ' + MIN_USABLE_WIDTH + 'px)').matches;
    }

    function isStacked() {
      return window.matchMedia(STACKED_BREAKPOINT).matches;
    }

    function updatePosition() {
      if (!isUsableWidth()) {
        handle.hidden = true;
        return;
      }
      handle.hidden = false;
      var cockpitRect = cockpit.getBoundingClientRect();
      // In stacked mode the handle sits at the bottom edge of #main-panel's
      // grid row (same visual spot: right where main ends and intel begins).
      // In side-by-side mode it sits at #main-panel's own bottom edge, same
      // as the original behavior.
      var panelRect = mainPanel.getBoundingClientRect();
      handle.style.left = (panelRect.left - cockpitRect.left) + 'px';
      handle.style.top = (panelRect.bottom - cockpitRect.top + 2) + 'px';
      handle.style.width = panelRect.width + 'px';
      handle.setAttribute(
        'aria-valuenow',
        String(Math.round(height === null ? panelRect.height : height))
      );
    }

    function currentHeight() {
      // Track a CONSISTENT quantity per mode: in stacked mode the tracked
      // "height" IS the grid row's total size (.main's own box: tabs + panel
      // + inter-gap), because that's what --taskboard-row-size controls. In
      // side-by-side mode it's #main-panel's own height (unchanged from the
      // original implementation). Mixing the two here was the actual bug --
      // reading #main-panel's height (smaller) but writing it as if it were
      // .main's total row size (bigger) silently shrank the row on every drag.
      if (height !== null) return height;
      return isStacked() ? main.getBoundingClientRect().height : mainPanel.getBoundingClientRect().height;
    }

    function applyHeight(nextHeight, persist) {
      var clampedMax = MAX_HEIGHT;
      if (isStacked()) {
        // Available room = cockpit's total height minus whatever ISN'T main
        // or intel (header/status/gaps), minus a reserved minimum for intel
        // so dragging can't squeeze the sidebar cards down to nothing.
        var cockpitHeight = cockpit.getBoundingClientRect().height;
        var mainRect = main.getBoundingClientRect();
        var intelRect = intel ? intel.getBoundingClientRect() : null;
        var nonMainNonIntel = cockpitHeight - mainRect.height - (intelRect ? intelRect.height : 0);
        var maxAvailable = cockpitHeight - nonMainNonIntel - MIN_INTEL_HEIGHT;
        clampedMax = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, maxAvailable));
      } else {
        var maxAvailableFlex = Math.max(MIN_HEIGHT, main.getBoundingClientRect().height - 8);
        clampedMax = Math.min(MAX_HEIGHT, maxAvailableFlex);
      }
      height = Math.max(MIN_HEIGHT, Math.min(clampedMax, Math.round(nextHeight)));

      if (isStacked()) {
        // height here IS .main's total row size (see currentHeight() above) --
        // set the grid row track directly to it. #main-panel must keep
        // flex:1 (NOT cleared to '') so the PANEL itself still fills
        // whatever's left of that row after .main-tabs + the inter-gap.
        cockpit.style.setProperty('--taskboard-row-size', height + 'px');
        mainPanel.style.flex = '1';
        mainPanel.style.height = '';
      } else {
        cockpit.style.removeProperty('--taskboard-row-size');
        mainPanel.style.flex = '0 0 ' + height + 'px';
        mainPanel.style.height = height + 'px';
      }
      if (persist) window.localStorage.setItem(STORAGE_KEY, String(height));
      updatePosition();
    }

    function stopDrag() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-resizing-taskboard-height');
      handle.releasePointerCapture?.(handle._pointerId);
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
      updatePosition();
    }

    handle.addEventListener('pointerdown', function(event) {
      if (!isUsableWidth()) return;
      dragging = true;
      startY = event.clientY;
      startHeight = currentHeight();
      height = startHeight;
      handle._pointerId = event.pointerId;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add('is-resizing-taskboard-height');
      event.preventDefault();
    });
    handle.addEventListener('pointermove', function(event) {
      if (dragging) {
        applyHeight(startHeight + (event.clientY - startY) * POINTER_SENSITIVITY, false);
      }
    });
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
    handle.addEventListener('keydown', function(event) {
      var current = currentHeight();
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        applyHeight(current + (event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP), true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        applyHeight(MIN_HEIGHT, true);
      } else if (event.key === 'End') {
        event.preventDefault();
        applyHeight(MAX_HEIGHT, true);
      }
    });

    if (height !== null) applyHeight(height, false);
    updatePosition();
    window.addEventListener('resize', updatePosition);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

