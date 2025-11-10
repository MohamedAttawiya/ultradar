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
  const EXCLUSIONS_URL = `${API_BASE}/exclusions?prefix=exclusions/`;

  const EDIT_VIEW_SELECTOR   = '.strategy-view[data-view="edit"]';
  const CREATE_VIEW_SELECTOR = '.strategy-view[data-view="create"]';
  const STRATEGY_LIST_ID     = 'strategy-list';
  const EXCLUSIONS_VIEW_SELECTOR = '.strategy-view[data-view="exclusions"]';
  const EXCLUSION_LIST_ID = 'exclusion-list';

  let strategiesLoaded = false;
  let strategiesLoading = false;
  let knownStrategies = [];
  let exclusionsInitialized = false;
  let exclusionsLoaded = false;
  let exclusionsLoading = false;
  let exclusionsData = [];
  let exclusionStylesAttached = false;
  let lastActiveView = null;
  let suppressNextHashChange = false;
  let loadRequestId = 0;
  let exclusionRequestId = 0;

  function currentFromHash(){
    const h = (location.hash || '').replace('#','');
    return VIEWS.includes(h) ? h : DEFAULT;
  }

  function activate(view, opts = {}){
    const previousView = lastActiveView;
    LINKS.forEach(a => {
      const on = a.dataset.view === view;
      a.classList.toggle('is-active', on);
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? -1 : 0;
    });
    PANELS.forEach(p => { p.dataset.state = (p.dataset.view === view) ? 'active' : ''; });

    if (view === 'edit') {
      const shouldForce = Boolean(opts.forceReload) || previousView !== 'edit';
      loadStrategies({ force: shouldForce });
    }
    if (view === 'create') mountForm();
    if (view === 'exclusions') {
      ensureExclusionStyles();
      ensureExclusionsInitialized();
      if (!strategiesLoaded && !strategiesLoading) {
        loadStrategies();
      }
      loadExclusions();
    }

    lastActiveView = view;
  }

  function navigate(view, opts = {}){
    if (!VIEWS.includes(view)) view = DEFAULT;
    const targetHash = '#' + view;
    if (targetHash !== location.hash) {
      suppressNextHashChange = true;
      location.hash = view;
    }
    activate(view, opts);
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
    <button class="btn-chip btn-edit" type="button" data-key="${escapeHtml(resolveStrategyKey(item) || '')}">Edit</button>
  </div>

  <div class="strategy-details" style="display:none; margin-top:8px; padding:10px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
    <div class="details-inner" style="font-size:13px; line-height:1.5; color:#0f172a;"></div>
    <pre class="strategy-json" style="display:none; margin:8px 0 0; padding:8px; background:#0b1220; color:#e5e7eb; border-radius:8px; max-height:240px; overflow:auto; font-size:12px;"></pre>
  </div>

  <div class="version-chip">v${escapeHtml(meta.version ?? p.version ?? 1)}</div>
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
        const key = editBtn.dataset.key || undefined;
        startEditStrategy(item, key);
      });
    }

    list.appendChild(li);
  });

  container.innerHTML = "";
  container.appendChild(list);

  captureStrategySummaries(listData);

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
	  .version-chip {
	  position: absolute;
	  bottom: 8px;
	  right: 10px;
	  background: #111827;
	  color: #fff;
	  font-size: 11px;
	  font-weight: 700;
	  border-radius: 12px;
	  padding: 3px 8px;
	  opacity: 0.85;
	}
	.strategy-card {
	  position: relative; /* ensures chip is positioned inside card */
	}
    `;
    document.head.appendChild(s);
  }
}

  function captureStrategySummaries(listData) {
    if (!Array.isArray(listData)) {
      knownStrategies = [];
      return;
    }
    const seen = new Map();
    listData.forEach((item) => {
      const summary = deriveStrategySummary(item);
      if (!summary) return;
      const key = summary.id != null ? String(summary.id) : (summary.name || "");
      if (!key) return;
      if (!seen.has(key)) {
        seen.set(key, summary);
      }
    });
    knownStrategies = Array.from(seen.values());
  }

  function deriveStrategySummary(item) {
    if (!item) return null;
    const payload = unwrapPayload(item?.payload ?? item) || {};
    const id = payload.strategy_id || payload.id || item.strategy_id || item.id || null;
    const name = payload.name || item.name || payload.title || null;
    if (id == null && !name) return null;
    return {
      id: id != null ? String(id) : null,
      name: name || null
    };
  }

  function findStrategyById(id) {
    if (id == null) return null;
    const idString = String(id);
    return knownStrategies.find((entry) => entry.id != null && String(entry.id) === idString) || null;
  }

  function findStrategyByName(name) {
    if (!name) return null;
    const target = String(name).toLowerCase();
    return knownStrategies.find((entry) => entry.name && entry.name.toLowerCase() === target) || null;
  }

  function ensureExclusionStyles() {
    if (exclusionStylesAttached) return;
    if (document.getElementById('ud-exclusions-css')) {
      exclusionStylesAttached = true;
      return;
    }
    try {
      const href = new URL('../css/exclusions-form.css', location.href).href;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.id = 'ud-exclusions-css';
      link.addEventListener('error', () => {
        exclusionStylesAttached = false;
        link.remove();
      });
      document.head.appendChild(link);
      exclusionStylesAttached = true;
    } catch (err) {
      console.error('Failed to attach exclusions stylesheet.', err);
    }
  }

  function ensureExclusionsInitialized() {
    if (exclusionsInitialized) return;
    const host = $(EXCLUSIONS_VIEW_SELECTOR);
    if (!host) return;
    const createBtn = host.querySelector('[data-action="create-exclusion"]');
    if (createBtn) {
      createBtn.addEventListener('click', (event) => {
        event.preventDefault();
        openExclusionWindow();
      });
    }
    const reloadBtn = host.querySelector('[data-action="reload-exclusions"]');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', (event) => {
        event.preventDefault();
        loadExclusions({ force: true });
      });
    }
    exclusionsInitialized = true;
  }

  function ensureExclusionListContainer() {
    const direct = document.getElementById(EXCLUSION_LIST_ID);
    if (direct) return direct;
    const host = $(EXCLUSIONS_VIEW_SELECTOR);
    if (!host) return null;
    return host.querySelector('#' + EXCLUSION_LIST_ID);
  }

  function renderExclusionStatus(message) {
    const container = ensureExclusionListContainer();
    if (!container) return;
    container.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
  }

  function normalizeExclusionPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    const keys = ['results', 'items', 'exclusions', 'data', 'body'];
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        const parsed = parseMaybeJson(value);
        if (Array.isArray(parsed)) return parsed;
      }
    }
    return [];
  }

  function toStringArray(value) {
    const result = [];
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (Array.isArray(entry)) {
          entry.forEach((inner) => {
            toStringArray(inner).forEach((token) => {
              if (!result.includes(token)) result.push(token);
            });
          });
        } else if (typeof entry === 'string') {
          entry.split(',').forEach((piece) => {
            const trimmed = piece.trim();
            if (trimmed && !result.includes(trimmed)) result.push(trimmed);
          });
        } else if (typeof entry === 'number') {
          const token = String(entry);
          if (!result.includes(token)) result.push(token);
        } else if (entry && typeof entry === 'object') {
          const candidate = entry.name || entry.store || entry.store_id || entry.id || entry.value || null;
          if (candidate != null) {
            const token = String(candidate);
            if (token && !result.includes(token)) result.push(token);
          }
        }
      });
      return result;
    }
    if (typeof value === 'string') {
      value.split(',').forEach((piece) => {
        const trimmed = piece.trim();
        if (trimmed && !result.includes(trimmed)) result.push(trimmed);
      });
      return result;
    }
    if (typeof value === 'number') {
      const token = String(value);
      if (!result.includes(token)) result.push(token);
    }
    return result;
  }

  function coerceDateArray(source) {
    const result = [];
    const candidate = source?.dates ?? source?.date ?? source?.date_range ?? source?.date_ranges ?? source?.period ?? source?.periods ?? source?.calendar ?? source?.schedule?.dates;
    (function collect(value) {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => collect(entry));
        return;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        toStringArray(value).forEach((token) => {
          if (!result.includes(token)) result.push(token);
        });
        return;
      }
      if (typeof value === 'object') {
        const start = value.start ?? value.from ?? value.begin ?? null;
        const end = value.end ?? value.to ?? value.finish ?? null;
        if (start || end) {
          const label = `${start || '—'} → ${end || '—'}`;
          if (!result.includes(label)) result.push(label);
        }
        if (value.date) collect(value.date);
        if (value.dates) collect(value.dates);
      }
    })(candidate);
    return result;
  }

  function coerceStoreTargets(source) {
    const candidate = source?.filters?.stores ?? source?.stores ?? source?.store_names ?? source?.store_ids ?? source?.storeIds ?? source?.attachments?.stores;
    return toStringArray(candidate);
  }

  function fillStrategySummary(entry) {
    if (!entry) return null;
    const partial = {
      id: entry.id ?? entry.strategy_id ?? entry.value ?? entry.key ?? null,
      name: entry.name ?? entry.label ?? entry.title ?? entry.text ?? null
    };
    if (partial.id != null) {
      const matchById = findStrategyById(partial.id);
      partial.id = String(partial.id);
      if (matchById) {
        partial.id = matchById.id != null ? String(matchById.id) : partial.id;
        if (!partial.name && matchById.name) {
          partial.name = matchById.name;
        }
      }
    }
    if (partial.name) {
      const trimmed = String(partial.name).trim();
      partial.name = trimmed;
    }
    if (!partial.id && partial.name) {
      const matchByName = findStrategyByName(partial.name);
      if (matchByName) {
        if (matchByName.id != null && !partial.id) partial.id = String(matchByName.id);
        if (matchByName.name && !partial.name) partial.name = matchByName.name;
      }
    }
    if (!partial.name && partial.id != null) {
      const matchId = findStrategyById(partial.id);
      if (matchId && matchId.name) partial.name = matchId.name;
    }
    if (!partial.id && !partial.name) return null;
    return {
      id: partial.id != null ? String(partial.id) : null,
      name: partial.name || null
    };
  }

  function coerceStrategyTargets(source) {
    const candidate = source?.filters?.strategies ?? source?.strategies ?? source?.strategy_ids ?? source?.strategyIds ?? source?.attachments?.strategies;
    if (!candidate) return [];
    const result = [];
    const push = (value) => {
      const summary = fillStrategySummary(value);
      if (!summary) return;
      const key = `${summary.id || ''}::${summary.name || ''}`.toLowerCase();
      for (const existing of result) {
        const existingKey = `${existing.id || ''}::${existing.name || ''}`.toLowerCase();
        if (existingKey === key) return;
      }
      result.push(summary);
    };
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        if (typeof item === 'string' || typeof item === 'number') {
          toStringArray(item).forEach((token) => push({ name: token }));
        } else if (item && typeof item === 'object') {
          push(item);
        }
      });
    } else if (typeof candidate === 'string' || typeof candidate === 'number') {
      toStringArray(candidate).forEach((token) => push({ name: token }));
    } else if (candidate && typeof candidate === 'object') {
      push(candidate);
    }
    return result;
  }

  function mapExclusion(entry) {
    if (!entry) return null;
    const base = unwrapPayload(entry?.payload ?? entry) || entry;
    const raw = cloneStrategyData(base || entry || {});
    if (!raw || typeof raw !== 'object') return null;
    const stores = coerceStoreTargets(raw);
    const strategies = coerceStrategyTargets(raw);
    const dates = coerceDateArray(raw);
    const createdAt = raw.created_at || raw.createdAt || raw.metadata?.created_at || entry.created_at || entry.createdAt || null;
    const id = raw.exclusion_id || raw.id || entry.exclusion_id || entry.id || null;
    const fallbackName = raw.name || raw.title || (stores.length ? `Store exclusion (${stores[0]}${stores.length > 1 ? ` +${stores.length - 1}` : ''})` : 'Global exclusion');
    const name = fallbackName ? String(fallbackName) : (id ? `Exclusion ${id}` : 'Exclusion');
    return {
      id: id != null ? String(id) : null,
      name,
      createdAt,
      dates,
      stores,
      strategies,
      raw
    };
  }

  async function loadExclusions({ force = false } = {}) {
    if (exclusionsLoading) return;
    if (exclusionsLoaded && !force) {
      renderExclusionsList();
      return;
    }
    const container = ensureExclusionListContainer();
    if (!container) return;
    exclusionsLoading = true;
    const requestId = ++exclusionRequestId;
    renderExclusionStatus('Loading exclusions…');
    try {
      const res = await fetch(EXCLUSIONS_URL, { headers: { 'Accept': 'application/json' } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let payload = text ? parseMaybeJson(text) : null;
      if (payload && typeof payload.body === 'string') {
        const nested = parseMaybeJson(payload.body);
        if (nested != null) payload = nested;
      }
      const normalized = normalizeExclusionPayload(payload);
      const mapped = normalized.map(mapExclusion).filter(Boolean);
      if (requestId === exclusionRequestId) {
        exclusionsData = mapped;
        exclusionsLoaded = true;
        if (!mapped.length) {
          renderExclusionStatus('No exclusions available yet. Use Create Exclusion to add one.');
        } else {
          renderExclusionsList();
        }
      }
    } catch (err) {
      console.info('Failed to load exclusions.', err);
      if (requestId === exclusionRequestId) {
        if (!exclusionsData.length) {
          renderExclusionStatus('Unable to load exclusions from the API. Create one to get started.');
        } else {
          renderExclusionsList();
        }
      }
    } finally {
      if (requestId === exclusionRequestId) {
        exclusionsLoading = false;
      }
    }
  }

  function renderExclusionsList() {
    const container = ensureExclusionListContainer();
    if (!container) return;
    if (!exclusionsData.length) {
      container.innerHTML = '<p class="muted">No exclusions available yet. Use Create Exclusion to add one.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    exclusionsData.forEach((entry, index) => {
      const card = document.createElement('article');
      card.className = 'exclusion-card';
      const createdText = entry.createdAt ? formatDate(entry.createdAt) : '—';
      const storeSummary = entry.stores && entry.stores.length ? entry.stores.join(', ') : 'Global';
      const strategySummary = entry.strategies && entry.strategies.length
        ? entry.strategies.map((s) => s.name || s.id).filter(Boolean).join(', ')
        : 'All strategies';
      const dateSummary = entry.dates && entry.dates.length ? entry.dates.join(', ') : '—';
      const rawPayload = entry.raw != null ? entry.raw : entry;
      card.innerHTML = `
        <div class="exclusion-card__header">
          <h5 class="exclusion-card__title">${escapeHtml(entry.name || `Exclusion ${index + 1}`)}</h5>
          <span class="muted" style="font-size:12px;">${escapeHtml(createdText || '—')}</span>
        </div>
        <dl class="exclusion-card__meta">
          <div><dt>ID</dt><dd>${escapeHtml(entry.id || '—')}</dd></div>
          <div><dt>Dates</dt><dd>${escapeHtml(dateSummary)}</dd></div>
          <div><dt>Stores</dt><dd>${escapeHtml(storeSummary)}</dd></div>
          <div><dt>Strategies</dt><dd>${escapeHtml(strategySummary)}</dd></div>
        </dl>
        <pre class="exclusion-card__json">${escapeHtml(JSON.stringify(rawPayload, null, 2))}</pre>
      `;
      frag.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  }

  function safePopupHref(relativePath) {
    try {
      const absolute = new URL(relativePath, location.href).href;
      return absolute.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    } catch (err) {
      return relativePath;
    }
  }

  function openExclusionWindow() {
    const width = 720;
    const height = 760;
    const left = typeof window.screenX === 'number' && typeof window.outerWidth === 'number'
      ? window.screenX + Math.max(0, (window.outerWidth - width) / 2)
      : 120;
    const top = typeof window.screenY === 'number' && typeof window.outerHeight === 'number'
      ? window.screenY + Math.max(0, (window.outerHeight - height) / 2)
      : 80;
    const specs = `width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`;
    const popup = window.open('', 'ultradar-exclusion-builder', specs);
    if (!popup) {
      alert('Please allow pop-ups to create exclusions.');
      return;
    }
    const doc = popup.document;
    const cssHref = safePopupHref('../css/exclusions-form.css');
    const strategiesPayload = JSON.stringify(knownStrategies || []).replace(/</g, '\\u003c');
    const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Create Exclusion</title>
  <link rel="stylesheet" href="${cssHref}">
</head>
<body class="body-exclusion-popup">
  <div class="exclusion-popup__frame" role="dialog" aria-modal="true">
    <header class="exclusion-popup__header">
      <h2>Create Exclusion</h2>
      <p class="exclusion-popup__hint">Select the days to exclude, choose filters, and generate the JSON payload.</p>
    </header>
    <main class="exclusion-popup__body">
      <section class="exclusion-popup__section" aria-labelledby="exclusion-calendar-title">
        <h3 id="exclusion-calendar-title">Calendar</h3>
        <div class="exclusion-popup__dates">
          <div>
            <label for="exclusion-date-input">Pick a date to add</label>
            <div class="exclusion-popup__date-row">
              <input id="exclusion-date-input" type="date" />
              <button class="btn" type="button" id="exclusion-add-date">Add date</button>
            </div>
            <p class="exclusion-popup__hint">Add multiple non-consecutive days if needed. Each click adds the selected day to the exclusion list.</p>
          </div>
          <div id="exclusion-date-chips" class="exclusion-popup__chips"></div>
        </div>
      </section>
      <section class="exclusion-popup__section" aria-labelledby="exclusion-filters-title">
        <h3 id="exclusion-filters-title">Filters</h3>
        <div class="exclusion-popup__filters">
          <label for="exclusion-store-field">
            <span>Attach to Store</span>
            <span class="exclusion-popup__hint">Write store names to apply exclusion on separated by "," - leave empty for global exclusion</span>
            <textarea id="exclusion-store-field" rows="2" placeholder="QDA3, QDA8"></textarea>
          </label>
          <label for="exclusion-strategy-select">
            <span>Attach to strategy</span>
            <select id="exclusion-strategy-select" multiple size="6"></select>
            <span class="exclusion-popup__hint">Select multiple strategies or leave empty to target all strategies.</span>
          </label>
        </div>
      </section>
    </main>
    <footer class="exclusion-popup__footer">
      <button class="btn" type="button" id="exclusion-generate">Generate .json</button>
      <pre id="exclusion-json-output">{
}</pre>
      <div class="exclusion-popup__hint" id="exclusion-popup-status">Select dates and filters, then generate the JSON payload.</div>
    </footer>
  </div>
  <script>
    (function(){
      const strategies = ${strategiesPayload};
      const doc = document;
      const dateInput = doc.getElementById('exclusion-date-input');
      const addDateBtn = doc.getElementById('exclusion-add-date');
      const chipsHost = doc.getElementById('exclusion-date-chips');
      const storeField = doc.getElementById('exclusion-store-field');
      const strategySelect = doc.getElementById('exclusion-strategy-select');
      const generateBtn = doc.getElementById('exclusion-generate');
      const jsonOutput = doc.getElementById('exclusion-json-output');
      const statusEl = doc.getElementById('exclusion-popup-status');
      const selectedDates = new Set();

      function notifyStatus(message) {
        if (statusEl) statusEl.textContent = message;
      }

      function renderStrategiesOptions() {
        if (!strategySelect) return;
        strategySelect.innerHTML = '';
        if (!Array.isArray(strategies) || !strategies.length) {
          const option = doc.createElement('option');
          option.disabled = true;
          option.textContent = 'No strategies available';
          strategySelect.appendChild(option);
          return;
        }
        strategies.forEach((entry) => {
          const option = doc.createElement('option');
          option.value = entry.id || entry.name || '';
          option.textContent = entry.name || entry.id || 'Unnamed strategy';
          if (entry.name) option.dataset.name = entry.name;
          if (entry.id != null) option.dataset.id = entry.id;
          strategySelect.appendChild(option);
        });
      }

      function renderDateChips() {
        if (!chipsHost) return;
        chipsHost.innerHTML = '';
        const values = Array.from(selectedDates).sort();
        if (!values.length) {
          const hint = doc.createElement('span');
          hint.className = 'exclusion-popup__hint';
          hint.textContent = 'No dates selected yet.';
          chipsHost.appendChild(hint);
          return;
        }
        values.forEach((value) => {
          const chip = doc.createElement('span');
          chip.className = 'exclusion-popup__chip';
          chip.textContent = value;
          const removeBtn = doc.createElement('button');
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', 'Remove ' + value);
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => {
            selectedDates.delete(value);
            renderDateChips();
          });
          chip.appendChild(removeBtn);
          chipsHost.appendChild(chip);
        });
      }

      function addDateFromInput() {
        if (!dateInput) return;
        const value = dateInput.value;
        if (!value) {
          notifyStatus('Select a date before adding it to the exclusion.');
          return;
        }
        selectedDates.add(value);
        dateInput.value = '';
        renderDateChips();
      }

      if (addDateBtn) {
        addDateBtn.addEventListener('click', (event) => {
          event.preventDefault();
          addDateFromInput();
        });
      }
      if (dateInput) {
        dateInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addDateFromInput();
          }
        });
      }

      if (generateBtn) {
        generateBtn.addEventListener('click', () => {
          if (!selectedDates.size) {
            notifyStatus('Please add at least one date before generating the JSON payload.');
            return;
          }
          const storeValue = (storeField && storeField.value ? storeField.value : '').trim();
          const storeNames = storeValue ? storeValue.split(',').map((part) => part.trim()).filter(Boolean) : [];
          const strategyOptions = strategySelect ? Array.from(strategySelect.selectedOptions) : [];
          const selectedStrategies = strategyOptions.map((opt) => ({
            id: opt.dataset.id || opt.value || null,
            name: opt.dataset.name || opt.textContent || opt.value || null
          })).filter((entry) => entry.id || entry.name);
          const payload = {
            name: storeNames.length ? 'Store exclusion' : 'Global exclusion',
            description: 'Manual exclusion generated from the Strategies page.',
            exclusion_id: 'temp-' + Date.now(),
            created_at: new Date().toISOString(),
            dates: Array.from(selectedDates),
            filters: {
              stores: storeNames,
              strategies: selectedStrategies
            }
          };
          jsonOutput.textContent = JSON.stringify(payload, null, 2);
          let pushed = false;
          try {
            if (window.opener && !window.opener.closed && window.opener.UltradarExclusions && typeof window.opener.UltradarExclusions.createExclusion === 'function') {
              window.opener.UltradarExclusions.createExclusion(payload);
              pushed = true;
            }
          } catch (err) {
            console.error('Failed to notify Ultradar about the new exclusion.', err);
          }
          notifyStatus(pushed ? 'JSON generated and sent to Ultradar.' : 'JSON generated. Copy it or keep this window open.');
        });
      }

      renderStrategiesOptions();
      renderDateChips();
    })();
  <\/script>
</body>
</html>`;
    doc.open();
    doc.write(html);
    doc.close();
    popup.focus();
  }

  function applyCreatedExclusion(definition) {
    const normalized = mapExclusion(definition);
    if (!normalized) return;
    if (!normalized.raw) {
      normalized.raw = cloneStrategyData(definition);
    }
    const id = normalized.id;
    if (id) {
      const existingIndex = exclusionsData.findIndex((item) => item.id === id);
      if (existingIndex >= 0) {
        exclusionsData[existingIndex] = normalized;
      } else {
        exclusionsData.unshift(normalized);
      }
    } else {
      exclusionsData.unshift(normalized);
    }
    exclusionsLoaded = true;
    renderExclusionsList();
  }

  async function startEditStrategy(item, keyHint) {
    const formModule = window.UltradarStrategyForm;
    const key = keyHint || resolveStrategyKey(item);
    if (!key) {
      console.warn('Edit requested but no S3 key was present.', item);
      if (formModule && typeof formModule.showError === 'function') {
        formModule.showError('Failed to load strategy.');
      }
      return;
    }

    navigate('create');

    if (formModule && typeof formModule.showLoading === 'function') {
      formModule.showLoading('Loading strategy…');
    }

    try {
      const url = `${API_BASE}/strategy?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          console.warn('Failed to parse strategy response JSON.', err);
          data = { payload: parseMaybeJson(text) || null };
        }
      }
      if (!res.ok) {
        const errMsg = data?.error || text || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      if (data && typeof data.body === 'string') {
        const parsedBody = parseMaybeJson(data.body);
        if (parsedBody) data = parsedBody;
      }

      let payload = data?.payload ?? data?.strategy ?? data?.item ?? null;
      if (payload && typeof payload === 'string') {
        payload = parseMaybeJson(payload);
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('Missing payload');
      }

      const strategy = cloneStrategyData(payload);
      const fallback = extractStrategyPayload(item) || {};

      if (fallback.metadata) {
        const fallbackMeta = cloneStrategyData(fallback.metadata);
        strategy.metadata = { ...fallbackMeta, ...(strategy.metadata || {}) };
      }
      if (!strategy.parameters && fallback.parameters) strategy.parameters = cloneStrategyData(fallback.parameters);
      if (!strategy.volatility && fallback.volatility) strategy.volatility = cloneStrategyData(fallback.volatility);
      if (!strategy.constraints && fallback.constraints) strategy.constraints = cloneStrategyData(fallback.constraints);
      if (!strategy.name && fallback.name) strategy.name = fallback.name;
      if (!strategy.strategy_id && fallback.strategy_id) strategy.strategy_id = fallback.strategy_id;
      if (!strategy.description && fallback.description) strategy.description = fallback.description;

      const bucket = data.bucket || fallback?.__s3?.bucket || item?.bucket || item?.Bucket || item?.summary?.bucket || null;
      const etag = data.etag || fallback?.__s3?.etag || item?.etag || item?.ETag || item?.summary?.etag || null;
      strategy.__s3 = { bucket, key: data.key || key, etag };

      if (formModule && typeof formModule.load === 'function') {
        formModule.load(strategy);
      } else {
        console.warn('Strategy form module not ready for editing.');
      }
    } catch (err) {
      console.error('Failed to load strategy.', err);
      if (formModule && typeof formModule.showError === 'function') {
        formModule.showError('Failed to load strategy.');
      } else {
        alert('Failed to load strategy.');
      }
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

  function resolveStrategyKey(item) {
    if (!item) return null;
    return (
      item.key ||
      item.Key ||
      item.object_key ||
      item.objectKey ||
      item.summary?.key ||
      item.payload?.key ||
      null
    );
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

  async function loadStrategies({ force = false } = {}){
    const container = ensureStrategyContainer();
    if (!container || strategiesLoading) return;
    if (!force && strategiesLoaded) return;

    strategiesLoading = true;
    if (force) strategiesLoaded = false;
    const requestId = ++loadRequestId;
    renderStatus('Loading strategies…');
    try {
      const res = await fetch(STRATEGIES_URL, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let payload = await res.json();
      if (payload && typeof payload.body === 'string') { try { payload = JSON.parse(payload.body); } catch {} }
      const strategies = normalizeStrategies(payload);
      if (requestId === loadRequestId) {
        renderStrategies(strategies);
        strategiesLoaded = true;
      }
    } catch (e) {
      console.error('Failed to load strategies.', e);
      renderStatus('Failed to load strategies.');
    } finally {
      if (requestId === loadRequestId) {
        strategiesLoading = false;
      }
    }
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
  const hasExplicitHash = Boolean(location.hash);
  const start = hasExplicitHash ? currentFromHash() : (VIEWS.includes(saved) ? saved : currentFromHash());
  activate(start);
  window.addEventListener('hashchange', () => {
    if (suppressNextHashChange) {
      suppressNextHashChange = false;
      return;
    }
    activate(currentFromHash());
  });

  window.UltradarStrategies = Object.assign(window.UltradarStrategies || {}, {
    goToEditAndReload() {
      navigate('edit', { forceReload: true });
    },
    reloadEdit() {
      loadStrategies({ force: true });
    }
  });

  window.UltradarExclusions = Object.assign(window.UltradarExclusions || {}, {
    createExclusion: applyCreatedExclusion,
    getKnownStrategies() {
      return knownStrategies.slice();
    }
  });
})();
