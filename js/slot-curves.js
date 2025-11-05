(function () {
  const DAY_ORDER = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  const sanitizeWeek = (value) => {
    const num = Number(value);
    if (Number.isFinite(num)) {
      if (num < 1) return 1;
      if (num > 53) return 53;
      return Math.round(num);
    }
    return null;
  };

  const getCurrentISOWeek = () => {
    const now = new Date();
    const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const diff = target - yearStart;
    return Math.ceil(((diff / 86400000) + 1) / 7);
  };

  const getCountry = () => {
    const root = document.documentElement.getAttribute('data-country');
    if (root) return root;
    const meta = document.querySelector('meta[name="ultradar-country"]');
    return meta?.content || 'AE';
  };

  const parseIntervalValue = (interval) => {
    if (!interval) return 0;
    const [start] = interval.split(' - ');
    if (!start) return 0;
    const [hours, minutes] = start.split(':').map((part) => parseInt(part, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  };

  const formatPercent = (value) => {
    const pct = Number(value) * 100;
    if (!Number.isFinite(pct)) return '0.0%';
    return `${pct.toFixed(pct >= 10 ? 1 : 2)}%`;
  };

  const colorForValue = (value, max) => {
    if (!max || max <= 0 || !Number.isFinite(value)) {
      return { background: '#f8fafc', ink: 'var(--ink)' };
    }
    const ratio = Math.max(0, Math.min(1, value / max));
    const hue = 214 - ratio * 34; // blue to indigo shift
    const saturation = 50 + ratio * 40;
    const lightness = 94 - ratio * 50;
    const background = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const ink = ratio > 0.6 ? '#ffffff' : 'var(--ink)';
    return { background, ink };
  };

  const normalisePayload = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (typeof payload === 'object') return [payload];
    return [];
  };

  const buildStoreGroups = (records) => {
    const storeMap = new Map();
    const intervalSet = new Set();
    const daySet = new Set();
    const extraDaySet = new Set();

    records.forEach((record) => {
      if (!record) return;
      const store = record.store_name || 'Unnamed Store';
      const day = record.day_of_week || '';
      const interval = record.time_interval || '';
      const value = Number(record.pct_of_day ?? 0) || 0;

      if (!storeMap.has(store)) {
        storeMap.set(store, []);
      }

      storeMap.get(store).push({ day, interval, value });
      if (DAY_ORDER.includes(day)) {
        daySet.add(day);
      } else if (day) {
        extraDaySet.add(day);
      }
      if (interval) {
        intervalSet.add(interval);
      }
    });

    const intervals = Array.from(intervalSet);
    intervals.sort((a, b) => parseIntervalValue(a) - parseIntervalValue(b));

    const days = DAY_ORDER.filter((day) => daySet.has(day));
    if (extraDaySet.size) {
      const extras = Array.from(extraDaySet).sort();
      days.push(...extras);
    }

    const stores = Array.from(storeMap.entries()).map(([storeName, entries]) => ({
      storeName,
      entries
    }));

    return { stores, intervals, days };
  };

  const ready = () => {
    const form = document.getElementById('slotCurvesWeekForm');
    const weekInput = document.getElementById('slotCurvesWeek');
    const message = document.getElementById('slotCurvesMessage');
    const legend = document.getElementById('slotCurvesLegend');
    const container = document.getElementById('slotCurvesHeatmaps');

    if (!form || !weekInput || !container) return;

    const state = {
      abortController: null,
      lastWeek: null,
      lastCountry: null
    };

    const setStatus = (text, variant) => {
      if (!message) return;
      if (!text) {
        message.textContent = '';
        message.removeAttribute('data-state');
        return;
      }
      message.textContent = text;
      message.dataset.state = variant || 'info';
    };

    const clearHeatmaps = () => {
      container.innerHTML = '';
    };

    const renderHeatmaps = (groups, intervals, days, context) => {
      clearHeatmaps();
      if (!legend) return;
      if (!groups.length || !intervals.length || !days.length) {
        legend.hidden = true;
        return;
      }

      legend.hidden = false;

      let globalMax = 0;
      groups.forEach(({ entries }) => {
        entries.forEach(({ value }) => {
          if (value > globalMax) {
            globalMax = value;
          }
        });
      });

      const frag = document.createDocumentFragment();

      groups.forEach(({ storeName, entries }) => {
        const card = document.createElement('article');
        card.className = 'heatmap-card';
        card.setAttribute('role', 'listitem');

        const title = document.createElement('h3');
        title.className = 'heatmap-card__title';
        title.textContent = storeName;
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'heatmap-card__subtitle';
        subtitle.textContent = `Week ${context.week} • ${context.country}`;
        card.appendChild(subtitle);

        const tableWrap = document.createElement('div');
        tableWrap.className = 'heatmap-card__body';

        const table = document.createElement('table');
        table.className = 'heatmap-table';
        table.setAttribute('aria-label', `Slot curve distribution for ${storeName} in week ${context.week} for ${context.country}`);

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');

        const intervalHead = document.createElement('th');
        intervalHead.scope = 'col';
        intervalHead.textContent = 'Interval';
        headRow.appendChild(intervalHead);

        days.forEach((day) => {
          const th = document.createElement('th');
          th.scope = 'col';
          th.textContent = day;
          headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const lookup = new Map();
        entries.forEach(({ day, interval, value }) => {
          lookup.set(`${day}__${interval}`, value);
        });

        intervals.forEach((interval) => {
          const row = document.createElement('tr');
          const rowHeader = document.createElement('th');
          rowHeader.scope = 'row';
          rowHeader.textContent = interval || '—';
          row.appendChild(rowHeader);

          days.forEach((day) => {
            const td = document.createElement('td');
            const value = lookup.get(`${day}__${interval}`) || 0;
            const { background, ink } = colorForValue(value, globalMax);

            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.setProperty('--cell-color', background);
            cell.style.setProperty('--cell-ink', ink);
            cell.title = `${day} ${interval || ''}: ${formatPercent(value)} of daily demand`;
            cell.setAttribute('role', 'presentation');
            cell.textContent = formatPercent(value);

            td.appendChild(cell);
            row.appendChild(td);
          });

          tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        card.appendChild(tableWrap);
        frag.appendChild(card);
      });

      container.appendChild(frag);
    };

    const loadWeek = async (week, { silent } = {}) => {
      const sanitized = sanitizeWeek(week);
      if (!sanitized) {
        setStatus('Enter a week number between 1 and 53.', 'error');
        clearHeatmaps();
        if (legend) legend.hidden = true;
        return;
      }

      if (state.abortController) {
        state.abortController.abort();
      }

      const controller = new AbortController();
      state.abortController = controller;
      const country = getCountry();
      state.lastWeek = sanitized;
      state.lastCountry = country;

      if (!silent) {
        setStatus(`Loading week ${sanitized} for ${country}…`, 'loading');
      }

      try {
        const response = await fetch(`/by-week?weeknum=${encodeURIComponent(sanitized)}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Ultradar-Country': country
          },
          cache: 'no-cache',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const records = normalisePayload(payload);

        if (!records.length) {
          clearHeatmaps();
          if (legend) legend.hidden = true;
          setStatus(`No slot curve data returned for week ${sanitized} in ${country}.`, 'error');
          return;
        }

        const { stores, intervals, days } = buildStoreGroups(records);

        if (!stores.length) {
          clearHeatmaps();
          if (legend) legend.hidden = true;
          setStatus(`No slot curve data available for week ${sanitized}.`, 'error');
          return;
        }

        renderHeatmaps(stores, intervals, days, { week: sanitized, country });
        setStatus(`Loaded ${stores.length} store${stores.length === 1 ? '' : 's'} for week ${sanitized} (${country}).`, 'success');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load slot curves', error);
        clearHeatmaps();
        if (legend) legend.hidden = true;
        setStatus('We could not load slot curve data. Please try again.', 'error');
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      loadWeek(weekInput.value);
    });

    const currentWeek = sanitizeWeek(weekInput.value) || getCurrentISOWeek();
    weekInput.value = currentWeek;
    loadWeek(currentWeek, { silent: true });

    document.addEventListener('ultradar:countrychange', (event) => {
      const nextCountry = event?.detail?.country;
      if (!state.lastWeek) return;
      if (nextCountry && nextCountry === state.lastCountry) return;
      loadWeek(state.lastWeek);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
