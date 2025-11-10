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

  function cloneStrategyData(obj) {
    if (obj == null) return null;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) {}
    }
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  }

 function renderStrategies(strategies) {
  const container = ensureStrategyContainer();
  if (!container) return;

  ensureTagCss();

  const listData = Array.isArray(strategies) ? [...strategies] : [];
  if (!listData.length) {
    container.innerHTML = '<p class="muted">No strategies found.</p>';
    return;
  }

  // Sort newest first
  listData.sort((a, b) => {
    const da = new Date(a.lastModified || a.metadata?.created_at || a.payload?.metadata?.created_at || 0).getTime();
    const db = new Date(b.lastModified || b.metadata?.created_at || b.payload?.metadata?.created_at || 0).getTime();
    return (db || 0) - (da || 0);
  });

  const list = document.createElement("ul");
  list.className = "strategy-results";

  listData.forEach((item) => {
    const p = item.payload || {};
    const params = p.parameters || {};
    const decay = params.decay || {};
    const vol = p.volatility || {};
    const sod = vol.slot_of_day || {};
    const wod = vol.week_of_day || {};
    const cons = p.constraints || {};
    const lowpad = cons.low_volume_padding || {};
    const meta = p.metadata || item.metadata || {};
    const name = p.name || item.name || p.strategy_id || "Unnamed strategy";
    const id = p.strategy_id || item.strategy_id || "—";
    const type = p.type || "decay";
    const createdBy = meta.created_by || item.created_by || "—";
    const createdAt = meta.created_at || item.created_at || item.lastModified || "";

    const li = document.createElement("li");
    li.className = "panel strategy-card";
    li.innerHTML = `
      <div class="strategy-card__header">
        <h4 class="strategy-card__title">${escapeHtml(name)}</h4>
        <div class="tagrow">
          <span class="tag ${sod.enabled ? "tag-on" : "tag-off"}">SOD ${sod.enabled ? "ENABLED" : "OFF"}</span>
          <span class="tag ${wod.enabled ? "tag-on" : "tag-off"}">WOD ${wod.enabled ? "ENABLED" : "OFF"}</span>
        </div>
      </div>

      <ul class="strategy-card__meta">
        <li><span class="strategy-card__label">ID</span><span class="strategy-card__value" title="${escapeHtml(id)}">${escapeHtml(id)}</span></li>
        <li><span class="strategy-card__label">Name</span><span class="strategy-card__value">${escapeHtml(name)}</span></li>
        <li><span class="strategy-card__label">Type</span><span class="strategy-card__value">${escapeHtml(type)}</span></li>
        <li><span class="strategy-card__label">Created by</span><span class="strategy-card__value">${escapeHtml(createdBy)}</span></li>
        <li><span class="strategy-card__label">Created at</span><span class="strategy-card__value">${escapeHtml(formatDate(createdAt))}</span></li>
      </ul>

      <div style="display:flex; gap:8px; margin-top:6px;">
        <button class="btn-plain btn-json-toggle" type="button">View Details</button>
        <button class="btn-chip btn-edit" type="button">Edit</button>
      </div>
      <div class="strategy-details" style="display:none; margin-top:8px; padding:10px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
        <div class="details-inner" style="font-size:13px; line-height:1.5; color:#0f172a;"></div>
        <pre class="strategy-json" style="display:none; margin:8px 0 0; padding:8px; background:#0b1220; color:#e5e7eb; border-radius:8px; max-height:240px; overflow:auto; font-size:12px;"></pre>
      </div>
    `;

    const btn = li.querySelector(".btn-json-toggle");
    const details = li.querySelector(".strategy-details");
    const inner = li.querySelector(".details-inner");
    const pre = li.querySelector(".strategy-json");
    const editBtn = li.querySelector(".btn-edit");

    btn.addEventListener("click", () => {
      const open = details.style.display !== "none";
      if (open) {
        details.style.display = "none";
        btn.textContent = "View Details";
      } else {
        inner.innerHTML = buildDetailsHTML(p);
        pre.textContent = JSON.stringify(p, null, 2);
        pre.style.display = "block";
        details.style.display = "block";
        btn.textContent = "Hide Details";
      }
    });

    if (editBtn) {
      editBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        startEditStrategy(item);
      });
    }

    list.appendChild(li);
  });

  container.innerHTML = "";
  container.appendChild(list);

  // --- helpers ---
  function n2(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v.toFixed(2) : "—";
  }

  function buildDetailsHTML(p) {
    const params = p.parameters || {};
    const decay = params.decay || {};
    const vol = p.volatility || {};
    const sod = vol.slot_of_day || {};
    const wod = vol.week_of_day || {};
    const cons = p.constraints || {};
    const lowpad = cons.low_volume_padding || {};
    const meta = p.metadata || {};

    return `
      <div style="margin-bottom:8px;"><strong>Description:</strong> ${escapeHtml(p.description || "—")}</div>
      <div style="margin-top:8px;"><strong>Parameters:</strong></div>
      <ul style="margin:0 0 8px 16px; padding:0;">
        <li>Lookback weeks: ${params.lookback_weeks ?? "—"}</li>
        <li>Decay mode: ${escapeHtml(decay.mode || "—")}</li>
        ${
          decay.mode === "alpha"
            ? `<li>Alpha (α): ${n2(decay.alpha)}</li>`
            : decay.mode === "override"
            ? `<li>Override weights: [${(decay.override_weights || []).map(n2).join(", ")}]</li>`
            : ""
        }
      </ul>

      <div><strong>Volatility:</strong></div>
      <ul style="margin:0 0 8px 16px; padding:0;">
        <li>Slot of Day: ${sod.enabled ? "Enabled ✅" : "Disabled ❌"} ${
      sod.enabled
        ? `(λ=${n2(sod.lambda)}, floor=${n2(sod.trust_floor)}, ceil=${n2(
            sod.trust_ceiling
          )}, blend=${n2(sod.blend_global)})`
        : ""
    }</li>
        <li>Week of Day: ${wod.enabled ? "Enabled ✅" : "Disabled ❌"} ${
      wod.enabled
        ? `(λ=${n2(wod.lambda)}, floor=${n2(wod.trust_floor)}, ceil=${n2(
            wod.trust_ceiling
          )}, blend=${n2(wod.blend_global)})`
        : ""
    }</li>
      </ul>

      <div><strong>Constraints:</strong></div>
      <ul style="margin:0 0 8px 16px; padding:0;">
        <li>Min weeks required: ${cons.min_weeks_required ?? "—"}</li>
        <li>Low-volume padding: ${
          lowpad.enabled
            ? `Enabled (if &lt; ${lowpad.threshold_orders_lt} → floor ${lowpad.floor_orders_set_to})`
            : "Disabled"
        }</li>
      </ul>

      <div><strong>Metadata:</strong></div>
      <ul style="margin:0 0 8px 16px; padding:0;">
        <li>Created by: ${escapeHtml(meta.created_by || "—")}</li>
        <li>Created at: ${escapeHtml(formatDate(meta.created_at))}</li>
      </ul>

      <div><strong>Raw JSON:</strong></div>
    `;
  }

  function ensureTagCss() {
    if (document.getElementById("ud-strategy-tags-css")) return;
    const s = document.createElement("style");
    s.id = "ud-strategy-tags-css";
    s.textContent = `
      .tagrow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .tag { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:9999px;
             font-size:12px; font-weight:700; letter-spacing:.02em; }
      .tag-on  { background:rgba(16,185,129,.15); color:#065f46; border:1px solid rgba(16,185,129,.35); }
      .tag-off { background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0; }
    `;
    document.head.appendChild(s);
  }
}

  function startEditStrategy(item) {
    if (!item) return;

    const strategy = extractStrategyPayload(item);
    if (!strategy) {
      console.warn('Unable to determine strategy payload for edit.', item);
      return;
    }

    const bucket = item.bucket || item.Bucket || item.summary?.bucket;
    const key = item.key || item.Key || item.object_key || item.objectKey || item.summary?.key;
    const etag = item.etag || item.ETag || item.summary?.etag;
    if (!strategy.__s3 && (bucket || key || etag)) {
      strategy.__s3 = { bucket, key, etag };
    }

    navigate('create');

    if (window.UltradarStrategyForm && typeof window.UltradarStrategyForm.prefillForEdit === 'function') {
      window.UltradarStrategyForm.prefillForEdit(strategy);
      requestAnimationFrame(() => {
        const view = $(CREATE_VIEW_SELECTOR);
        if (view) view.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      console.warn('Strategy form module not ready for editing.');
    }
  }

  function extractStrategyPayload(item) {
    const base = unwrapPayload(item?.payload ?? item);
    if (!base || typeof base !== 'object') return null;

    const strategy = cloneStrategyData(base);

    if (!strategy.parameters && item?.parameters) {
      strategy.parameters = cloneStrategyData(item.parameters);
    }
    if (!strategy.volatility && item?.volatility) {
      strategy.volatility = cloneStrategyData(item.volatility);
    }
    if (!strategy.constraints && item?.constraints) {
      strategy.constraints = cloneStrategyData(item.constraints);
    }

    const fallbackName = item?.name || item?.summary?.name;
    if (fallbackName && !strategy.name) strategy.name = fallbackName;

    const fallbackId = item?.strategy_id || item?.summary?.strategy_id;
    if (fallbackId && !strategy.strategy_id) strategy.strategy_id = fallbackId;

    const fallbackDesc = item?.description || item?.summary?.description;
    if (fallbackDesc && !strategy.description) strategy.description = fallbackDesc;

    const outerMeta = item?.metadata || item?.summary?.metadata;
    if (outerMeta && typeof outerMeta === 'object') {
      strategy.metadata = { ...outerMeta, ...(strategy.metadata || {}) };
    }

    return strategy;
  }

  function unwrapPayload(value) {
    const seen = new Set();

    function dive(candidate) {
      if (!candidate) return null;

      if (typeof candidate === 'string') {
        const parsed = parseMaybeJson(candidate);
        return parsed ? dive(parsed) : null;
      }

      if (typeof candidate !== 'object') return null;
      if (seen.has(candidate)) return null;
      seen.add(candidate);

      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          const result = dive(entry);
          if (result) return result;
        }
        return null;
      }

      const nestedKeys = ['payload', 'Payload', 'body', 'Body', 'data', 'strategy', 'item'];
      for (const key of nestedKeys) {
        if (candidate[key] != null) {
          const nested = dive(candidate[key]);
          if (nested) return nested;
        }
      }

      return candidate;
    }

    return dive(value);
  }

  function parseMaybeJson(str) {
    try {
      return JSON.parse(str);
    } catch (err) {
      return null;
    }
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
