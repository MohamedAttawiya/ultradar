// js/strategies.js
(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const LINKS  = $$('.strategy-link');
  const PANELS = $$('.strategy-view');
  const VIEWS  = LINKS.map(a => a.dataset.view);
  const DEFAULT = VIEWS[0] || 'edit';

  function currentFromHash(){
    const h = (location.hash || '').replace('#','');
    return VIEWS.includes(h) ? h : DEFAULT;
  }

  function activate(view){
    LINKS.forEach(a => {
      const on = a.dataset.view === view;
      a.classList.toggle('is-active', on);
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? -1 : 0;
    });
    PANELS.forEach(p => {
      p.dataset.state = (p.dataset.view === view) ? 'active' : '';
    });
  }

  function navigate(view){
    if (!VIEWS.includes(view)) view = DEFAULT;
    if (('#' + view) !== location.hash) location.hash = view; // keeps URL in sync
    activate(view);
    try { localStorage.setItem('ultradar.strategy.view', view); } catch {}
  }

  // Wire clicks
  LINKS.forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    navigate(a.dataset.view);
  }));

  // Init & hashchange
  const saved = (() => { try { return localStorage.getItem('ultradar.strategy.view'); } catch { return null; } })();
  const start = VIEWS.includes(saved) ? saved : currentFromHash();
  activate(start);
  window.addEventListener('hashchange', () => activate(currentFromHash()));
})();
