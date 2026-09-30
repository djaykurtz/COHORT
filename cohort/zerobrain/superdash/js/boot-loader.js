/* ZEROBRAIN Boot Loader — power-up animation
 * Tracks async data loads; fills a thin progress bar next to the title.
 * When all steps complete, ZEROBRAIN "powers up" with glow + brightness.
 */
var BootLoader = {
  total: 5,  // fleet, health, molt, scripts, taskboard
  done: 0,
  finished: false,

  step: function() {
    if (BootLoader.finished) return;
    BootLoader.done = Math.min(BootLoader.done + 1, BootLoader.total);
    var pct = (BootLoader.done / BootLoader.total) * 100;
    var fill = document.getElementById('boot-loader-fill');
    if (fill) fill.style.width = pct + '%';

    // Gradually brighten the title as steps complete
    var title = document.getElementById('brand-title');
    if (title) {
      var opacity = 0.35 + (0.65 * (BootLoader.done / BootLoader.total));
      title.style.opacity = opacity;
    }

    if (BootLoader.done >= BootLoader.total) {
      BootLoader.powerUp();
    }
  },

  powerUp: function() {
    if (BootLoader.finished) return;
    BootLoader.finished = true;
    var title = document.getElementById('brand-title');
    var bar = document.getElementById('boot-loader');
    if (title) {
      title.classList.remove('brand-dim');
      title.classList.add('brand-live');
      title.style.opacity = '';
    }
    // Fade out the bar after a beat
    if (bar) {
      setTimeout(function() {
        bar.classList.add('boot-loader-done');
      }, 600);
    }
  }
};
