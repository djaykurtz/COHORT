var header = document.querySelector('.masthead');
var researchLink = header.querySelector('a[href="../demo/?view=governance"]');
var navigation = document.createElement('nav');
navigation.className = 'project-navigation';
navigation.setAttribute('aria-label', 'Project exploration');
var overviewLink = document.createElement('a');
overviewLink.href = '../';
overviewLink.textContent = 'Project overview';
var portfolioLink = document.createElement('a');
portfolioLink.href = 'https://djaykurtz.github.io/#cohort';
portfolioLink.textContent = 'Back to portfolio';
researchLink.textContent = 'Research / Decisions';
navigation.append(overviewLink, researchLink, portfolioLink);
header.appendChild(navigation);

var cards = Array.from(document.querySelectorAll('.system-card'));
function filterSystems() {
  var query = document.getElementById('system-query').value.trim().toLowerCase();
  var group = document.getElementById('system-group').value;
  var availability = document.getElementById('system-availability').value;
  cards.forEach(function(card) {
    card.hidden = !!((query && !card.textContent.toLowerCase().includes(query))
      || (group && card.dataset.group !== group)
      || (availability && card.dataset.availability !== availability));
  });
  document.getElementById('system-count').textContent = cards.filter(function(card) { return !card.hidden; }).length + ' of ' + cards.length + ' entries shown.';
}
function clearFilters() {
  ['system-query', 'system-group', 'system-availability'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  filterSystems();
}
function inspectHash() {
  var id = window.location.hash.slice(1);
  var card = cards.find(function(item) { return item.id === id; });
  if (!card) return;
  clearFilters();
  card.querySelector('details').open = true;
  card.querySelector('summary').focus({ preventScroll: true });
  card.scrollIntoView({ block: 'start', behavior: 'auto' });
}
document.getElementById('system-query').addEventListener('input', filterSystems);
['system-group', 'system-availability'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', filterSystems);
});
document.getElementById('clear-filters').addEventListener('click', clearFilters);
window.addEventListener('hashchange', inspectHash);
document.documentElement.classList.add('enhanced');
inspectHash();
