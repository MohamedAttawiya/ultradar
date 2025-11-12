(function () {
  const Strategies = window.UltradarStrategies || {};
  const apiConfig = window.UltradarApi;
  if (!apiConfig) {
    console.error('Ultradar API configuration is missing. Exclusion builder cannot load data.');
    return;
  }
  const STRATEGY_CATALOG_URL = apiConfig.endpoint('strategies');
  const EXCLUSIONS_URL = apiConfig.endpoint('exclusionsList');
  const CREATE_EXCLUSION_URL = apiConfig.endpoint('exclusions');
  const EXCLUSIONS_VIEW_SELECTOR = '.strategy-view[data-view="exclusions"]';
  const EXCLUSION_LIST_ID = 'exclusion-list';

  const escapeHtml = typeof Strategies.escapeHtml === 'function'
    ? Strategies.escapeHtml
    : (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

  const formatDate = typeof Strategies.formatDate === 'function'
    ? Strategies.formatDate
    : (value) => {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      };

  const parseMaybeJson = typeof Strategies.parseMaybeJson === 'function'
    ? Strategies.parseMaybeJson
    : (str) => {
        try {
          return JSON.parse(str);
        } catch (err) {
          return null;
        }
      };

  const cloneStrategyData = typeof Strategies.cloneStrategyData === 'function'
    ? Strategies.cloneStrategyData
    : (obj) => {
        if (obj == null) return null;
        try {
          return JSON.parse(JSON.stringify(obj));
        } catch (err) {
          return obj;
        }
      };

  const normalizeStrategies = typeof Strategies.normalizeStrategies === 'function'
    ? Strategies.normalizeStrategies
    : (payload) => (Array.isArray(payload) ? payload : []);

  const deriveStrategySummary = typeof Strategies.deriveStrategySummary === 'function'
    ? Strategies.deriveStrategySummary
    : (() => null);

  const appendKnownStrategies = typeof Strategies.appendKnownStrategies === 'function'
    ? Strategies.appendKnownStrategies
    : (() => {});

  const findStrategyById = typeof Strategies.findStrategyById === 'function'
    ? Strategies.findStrategyById
    : (() => null);

  const findStrategyByName = typeof Strategies.findStrategyByName === 'function'
    ? Strategies.findStrategyByName
    : (() => null);

  const unwrapPayload = typeof Strategies.unwrapPayload === 'function'
    ? Strategies.unwrapPayload
    : ((value) => value);

  const ensureStrategiesLoaded = typeof Strategies.ensureStrategiesLoaded === 'function'
    ? Strategies.ensureStrategiesLoaded
    : (() => {});

  let exclusionsInitialized = false;
  let exclusionsLoaded = false;
  let exclusionsLoading = false;
  let exclusionsData = [];
  let exclusionRequestId = 0;
  let strategyCatalogCache = null;
  let strategyCatalogPromise = null;

  const $ = (selector, root = document) => root.querySelector(selector);

  function ensureExclusionsInitialized() {
    if (exclusionsInitialized) return;
    const host = $(EXCLUSIONS_VIEW_SELECTOR);
    if (!host) return;
    const createBtn = host.querySelector('[data-action="create-exclusion"]');
    if (createBtn) {
      createBtn.addEventListener('click', (event) => {
        event.preventDefault();
        openExclusionDialog();
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
    if (!value) return result;
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
      `;
      frag.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  }

  async function fetchStrategyCatalog() {
    if (Array.isArray(strategyCatalogCache)) {
      return strategyCatalogCache;
    }
    if (strategyCatalogPromise) {
      return strategyCatalogPromise;
    }

    strategyCatalogPromise = (async () => {
      try {
        const res = await fetch(STRATEGY_CATALOG_URL, { headers: { 'Accept': 'application/json' } });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let payload = text ? parseMaybeJson(text) : null;
        if (payload && typeof payload.body === 'string') {
          const nested = parseMaybeJson(payload.body);
          if (nested != null) payload = nested;
        }
        const normalized = normalizeStrategies(payload);
        const list = Array.isArray(normalized) ? normalized.filter(Boolean) : [];
        if (list.length) appendKnownStrategies(list);
        strategyCatalogCache = list;
        return list;
      } catch (err) {
        strategyCatalogCache = null;
        throw err;
      } finally {
        strategyCatalogPromise = null;
      }
    })();

    return strategyCatalogPromise;
  }

  function openExclusionDialog() {
    if (document.querySelector('.exclusion-modal')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'exclusion-modal';
    overlay.innerHTML = `
      <div class="exclusion-modal__backdrop" data-action="close-exclusion"></div>
      <div class="exclusion-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="exclusion-modal-title">
        <div class="exclusion-popup__frame">
          <header class="exclusion-popup__header">
            <div class="exclusion-popup__header-row">
              <h2 id="exclusion-modal-title">Create Exclusion</h2>
              <button class="exclusion-popup__close" type="button" data-action="close-exclusion" aria-label="Close exclusion builder">×</button>
            </div>
            <p class="exclusion-popup__hint">Select consecutive days, choose filters, and create the exclusion.</p>
          </header>
          <main class="exclusion-popup__body">
            <section class="exclusion-popup__section" aria-labelledby="exclusion-details-title">
              <h3 id="exclusion-details-title">Details</h3>
              <div class="exclusion-popup__filters">
                <label for="exclusion-name-field">
                  <span>Name</span>
                  <input id="exclusion-name-field" type="text" placeholder="My exclusion" />
                </label>
                <label for="exclusion-description-field">
                  <span>Description</span>
                  <textarea id="exclusion-description-field" rows="3" placeholder="Why this exclusion exists"></textarea>
                </label>
              </div>
            </section>
            <section class="exclusion-popup__section" aria-labelledby="exclusion-calendar-title">
              <h3 id="exclusion-calendar-title">Calendar</h3>
              <div class="exclusion-popup__dates">
                <div>
                  <label for="exclusion-date-input">Pick a day to add</label>
                  <div class="exclusion-popup__date-row">
                    <input id="exclusion-date-input" type="date" />
                    <button class="btn" type="button" id="exclusion-add-date">Add day</button>
                  </div>
                  <p class="exclusion-popup__hint">Add each day in order. Only consecutive ranges are supported.</p>
                  <div class="exclusion-date-summary" id="exclusion-date-summary">No dates selected yet.</div>
                </div>
                <div id="exclusion-date-chips" class="exclusion-popup__chips"></div>
              </div>
            </section>
            <section class="exclusion-popup__section" aria-labelledby="exclusion-filters-title">
              <h3 id="exclusion-filters-title">Filters</h3>
              <div class="exclusion-popup__filters">
                <label for="exclusion-store-field">
                  <span>Attach to Store</span>
                  <span class="exclusion-popup__hint">Write store names to apply exclusion on separated by \",\" - leave empty for global exclusion</span>
                  <textarea id="exclusion-store-field" rows="2" placeholder="QDA3, QDA8"></textarea>
                </label>
                <div class="exclusion-strategy-picker">
                  <span class="exclusion-strategy-picker__label">Attach to strategy</span>
                  <span class="exclusion-popup__hint">Select one or more strategies or leave all unchecked to target all strategies.</span>
                  <div class="exclusion-strategy-picker__status" id="exclusion-strategy-status">Loading strategies…</div>
                  <div class="exclusion-strategy-picker__grid" id="exclusion-strategy-cards" role="listbox" aria-multiselectable="true"></div>
                  <div class="exclusion-strategy-summary" id="exclusion-strategy-summary">Applies to all strategies.</div>
                </div>
              </div>
            </section>
          </main>
          <footer class="exclusion-popup__footer">
            <button class="btn" type="button" id="exclusion-create">Create exclusion</button>
            <div class="exclusion-popup__hint" id="exclusion-popup-status">Select dates and filters, then create the exclusion.</div>
          </footer>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('exclusion-modal-open');

    const dialog = overlay.querySelector('.exclusion-modal__dialog');
    if (dialog) {
      dialog.setAttribute('tabindex', '-1');
      dialog.focus({ preventScroll: true });
    }

    const dateInput = overlay.querySelector('#exclusion-date-input');
    const addDateBtn = overlay.querySelector('#exclusion-add-date');
    const chipsHost = overlay.querySelector('#exclusion-date-chips');
    const dateSummaryEl = overlay.querySelector('#exclusion-date-summary');
    const nameField = overlay.querySelector('#exclusion-name-field');
    const descriptionField = overlay.querySelector('#exclusion-description-field');
    const storeField = overlay.querySelector('#exclusion-store-field');
    const createBtn = overlay.querySelector('#exclusion-create');
    const statusEl = overlay.querySelector('#exclusion-popup-status');
    const strategyCardsHost = overlay.querySelector('#exclusion-strategy-cards');
    const strategyStatusEl = overlay.querySelector('#exclusion-strategy-status');
    const strategySummaryEl = overlay.querySelector('#exclusion-strategy-summary');

    const selectedDates = new Set();

    function closeDialog() {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('exclusion-modal-open');
      overlay.remove();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target?.dataset?.action === 'close-exclusion') {
        event.preventDefault();
        closeDialog();
      }
    });

    const closeButtons = overlay.querySelectorAll('[data-action="close-exclusion"]');
    closeButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        closeDialog();
      });
    });

    document.addEventListener('keydown', onKeyDown, true);

    function notifyStatus(message) {
      if (!statusEl) return;
      statusEl.textContent = message;
    }

    function setStrategyStatus(message) {
      if (!strategyStatusEl) return;
      strategyStatusEl.textContent = message;
    }

    function setSubmitting(state) {
      if (!createBtn) return;
      createBtn.disabled = state;
      if (state) {
        createBtn.textContent = 'Creating…';
      } else {
        createBtn.textContent = 'Create exclusion';
      }
    }

    function createUuid() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
          return crypto.randomUUID();
        } catch (err) {}
      }
      return `exclusion-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }

    function renderDateChips() {
      if (!chipsHost) return;
      chipsHost.innerHTML = '';
      const sorted = getSortedDates();
      if (!sorted.length) {
        if (dateSummaryEl) dateSummaryEl.textContent = 'No dates selected yet.';
        const hint = document.createElement('div');
        hint.className = 'exclusion-popup__hint';
        hint.textContent = 'Add days using the picker to build the exclusion range.';
        chipsHost.appendChild(hint);
        return;
      }
      if (dateSummaryEl) {
        if (sorted.length === 1) {
          dateSummaryEl.textContent = `Selected ${sorted[0]}`;
        } else {
          dateSummaryEl.textContent = `${sorted.length} days selected (${sorted[0]} → ${sorted[sorted.length - 1]})`;
        }
      }
      sorted.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'exclusion-popup__chip';
        chip.innerHTML = `${escapeHtml(value)} <button type="button" aria-label="Remove">×</button>`;
        const btn = chip.querySelector('button');
        if (btn) {
          btn.addEventListener('click', (event) => {
            event.preventDefault();
            selectedDates.delete(value);
            renderDateChips();
            notifyStatus('Date removed.');
          });
        }
        chipsHost.appendChild(chip);
      });
    }

    function getSortedDates() {
      return Array.from(selectedDates).sort();
    }

    function addDateFromInput() {
      if (!dateInput) return;
      const value = dateInput.value;
      if (!value) {
        notifyStatus('Select a date before adding it to the exclusion.');
        return;
      }
      const normalized = value.trim();
      if (!/\d{4}-\d{2}-\d{2}/.test(normalized)) {
        notifyStatus('Use a valid date in the format YYYY-MM-DD.');
        return;
      }
      selectedDates.add(normalized);
      const sorted = getSortedDates();
      if (sorted.length >= 2) {
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const expected = new Date(first);
        let isConsecutive = true;
        for (let i = 1; i < sorted.length; i += 1) {
          expected.setDate(expected.getDate() + 1);
          const expectedIso = expected.toISOString().slice(0, 10);
          if (sorted[i] !== expectedIso) {
            isConsecutive = false;
            break;
          }
        }
        if (!isConsecutive) {
          selectedDates.delete(value);
          notifyStatus('Only consecutive days can be added. Pick the next day in sequence.');
          return;
        }
      }
      dateInput.value = '';
      renderDateChips();
      notifyStatus(sorted.length === 1 ? 'One day selected.' : `${sorted.length} days selected.`);
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

    function createStrategyCard(item) {
      if (!strategyCardsHost) return null;
      const summary = deriveStrategySummary(item);
      if (!summary) return null;
      const strategyId = summary.id || null;
      const name = summary.name || (strategyId ? `Strategy ${strategyId}` : 'Unnamed strategy');
      const version = item?.version != null ? item.version : item?.payload?.version ?? null;
      const key = item?.key || item?.strategy_key || item?.object_key || item?.payload?.key || null;
      const lastModified = item?.lastModified || item?.last_modified || null;

      const card = document.createElement('div');
      card.className = 'exclusion-strategy-card';
      card.setAttribute('role', 'option');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-selected', 'false');
      card.dataset.value = strategyId || name;
      if (strategyId) card.dataset.strategyId = strategyId;
      if (name) card.dataset.name = name;
      if (key) card.dataset.key = key;
      if (version != null) card.dataset.version = String(version);
      if (lastModified) card.dataset.lastModified = lastModified;

      const body = document.createElement('div');
      body.className = 'exclusion-strategy-card__body';

      const header = document.createElement('div');
      header.className = 'exclusion-strategy-card__header';

      const title = document.createElement('h4');
      title.className = 'exclusion-strategy-card__title';
      title.textContent = name;
      header.appendChild(title);

      if (version != null) {
        const versionBadge = document.createElement('span');
        versionBadge.className = 'exclusion-strategy-card__version';
        versionBadge.textContent = `v${version}`;
        header.appendChild(versionBadge);
      }

      body.appendChild(header);

      const meta = document.createElement('dl');
      meta.className = 'exclusion-strategy-card__meta';

      if (strategyId) {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = 'ID';
        const dd = document.createElement('dd');
        dd.textContent = strategyId;
        row.appendChild(dt);
        row.appendChild(dd);
        meta.appendChild(row);
      }

      if (lastModified) {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = 'Updated';
        const dd = document.createElement('dd');
        dd.textContent = formatDate(lastModified);
        row.appendChild(dt);
        row.appendChild(dd);
        meta.appendChild(row);
      }

      body.appendChild(meta);
      card.appendChild(body);

      function toggleSelection() {
        const shouldSelect = !card.classList.contains('is-selected');
        card.classList.toggle('is-selected', shouldSelect);
        card.setAttribute('aria-selected', shouldSelect ? 'true' : 'false');
        updateStrategySummary();
      }

      card.addEventListener('click', (event) => {
        if (event.target.closest('button, a, input, textarea, select')) return;
        toggleSelection();
      });

      card.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggleSelection();
        }
      });

      return card;
    }

    function renderStrategyCards(list) {
      if (!strategyCardsHost) return;
      strategyCardsHost.innerHTML = '';
      if (!Array.isArray(list) || !list.length) {
        return;
      }
      list.forEach((item) => {
        const card = createStrategyCard(item);
        if (card) strategyCardsHost.appendChild(card);
      });
    }

    function getSelectedStrategyCards() {
      if (!strategyCardsHost) return [];
      return Array.from(strategyCardsHost.querySelectorAll('.exclusion-strategy-card.is-selected'));
    }

    function updateStrategySummary() {
      if (!strategySummaryEl) return;
      const selectedCards = getSelectedStrategyCards();
      if (!selectedCards.length) {
        strategySummaryEl.textContent = 'Applies to all strategies.';
        return;
      }
      const names = selectedCards.map((card) => card.dataset.name || card.dataset.strategyId || card.dataset.value || 'Strategy');
      const preview = names.slice(0, 3).join(', ');
      strategySummaryEl.textContent = names.length > 3 ? `${names.length} selected: ${preview}…` : `${names.length} selected: ${preview}`;
    }

    function getSelectedStrategyData() {
      return getSelectedStrategyCards().map((card) => {
        const entry = {};
        const strategyId = card.dataset.strategyId || '';
        const name = card.dataset.name || '';
        const key = card.dataset.key || '';
        const versionRaw = card.dataset.version || '';
        const lastModified = card.dataset.lastModified || '';
        if (strategyId) entry.strategy_id = strategyId;
        if (name) entry.name = name;
        if (key) entry.key = key;
        if (versionRaw) {
          const numeric = Number(versionRaw);
          if (!Number.isNaN(numeric)) entry.version = numeric;
        }
        if (lastModified) entry.lastModified = lastModified;
        return entry;
      }).filter((entry) => Object.keys(entry).length > 0);
    }

    function ensureStrategyCards() {
      const cached = Array.isArray(strategyCatalogCache) ? strategyCatalogCache : null;
      if (cached) {
        renderStrategyCards(cached);
        setStrategyStatus(cached.length ? 'Select one or more strategies or leave all unchecked to target all strategies.' : 'No strategies available.');
        updateStrategySummary();
      } else {
        setStrategyStatus('Loading strategies…');
      }

      fetchStrategyCatalog()
        .then((list) => {
          const safeList = Array.isArray(list) ? list : [];
          renderStrategyCards(safeList);
          setStrategyStatus(safeList.length ? 'Select one or more strategies or leave all unchecked to target all strategies.' : 'No strategies available.');
          updateStrategySummary();
        })
        .catch((err) => {
          console.error('Failed to load strategy catalog for exclusions.', err);
          if (!cached || !cached.length) {
            setStrategyStatus('Failed to load strategies.');
          }
        });
    }

    let isSubmitting = false;

    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const sortedDates = getSortedDates();
        if (!sortedDates.length) {
          notifyStatus('Please add at least one date before creating the exclusion.');
          return;
        }
        if (isSubmitting) return;
        const nameValue = nameField && nameField.value ? nameField.value.trim() : '';
        const descriptionValue = descriptionField && descriptionField.value ? descriptionField.value.trim() : '';
        const storeValue = (storeField && storeField.value ? storeField.value : '').trim();
        const storeNames = storeValue ? storeValue.split(',').map((part) => part.trim()).filter(Boolean) : [];
        const selectedStrategies = getSelectedStrategyData();
        const payload = {
          name: nameValue || (storeNames.length ? 'Store exclusion' : 'Global exclusion'),
          description: descriptionValue || 'Manual exclusion generated from the Strategies page.',
          exclusion_id: createUuid(),
          created_at: new Date().toISOString(),
          dates: sortedDates,
          filters: {
            stores: storeNames,
            strategies: selectedStrategies
          }
        };
        try {
          isSubmitting = true;
          setSubmitting(true);
          notifyStatus('Creating exclusion…');
          const res = await fetch(CREATE_EXCLUSION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          const text = await res.text();
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          let responseBody = text ? parseMaybeJson(text) : null;
          if (responseBody && typeof responseBody.body === 'string') {
            const nested = parseMaybeJson(responseBody.body);
            if (nested != null) responseBody = nested;
          }
          let created = null;
          if (responseBody && typeof responseBody === 'object') {
            if (Array.isArray(responseBody)) {
              created = responseBody[0] || null;
            } else if (responseBody.exclusion) {
              created = responseBody.exclusion;
            } else {
              created = responseBody;
            }
          }
          applyCreatedExclusion(created || payload);
          notifyStatus('Exclusion created successfully.');
          await loadExclusions({ force: true });
          closeDialog();
        } catch (err) {
          console.error('Failed to create exclusion.', err);
          const message = err && err.message ? err.message : 'Please try again.';
          notifyStatus(`Failed to create exclusion. ${message}`);
        } finally {
          isSubmitting = false;
          setSubmitting(false);
        }
      });
    }

    renderDateChips();
    ensureStrategyCards();
    updateStrategySummary();
    notifyStatus('Select dates and filters, then create the exclusion.');
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

  function activate() {
    ensureExclusionsInitialized();
    ensureStrategiesLoaded();
    loadExclusions();
  }

  window.UltradarExclusions = Object.assign(window.UltradarExclusions || {}, {
    activate,
    reload: () => loadExclusions({ force: true }),
    createExclusion: applyCreatedExclusion
  });
})();
