/*
 * Onglets (script classique, indépendant des modules : la page reste navigable même si un module ne se charge pas).
 * Adresse : #onglet ou #onglet/d=<données du formulaire>.
 */
(function () {
  var TABS = ['accueil', 'projet', 'conception', 'tablier', 'ferraillage', 'complements', 'poutres', 'cadres', 'precontrainte', 'phasage', 'appuis', 'seisme', 'retenue', 'notes'];
  var current = 'accueil';
  function hashTab() { return location.hash.slice(1).split('/')[0]; }
  function hashData() { var m = location.hash.match(/(?:^#|\/)d=(.+)$/); return m ? m[1] : null; }
  function goTab(id, push) {
    if (TABS.indexOf(id) < 0) id = 'accueil';
    current = id;
    var secs = document.querySelectorAll('section.tab');
    for (var i = 0; i < secs.length; i++) secs[i].classList.toggle('active', secs[i].id === 'tab-' + id);
    var as = document.querySelectorAll('nav.tabs a');
    for (var j = 0; j < as.length; j++) as[j].setAttribute('aria-selected', String(as[j].getAttribute('data-tab') === id));
    if (id === 'seisme') { var fr = document.getElementById('ec8-frame'); if (fr && !fr.getAttribute('src')) fr.setAttribute('src', fr.getAttribute('data-src') + '?v=' + '0.91'); }
    if (push !== false) { var d = hashData(); history.replaceState(null, '', '#' + id + (d ? '/d=' + d : '')); }
    try { window.dispatchEvent(new CustomEvent('psida-tab', { detail: id })); } catch (e) { /* navigateurs anciens */ }
    requestAnimationFrame(function () {
      var plots = document.querySelectorAll('#tab-' + id + ' .plot');
      for (var k = 0; k < plots.length; k++) if (plots[k].data && window.Plotly) window.Plotly.Plots.resize(plots[k]);
    });
  }
  window.psidaTabs = { goTab: goTab, current: function () { return current; }, hashData: hashData, TABS: TABS };
  document.addEventListener('DOMContentLoaded', function () {
    // délégation : la barre d'onglets est reconstruite selon l'ouvrage choisi (web/parcours.js)
    var nav = document.querySelector('nav.tabs');
    if (nav) nav.addEventListener('click', function (ev) { var a = ev.target.closest ? ev.target.closest('a[data-tab]') : null; if (a) { ev.preventDefault(); goTab(a.getAttribute('data-tab')); } });
    window.addEventListener('hashchange', function () { var h = hashTab(); if (TABS.indexOf(h) >= 0 && h !== current) goTab(h, false); });
    goTab(hashTab(), false);
  });
  // erreur de chargement d'un module : message visible au lieu d'une page vide
  window.addEventListener('error', function (e) {
    var el = document.getElementById('error');
    if (el && e && e.message) el.textContent = 'Erreur au chargement : ' + e.message + (e.filename ? ' (' + e.filename + ')' : '');
  });
})();
