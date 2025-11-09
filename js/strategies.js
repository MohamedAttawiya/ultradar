// js/strategies.js — Ultradar Strategies (view + create JSON)
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const LINKS  = $$('.strategy-link');
  const PANELS = $$('.strategy-view');
  const VIEWS  = LINKS.map(a => a.dataset.view);
  const DEFAULT = VIEWS[0] || 'edit';

  // === API endpoints ===
  const API_BASE = "https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com";
  const STRATEGIES_URL = `${API_BASE}/strategies?prefix=strategies/`; // explicit prefix

  // === DOM ids ===
  const EDIT_VIEW_SELECTOR   = '.strategy-view[data-view="edit"]';
  const CREATE_VIEW_SELECTOR = '.strategy-view[data-view="create"]';
  const STRATEGY_LIST_ID     = 'strategy-list';
  const CREATE_FORM_ID       = 'strategy-create-form';
  const CREATE_PREVIEW_ID    = 'strategy-create-preview';
  const CREATE_ERRORS_ID     = 'strategy-create-errors';

  // === state flags ===
  let strategiesLoaded = false;
  let strategiesLoading = false;

  // ---------- Navigation ----------
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
      const isActive = (p.dataset.view === view);
      p.dataset.state = isActive ? 'active' : '';
    });

    if (view === 'edit') maybeLoadStrategies();
    if (view === 'create') ensureCreateUI();
  }

  function navigate(view){
    if (!VIEWS.includes(view)) view = DEFAULT;
    if (('#' + view) !== location.hash) location.hash = view;
    activate(view);
    try { localStorage.setItem('ultradar.strategy.view', view); } catch {}
  }

  // ---------- Utilities ----------
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
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  // ---------- EDIT: list strategies ----------
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
      const name =
        strategy.name || payload.name || payload.strategy_id || 'Unnamed strategy';

      const version   = strategy.version ?? payload.version ?? '—';
      const createdBy = strategy.created_by || meta.created_by || meta.owner || '—';
      const createdAt = strategy.created_at || meta.created_at || strategy.lastModified || '';

      const weighting   = payload.weighting || {};
      const smoothing   = payload.smoothing || {};
      const exclusions  = payload.exclusions || {};
      const output      = payload.output_policy || {};
      const mode        = payload.mode || '—';
      const stratType   = payload.strategy_type || payload.type || '—';

      const weightingText = weighting.method
        ? `${String(weighting.method).toUpperCase()}${weighting.decay_alpha != null ? ` (α=${weighting.decay_alpha})` : ''}`
        : (payload.decay_alpha != null ? `DECAY (α=${payload.decay_alpha})` : '—');

      const smoothingSlot = (smoothing.slot_smoothing || {});
      const smoothingText =
        (smoothingSlot.enabled ? `${smoothingSlot.kernel || '—'} (σ=${smoothingSlot.kernel_size ?? '—'})` :
        (payload.slot_smoothing_strength != null ? `gaussian (σ=${payload.slot_smoothing_strength})` : '—'));

      const exclusionCount =
        (exclusions.local_rules?.length || 0) +
        (Array.isArray(payload.exclusions?.local) ? payload.exclusions.local.length : 0);

      const shapes =
        (output.generate_shapes?.join(', ') ||
        [
          payload.output_schema?.weekly_shape ? 'weekly' : null,
          payload.output_schema?.daily_shape  ? 'daily'  : null,
          payload.output_schema?.slot_shape   ? 'slot'   : null
        ].filter(Boolean).join(', ')) || '—';

      const item = document.createElement('li');
      item.className = 'panel strategy-card';
      const versionLabel = version === '—' ? '—' : `v${version}`;

      item.innerHTML = `
        <div class="strategy-card__header">
          <h4 class="strategy-card__title">${escapeHtml(name)}</h4>
          <span class="muted">${escapeHtml(versionLabel)}</span>
        </div>
        <ul class="strategy-card__meta">
          <li><span class="strategy-card__label">Type</span><span class="strategy-card__value">${escapeHtml(stratType)}</span></li>
          <li><span class="strategy-card__label">Mode</span><span class="strategy-card__value">${escapeHtml(mode)}</span></li>
          <li><span class="strategy-card__label">Created by</span><span class="strategy-card__value">${escapeHtml(createdBy)}</span></li>
          <li><span class="strategy-card__label">Created at</span><span class="strategy-card__value">${escapeHtml(formatDate(createdAt))}</span></li>
          <li><span class="strategy-card__label">Size</span><span class="strategy-card__value">${escapeHtml(formatSize(strategy))}</span></li>
          <li><span class="strategy-card__label">Weighting</span><span class="strategy-card__value">${escapeHtml(weightingText)}</span></li>
          <li><span class="strategy-card__label">Smoothing</span><span class="strategy-card__value">${escapeHtml(smoothingText)}</span></li>
          <li><span class="strategy-card__label">Exclusions</span><span class="strategy-card__value">${escapeHtml(String(exclusionCount))}</span></li>
          <li><span class="strategy-card__label">Output</span><span class="strategy-card__value">${escapeHtml(shapes)}</span></li>
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
      const response = await fetch(STRATEGIES_URL, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      let payload = await response.json();
      if (payload && typeof payload.body === 'string'){
        try { payload = JSON.parse(payload.body); } catch {}
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

  function maybeLoadStrategies(){
    if (strategiesLoaded || strategiesLoading) return;
    if (window.location.hash === '#edit'){
      loadStrategies();
    }
  }

  // ---------- CREATE: form + preview ----------
  function ensureCreateUI(){
    const host = $(CREATE_VIEW_SELECTOR);
    if (!host) return;

    if ($((`#${CREATE_FORM_ID}`), host)) return; // already rendered

    const wrapper = document.createElement('div');
    wrapper.className = 'strategy-create';
    wrapper.innerHTML = `
      <form id="${CREATE_FORM_ID}" class="panel form-grid" novalidate>
        <h4>Create Strategy</h4>

        <div class="grid">
          <label>Strategy ID
            <input name="strategy_id" required placeholder="STRAT_EXP_DECAY_V1">
          </label>
          <label>Name
            <input name="name" required placeholder="Exponential Decay Blend">
          </label>
        </div>

        <label>Description
          <input name="description" placeholder="Generates weekly, daily, and slot-level curves…">
        </label>

        <div class="grid">
          <label>Mode
            <select name="mode">
              <option value="dynamic">dynamic</option>
              <option value="static">static</option>
            </select>
          </label>
          <label>Type
            <select name="type">
              <option value="curve_generation">curve_generation</option>
              <option value="volatility_guard">volatility_guard</option>
            </select>
          </label>
          <label>Version
            <input name="version" type="number" min="1" step="1" value="1">
          </label>
        </div>

        <div class="grid">
          <label>Lookback weeks
            <input name="lookback_weeks" type="number" min="1" max="26" value="4">
          </label>
          <label>Decay α
            <input name="decay_alpha" type="number" step="0.01" min="0" max="1" value="0.35">
          </label>
          <label>Volatility λ
            <input name="volatility_lambda" type="number" step="0.01" min="0" max="1" value="0.45">
          </label>
        </div>

        <div class="grid">
          <label>Use volatility weighting
            <select name="use_volatility_weighting">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>Slot smoothing strength (σ)
            <input name="slot_smoothing_strength" type="number" step="0.1" min="0" max="6" value="1.2">
          </label>
          <label>Created by
            <input name="created_by" placeholder="mohamed.a" value="mohamed.a">
          </label>
        </div>

        <fieldset>
          <legend>Output schema</legend>
          <label class="chk"><input type="checkbox" name="weekly_shape" checked> weekly_shape</label>
          <label class="chk"><input type="checkbox" name="daily_shape"  checked> daily_shape</label>
          <label class="chk"><input type="checkbox" name="slot_shape"   checked> slot_shape</label>
        </fieldset>

        <fieldset>
          <legend>Exclusions</legend>
          <label>Global (comma separated)
            <input name="ex_global" placeholder="GLOBAL_HOLIDAY_V3">
          </label>

          <div class="local-exclusions">
            <div class="local-row">
              <select name="local_type_0">
                <option value="weekday">weekday</option>
                <option value="time_window">time_window</option>
              </select>
              <input name="local_days_0" placeholder="days (e.g., 5,6)">
              <input name="local_reason_0" placeholder="reason">
              <input name="local_start_0" placeholder="start_slot (e.g., 0)">
              <input name="local_end_0"   placeholder="end_slot (e.g., 3)">
            </div>
          </div>

          <button type="button" class="btn" id="add-local-rule">+ Add local rule</button>
        </fieldset>

        <div id="${CREATE_ERRORS_ID}" class="muted" style="min-height:1.2em;"></div>

        <div class="actions">
          <button type="button" class="btn primary" id="btn-generate">Generate JSON</button>
          <button type="button" class="btn" id="btn-copy">Copy</button>
          <button type="button" class="btn" id="btn-download">Download</button>
        </div>
      </form>

      <div class="panel">
        <h4>Preview</h4>
        <pre id="${CREATE_PREVIEW_ID}" class="codeblock" style="white-space:pre-wrap;overflow:auto;min-height:180px;">{}</pre>
      </div>
    `;

    host.innerHTML = '';
    host.appendChild(wrapper);

    // hydrate with draft or sensible defaults
    try {
      const draft = localStorage.getItem('ultradar.strategy.create.draft');
      if (draft) fillForm(JSON.parse(draft));
      else fillForm({
        strategy_id: "STRAT_EXP_DECAY_V1",
        name: "Exponential Decay Blend",
        description: "Generates weekly, daily, and slot-level curves using trailing weeks with exponential decay weighting and optional volatility adjustment.",
        version: 1,
        mode: "dynamic",
        type: "curve_generation",
        lookback_weeks: 4,
        decay_alpha: 0.35,
        use_volatility_weighting: true,
        slot_smoothing_strength: 1.2,
        volatility_lambda: 0.45,
        created_by: "mohamed.a",
        weekly_shape: true, daily_shape: true, slot_shape: true,
        ex_global: "GLOBAL_HOLIDAY_V3",
        local: [
          { type:"weekday", days:[5,6], reason:"Weekend suppression" },
          { type:"time_window", start_slot:0, end_slot:3, reason:"Low-volume night slots" }
        ]
      });
    } catch {}

    // wire actions
    $('#add-local-rule', host)?.addEventListener('click', addLocalRow);
    $('#btn-generate', host)?.addEventListener('click', updatePreviewFromForm);
    $('#btn-copy', host)?.addEventListener('click', copyPreviewToClipboard);
    $('#btn-download', host)?.addEventListener('click', downloadPreview);

    // live preview on input
    host.addEventListener('input', debounce(updatePreviewFromForm, 250));
    updatePreviewFromForm(); // initial render
  }

  // ---------- CREATE helpers ----------
  function fillForm(preset){
    const host = $(CREATE_VIEW_SELECTOR);
    const f = $(`#${CREATE_FORM_ID}`, host);
    if (!f) return;

    const set = (name, val) => {
      const el = f.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = (val ?? '').toString();
    };

    set('strategy_id', preset.strategy_id);
    set('name', preset.name);
    set('description', preset.description);
    set('version', preset.version ?? 1);
    set('mode', preset.mode || 'dynamic');
    set('type', preset.type || 'curve_generation');
    set('lookback_weeks', preset.lookback_weeks ?? 4);
    set('decay_alpha', preset.decay_alpha ?? 0.35);
    set('use_volatility_weighting', String(!!preset.use_volatility_weighting));
    set('slot_smoothing_strength', preset.slot_smoothing_strength ?? 1.2);
    set('volatility_lambda', preset.volatility_lambda ?? 0.45);
    set('created_by', preset.created_by || 'mohamed.a');

    f.elements.weekly_shape.checked = !!preset.weekly_shape;
    f.elements.daily_shape.checked  = !!preset.daily_shape;
    f.elements.slot_shape.checked   = !!preset.slot_shape;

    set('ex_global', preset.ex_global || '');

    // local rules
    const container = $('.local-exclusions', f);
    container.innerHTML = '';
    const locals = Array.isArray(preset.local) ? preset.local : [];
    const mkRow = (i, r={}) => `
      <div class="local-row">
        <select name="local_type_${i}">
          <option value="weekday"${r.type==='weekday'?' selected':''}>weekday</option>
          <option value="time_window"${r.type==='time_window'?' selected':''}>time_window</option>
        </select>
        <input name="local_days_${i}" placeholder="days (e.g., 5,6)" value="${r.days ? String(r.days) : ''}">
        <input name="local_reason_${i}" placeholder="reason" value="${r.reason || ''}">
        <input name="local_start_${i}" placeholder="start_slot" value="${r.start_slot ?? ''}">
        <input name="local_end_${i}" placeholder="end_slot" value="${r.end_slot ?? ''}">
        <button type="button" class="btn danger remove-local" data-idx="${i}">Remove</button>
      </div>`;
    locals.forEach((r,i)=> container.insertAdjacentHTML('beforeend', mkRow(i,r)));
    if (locals.length === 0) container.insertAdjacentHTML('beforeend', mkRow(0,{}));

    container.addEventListener('click', (e)=>{
      const btn = e.target.closest('.remove-local');
      if (!btn) return;
      btn.parentElement.remove();
      updatePreviewFromForm();
    });
  }

  function addLocalRow(){
    const host = $(CREATE_VIEW_SELECTOR);
    const f = $(`#${CREATE_FORM_ID}`, host);
    const container = $('.local-exclusions', f);
    const idx = container.querySelectorAll('.local-row').length;
    container.insertAdjacentHTML('beforeend', `
      <div class="local-row">
        <select name="local_type_${idx}">
          <option value="weekday">weekday</option>
          <option value="time_window">time_window</option>
        </select>
        <input name="local_days_${idx}" placeholder="days (e.g., 5,6)">
        <input name="local_reason_${idx}" placeholder="reason">
        <input name="local_start_${idx}" placeholder="start_slot">
        <input name="local_end_${idx}" placeholder="end_slot">
        <button type="button" class="btn danger remove-local" data-idx="${idx}">Remove</button>
      </div>
    `);
    updatePreviewFromForm();
  }

  function buildJsonFromForm(){
    const host = $(CREATE_VIEW_SELECTOR);
    const f = $(`#${CREATE_FORM_ID}`, host);
    const err = $(`#${CREATE_ERRORS_ID}`, host);

    const get = n => f.elements[n]?.value?.trim() ?? '';
    const getNum = (n, d) => {
      const v = parseFloat(get(n));
      return Number.isFinite(v) ? v : d;
    };

    // local exclusions
    const locals = Array.from(f.querySelectorAll('.local-row')).map(row => {
      const type  = row.querySelector('select')?.value || 'weekday';
      const days  = row.querySelector(`[name^="local_days_"]`)?.value?.trim();
      const reason= row.querySelector(`[name^="local_reason_"]`)?.value?.trim() || undefined;
      const start = row.querySelector(`[name^="local_start_"]`)?.value?.trim();
      const end   = row.querySelector(`[name^="local_end_"]`)?.value?.trim();

      const obj = { type };
      if (type === 'weekday') {
        if (days) obj.days = days.split(',').map(s=>Number(s.trim())).filter(n=>Number.isFinite(n));
      } else {
        if (start) obj.start_slot = Number(start);
        if (end)   obj.end_slot   = Number(end);
      }
      if (reason) obj.reason = reason;
      return obj;
    }).filter(r => Object.keys(r).length > 1);

    // build JSON (your schema)
    const nowIso = new Date().toISOString();
    const out = {
      strategy_id: get('strategy_id') || 'STRAT_UNTITLED',
      version: Math.max(1, parseInt(get('version') || '1', 10)),
      name: get('name') || 'New Strategy',
      description: get('description') || '',
      type: get('type') || 'curve_generation',
      mode: get('mode') || 'dynamic',
      lookback_weeks: Math.max(1, parseInt(get('lookback_weeks') || '4', 10)),
      decay_alpha: clamp(getNum('decay_alpha', 0.35), 0, 1),
      use_volatility_weighting: (get('use_volatility_weighting') === 'true'),
      slot_smoothing_strength: clamp(getNum('slot_smoothing_strength', 1.2), 0, 6),
      volatility_lambda: clamp(getNum('volatility_lambda', 0.45), 0, 1),
      exclusions: {
        global: (get('ex_global') ? get('ex_global').split(',').map(s=>s.trim()).filter(Boolean) : []),
        local: locals
      },
      output_schema: {
        weekly_shape: f.elements.weekly_shape.checked,
        daily_shape:  f.elements.daily_shape.checked,
        slot_shape:   f.elements.slot_shape.checked
      },
      metadata: {
        created_by: get('created_by') || 'unknown',
        created_at: nowIso,
        preview_metrics: {
          avg_volatility: null,
          smoothness_index: null,
          centroid_shift: null
        }
      }
    };

    // basic validation
    const errs = [];
    if (!out.strategy_id) errs.push('Strategy ID is required');
    if (!out.name) errs.push('Name is required');
    if (!out.output_schema.weekly_shape && !out.output_schema.daily_shape && !out.output_schema.slot_shape) {
      errs.push('Select at least one output shape');
    }
    err.textContent = errs.join(' • ');
    if (errs.length) throw new Error(errs.join('; '));

    // persist draft
    try { localStorage.setItem('ultradar.strategy.create.draft', JSON.stringify(formToDraft(f))); } catch {}

    return out;
  }

  function formToDraft(f){
    const draft = {
      strategy_id: f.elements.strategy_id.value,
      name: f.elements.name.value,
      description: f.elements.description.value,
      version: Number(f.elements.version.value || 1),
      mode: f.elements.mode.value,
      type: f.elements.type.value,
      lookback_weeks: Number(f.elements.lookback_weeks.value || 4),
      decay_alpha: Number(f.elements.decay_alpha.value || 0.35),
      use_volatility_weighting: (f.elements.use_volatility_weighting.value === 'true'),
      slot_smoothing_strength: Number(f.elements.slot_smoothing_strength.value || 1.2),
      volatility_lambda: Number(f.elements.volatility_lambda.value || 0.45),
      created_by: f.elements.created_by.value,
      weekly_shape: f.elements.weekly_shape.checked,
      daily_shape: f.elements.daily_shape.checked,
      slot_shape: f.elements.slot_shape.checked,
      ex_global: f.elements.ex_global.value,
      local: Array.from(f.querySelectorAll('.local-row')).map(row => {
        const type  = row.querySelector('select')?.value || 'weekday';
        const days  = row.querySelector(`[name^="local_days_"]`)?.value?.trim();
        const reason= row.querySelector(`[name^="local_reason_"]`)?.value?.trim() || undefined;
        const start = row.querySelector(`[name^="local_start_"]`)?.value?.trim();
        const end   = row.querySelector(`[name^="local_end_"]`)?.value?.trim();
        const obj = { type };
        if (type === 'weekday') { if (days) obj.days = days; }
        else { if (start) obj.start_slot = start; if (end) obj.end_slot = end; }
        if (reason) obj.reason = reason;
        return obj;
      })
    };
    return draft;
  }

  function updatePreviewFromForm(){
    const host = $(CREATE_VIEW_SELECTOR);
    const pre = $(`#${CREATE_PREVIEW_ID}`, host);
    try {
      const json = buildJsonFromForm();
      pre.textContent = JSON.stringify(json, null, 2);
    } catch (e) {
      // keep whatever is there; error text is shown above
    }
  }

  async function copyPreviewToClipboard(){
    const host = $(CREATE_VIEW_SELECTOR);
    const pre = $(`#${CREATE_PREVIEW_ID}`, host);
    try {
      await navigator.clipboard.writeText(pre.textContent || '{}');
      toast(host, 'Copied JSON to clipboard');
    } catch {
      toast(host, 'Copy failed');
    }
  }

  function downloadPreview(){
    const host = $(CREATE_VIEW_SELECTOR);
    const pre = $(`#${CREATE_PREVIEW_ID}`, host);
    const content = pre.textContent || '{}';
    let fileName = 'strategy.json';
    try {
      const obj = JSON.parse(content);
      if (obj.strategy_id) fileName = `${obj.strategy_id}.json`;
    } catch {}
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

  function debounce(fn, ms){
    let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn.apply(null,args), ms); };
  }

  function toast(host, msg){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    Object.assign(el.style, { position:'fixed', right:'16px', bottom:'16px', background:'#111', color:'#fff', padding:'8px 12px', borderRadius:'8px', opacity:'0.95', zIndex:9999 });
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), 1600);
  }

  // ---------- Wire clicks ----------
  LINKS.forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    navigate(a.dataset.view);
  }));

  const saved = (() => { try { return localStorage.getItem('ultradar.strategy.view'); } catch { return null; } })();
  const start = VIEWS.includes(saved) ? saved : currentFromHash();
  activate(start);
  window.addEventListener('hashchange', () => activate(currentFromHash()));
})();
