// strategies.js — Ultradar Strategies (browse + mount create form)
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const LINKS  = $$('.strategy-link');
  const PANELS = $$('.strategy-view');
  const VIEWS  = LINKS.map(a => a.dataset.view);
  const DEFAULT = VIEWS[0] || 'edit';

  const API_BASE = "https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com";
  const STRATEGIES_URL = `${API_BASE}/strategies?prefix=strategies/`;

  const EDIT_VIEW_SELECTOR   = '.strategy-view[data-view="edit"]';
  const CREATE_VIEW_SELECTOR = '.strategy-view[data-view="create"]';
  const STRATEGY_LIST_ID     = 'strategy-list';

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
    PANELS.forEach(p => { p.dataset.state = (p.dataset.view === view) ? 'active' : ''; });

    if (view === 'edit') maybeLoadStrategies();
    if (view === 'create') mountForm();
  }

  function navigate(view){
    if (!VIEWS.includes(view)) view = DEFAULT;
    if (('#' + view) !== location.hash) location.hash = view;
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

  function escapeHtml(v){
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function formatDate(value){
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function extractSizeKb(strategy){
    const summary = strategy.summary || {};
    const candidate = strategy.size_kb ?? summary.size_kb;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    const bytes = strategy.size_bytes ?? strategy.size ?? summary.size_bytes ?? summary.size;
    const n = typeof bytes === 'number' ? bytes : parseFloat(bytes);
    return Number.isFinite(n) ? n/1024 : null;
  }
  function formatSize(strategy){
    const kb = extractSizeKb(strategy);
    return kb==null || Number.isNaN(kb) ? '—' : `${kb.toFixed(1)} KB`;
  }

  function normalizeStrategies(payload){
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.strategies)) return payload.strategies;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.body)) return payload.body;
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
      const payload = strategy.payload || {};
      const meta = strategy.metadata || payload.metadata || {};
      const name = strategy.name || payload.name || payload.strategy_id || 'Unnamed strategy';
      const version   = strategy.version ?? payload.version ?? '—';
      const createdBy = strategy.created_by || meta.created_by || meta.owner || '—';
      const createdAt = strategy.created_at || meta.created_at || strategy.lastModified || '';
      const weighting = payload.weighting || {};
      const smoothing = payload.smoothing || {};
      const output    = payload.output_policy || {};
      const stratType = payload.strategy_type || payload.type || '—';
      const mode      = payload.mode || '—';

      const weightingText = weighting.method
        ? `${String(weighting.method).toUpperCase()}${weighting.decay_alpha!=null?` (α=${weighting.decay_alpha})`:''}`
        : (payload.decay_alpha!=null?`DECAY (α=${payload.decay_alpha})`:'—');

      const smoothingSlot = (smoothing.slot_smoothing || {});
      const smoothingText =
        (smoothingSlot.enabled ? `${smoothingSlot.kernel || '—'} (σ=${smoothingSlot.kernel_size ?? '—'})` :
        (payload.slot_smoothing_strength != null ? `gaussian (σ=${payload.slot_smoothing_strength})` : '—'));

      const shapes =
        (output.generate_shapes?.join(', ') ||
        [
          payload.output_schema?.weekly_shape ? 'weekly' : null,
          payload.output_schema?.daily_shape  ? 'daily'  : null,
          payload.output_schema?.slot_shape   ? 'slot'   : null
        ].filter(Boolean).join(', ')) || '—';

      const li = document.createElement('li');
      li.className = 'panel strategy-card';
      li.innerHTML = `
        <div class="strategy-card__header">
          <h4 class="strategy-card__title">${escapeHtml(name)}</h4>
          <span class="muted">${escapeHtml(version==='—'?'—':`v${version}`)}</span>
        </div>
        <ul class="strategy-card__meta">
          <li><span class="strategy-card__label">Type</span><span class="strategy-card__value">${escapeHtml(stratType)}</span></li>
          <li><span class="strategy-card__label">Mode</span><span class="strategy-card__value">${escapeHtml(mode)}</span></li>
          <li><span class="strategy-card__label">Created by</span><span class="strategy-card__value">${escapeHtml(createdBy)}</span></li>
          <li><span class="strategy-card__label">Created at</span><span class="strategy-card__value">${escapeHtml(formatDate(createdAt))}</span></li>
          <li><span class="strategy-card__label">Size</span><span class="strategy-card__value">${escapeHtml(formatSize(strategy))}</span></li>
          <li><span class="strategy-card__label">Weighting</span><span class="strategy-card__value">${escapeHtml(weightingText)}</span></li>
          <li><span class="strategy-card__label">Smoothing</span><span class="strategy-card__value">${escapeHtml(smoothingText)}</span></li>
          <li><span class="strategy-card__label">Output</span><span class="strategy-card__value">${escapeHtml(shapes)}</span></li>
        </ul>
      `;
      list.appendChild(li);
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
      const res = await fetch(STRATEGIES_URL, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let payload = await res.json();
      if (payload && typeof payload.body === 'string') { try { payload = JSON.parse(payload.body); } catch {} }
      const strategies = normalizeStrategies(payload);
      renderStrategies(strategies);
      strategiesLoaded = true;
    } catch (e) {
      console.error('Failed to load strategies.', e);
      renderStatus('Failed to load strategies.');
    } finally {
      strategiesLoading = false;
    }
  }

  function maybeLoadStrategies(){
    if (strategiesLoaded || strategiesLoading) return;
    if (window.location.hash === '#edit') loadStrategies();
  }

  // Mount the create form using the module
  function mountForm(){
    const host = $(CREATE_VIEW_SELECTOR);
    if (!host) return;
    // Ensure module is loaded (if you lazy-load via <script defer src="strategy-form.js"> it’s already present)
    if (!window.UltradarStrategyForm || !window.UltradarStrategyForm.mount) {
      host.innerHTML = '<p class="muted">Form module not loaded.</p>';
      return;
    }
    window.UltradarStrategyForm.mount(host);
  }

  // Events
  LINKS.forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(a.dataset.view);
  }));

  const saved = (() => { try { return localStorage.getItem('ultradar.strategy.view'); } catch { return null; } })();
  const start = VIEWS.includes(saved) ? saved : currentFromHash();
  activate(start);
  window.addEventListener('hashchange', () => activate(currentFromHash()));
})();
