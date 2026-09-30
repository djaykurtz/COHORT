document.querySelectorAll('[data-movement]').forEach(function(button) {
  button.addEventListener('click', function() {
    document.querySelectorAll('[data-movement]').forEach(function(item) {
      var active = item === button;
      item.classList.toggle('selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.panel !== button.dataset.movement;
    });
  });
});
