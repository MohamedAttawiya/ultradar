// js/strategies.js
(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const LINKS  = $$('.strategy-link');
  const PANELS = $$('.strategy-view');
  const VIEWS  = LINKS.map(a => a.dataset.view);
  const DEFAULT = VIEWS[0] || 'edit';

  const API_URL = "https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com/strategies";
  const SUMMARY_URL = `${API_URL}?summary=true`;
  const EDIT_VIEW_SELECTOR = '.strategy-view[data-view="edit"]';
  const STRATEGY_LIST_ID = 'strategy-list';
  let strategiesLoaded = false;
  let strategiesLoading = false;

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
    maybeLoadStrategies(view);
  }

  function navigate(view){
    if (!VIEWS.includes(view)) view = DEFAULT;
    if (('#' + view) !== location.hash) location.hash = view; // keeps URL in sync
    activate(view);
    try { localStorage.setItem('ultradar.strategy.view', view); } catch {}
  }

  function ensureStrategyContainer(){
    let container = document.getElementById(STRATEGY_LIST_ID);
    if (container) return container;
    const host = $(EDIT_VIEW_SELECTOR);
    if (!host) return null;
    container = document.createElement('div');
    container.id = STRATEGY_LIST_ID;
    container.setAttribute('aria-live', 'polite');
    host.appendChild(container);
    return container;
  }

  function renderStatus(message){
    const container = ensureStrategyContainer();
    if (!container) return;
    container.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
  }

  function formatDate(value){
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function extractSizeKb(strategy){
    const summary = strategy.summary || {};
    const candidate = strategy.size_kb ?? strategy.sizeKb ?? strategy.sizeKB ?? summary.size_kb ?? summary.sizeKb ?? summary.sizeKB;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    const bytes = strategy.size_bytes ?? strategy.sizeBytes ?? strategy.size ?? summary.size_bytes ?? summary.sizeBytes ?? summary.size;
    const numeric = typeof bytes === 'number' ? bytes : parseFloat(bytes);
    if (!Number.isFinite(numeric)) return null;
    return numeric / 1024;
  }

  function formatSize(strategy){
    const sizeKb = extractSizeKb(strategy);
    if (sizeKb == null || Number.isNaN(sizeKb)) return '—';
    return `${sizeKb.toFixed(1)} KB`;
  }

  function escapeHtml(value){
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStrategies(payload){
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.strategies)) return payload.strategies;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.body)) return payload.body;
    return [];
  }

  function renderStrategies(strategies){
    const container = ensureStrategyContainer();
    if (!container) return;
    if (!Array.isArray(strategies) || strategies.length === 0){
      container.innerHTML = '<p class="muted">No strategies found.</p>';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'strategy-results';

    strategies.forEach(strategy => {
      const summary = strategy.summary || {};
      const meta = strategy.metadata || {};
      const name = strategy.name || strategy.strategy_name || summary.name || strategy.strategyId || strategy.strategy_id || strategy.file_name || strategy.filename || summary.file_name || 'Unnamed strategy';
      const version = strategy.version ?? summary.version ?? strategy.strategy_version ?? '—';
      const createdBy = strategy.created_by || summary.created_by || meta.created_by || meta.owner || summary.owner || '—';
      const createdAt = strategy.created_at || summary.created_at || meta.created_at || strategy.last_modified || strategy.updated_at || summary.updated_at || '';

      const item = document.createElement('li');
      item.className = 'panel strategy-card';

      const versionLabel = version === '—' ? '—' : `v${version}`;

      item.innerHTML = `
        <div class="strategy-card__header">
          <h4 class="strategy-card__title">${escapeHtml(name)}</h4>
          <span class="muted">${escapeHtml(versionLabel)}</span>
        </div>
        <ul class="strategy-card__meta">
          <li><span class="strategy-card__label">Created by</span><span class="strategy-card__value">${escapeHtml(createdBy)}</span></li>
          <li><span class="strategy-card__label">Created at</span><span class="strategy-card__value">${escapeHtml(formatDate(createdAt))}</span></li>
          <li><span class="strategy-card__label">Size</span><span class="strategy-card__value">${escapeHtml(formatSize(strategy))}</span></li>
        </ul>
      `;

      list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);
  }

  async function loadStrategies(){
    const container = ensureStrategyContainer();
    if (!container || strategiesLoading || strategiesLoaded) return;
    strategiesLoading = true;
    renderStatus('Loading strategies…');
    try {
      const response = await fetch(SUMMARY_URL, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      let payload = await response.json();
      if (payload && typeof payload.body === 'string'){
        try {
          payload = JSON.parse(payload.body);
        } catch (parseError) {
          console.warn('Unable to parse strategies body JSON.', parseError);
        }
      }
      const strategies = normalizeStrategies(payload);
      renderStrategies(strategies);
      strategiesLoaded = true;
    } catch (error) {
      console.error('Failed to load strategies.', error);
      renderStatus('Failed to load strategies.');
    } finally {
      strategiesLoading = false;
    }
  }

  function maybeLoadStrategies(view){
    if (view !== 'edit') return;
    if (strategiesLoaded || strategiesLoading) return;
    if (window.location.hash === '#edit' || view === 'edit'){
      loadStrategies();
    }
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
