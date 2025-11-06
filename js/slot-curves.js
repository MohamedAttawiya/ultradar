(function () {
  const DAY_ORDER = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  const HEATMAP_STOPS = [
    { stop: 0, r: 34, g: 197, b: 94 }, // emerald 500
    { stop: 0.5, r: 250, g: 204, b: 21 }, // amber 400
    { stop: 1, r: 220, g: 38, b: 38 } // red 600
  ];

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

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

  const interpolateChannel = (start, end, amount) => {
    return Math.round(start + (end - start) * amount);
  };

  const toRgbString = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

  const relativeLuminance = ({ r, g, b }) => {
    const toLinear = (channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const colorForValue = (value, max) => {
    if (!max || max <= 0 || !Number.isFinite(value) || value <= 0) {
      return { background: '#f8fafc', ink: 'var(--muted)' };
    }

    const ratio = clamp(value / max, 0, 1);
    let start = HEATMAP_STOPS[0];
    let end = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];

    for (let i = 0; i < HEATMAP_STOPS.length - 1; i += 1) {
      const current = HEATMAP_STOPS[i];
      const next = HEATMAP_STOPS[i + 1];
      if (ratio >= current.stop && ratio <= next.stop) {
        start = current;
        end = next;
        break;
      }
    }

    const span = end.stop - start.stop || 1;
    const segmentRatio = clamp((ratio - start.stop) / span, 0, 1);
    const color = {
      r: interpolateChannel(start.r, end.r, segmentRatio),
      g: interpolateChannel(start.g, end.g, segmentRatio),
      b: interpolateChannel(start.b, end.b, segmentRatio)
    };

    const luminance = relativeLuminance(color);
    const ink = luminance < 0.45 ? '#f8fafc' : '#0f172a';

    return { background: toRgbString(color), ink };
  };

  const normalisePayload = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        return normalisePayload(parsed);
      } catch (_err) {
        return [];
      }
    }

    if (payload.body) {
      if (Array.isArray(payload.body)) {
        return payload.body;
      }
      if (typeof payload.body === 'string') {
        try {
          const parsed = JSON.parse(payload.body);
          return normalisePayload(parsed);
        } catch (_err) {
          return [];
        }
      }
    }

    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.records)) return payload.records;
    if (Array.isArray(payload.items)) return payload.items;
    if (payload.result && Array.isArray(payload.result)) return payload.result;

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

    stores.sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { sensitivity: 'base' }));

    return { stores, intervals, days };
  };

  const formatDayLabel = (day) => {
    if (!day) return '—';
    const trimmed = day.trim();
    if (!trimmed) return '—';
    return trimmed.charAt(0).toUpperCase();
  };

  const formatIntervalLabel = (interval) => {
    if (!interval) return '—';
    const [start] = interval.split(' - ');
    if (!start) return interval;
    const [hours, minutes] = start.split(':').map((part) => parseInt(part, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return interval;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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
      if (legend) {
        legend.hidden = !(groups.length && intervals.length && days.length);
        legend.setAttribute('aria-hidden', legend.hidden ? 'true' : 'false');
      }
      if (!groups.length || !intervals.length || !days.length) {
        return;
      }

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
        subtitle.textContent = `Week ${context.week} · ${context.country}`;
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
        intervalHead.textContent = '';
        intervalHead.setAttribute('aria-label', 'Time slot');
        headRow.appendChild(intervalHead);

        days.forEach((day) => {
          const th = document.createElement('th');
          th.scope = 'col';
          th.textContent = formatDayLabel(day);
          th.title = day;
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
          rowHeader.textContent = formatIntervalLabel(interval);
          rowHeader.title = interval || '';
          row.appendChild(rowHeader);

          days.forEach((day) => {
            const td = document.createElement('td');
            const value = lookup.get(`${day}__${interval}`) || 0;
            const { background } = colorForValue(value, globalMax);
            const readableDay = day || 'Unknown day';
            const readableInterval = interval || 'Unknown interval';
            const percentLabel = formatPercent(value);

            td.style.setProperty('--cell-color', background);
            td.setAttribute(
              'aria-label',
              `${readableDay} ${readableInterval}: ${percentLabel} of daily demand`
            );
            td.title = `${readableDay} ${readableInterval}: ${percentLabel} of daily demand`;

            const srOnly = document.createElement('span');
            srOnly.className = 'sr-only';
            srOnly.textContent = percentLabel;
            td.appendChild(srOnly);

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
        if (legend) {
          legend.hidden = true;
          legend.setAttribute('aria-hidden', 'true');
        }
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
        const apiUrl = new URL('https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com/by-week');
        apiUrl.searchParams.set('weeknum', sanitized);

        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-cache',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const raw = await response.text();
        let payload;
        try {
          payload = raw ? JSON.parse(raw) : [];
        } catch (parseError) {
          console.error('Failed to parse /by-week response', parseError);
          throw new Error('The /by-week API did not return valid JSON.');
        }
        const records = normalisePayload(payload);

        if (!records.length) {
          clearHeatmaps();
          if (legend) {
            legend.hidden = true;
            legend.setAttribute('aria-hidden', 'true');
          }
          setStatus(`No slot curve data returned for week ${sanitized} in ${country}.`, 'error');
          return;
        }

        const { stores, intervals, days } = buildStoreGroups(records);

        if (!stores.length) {
          clearHeatmaps();
          if (legend) {
            legend.hidden = true;
            legend.setAttribute('aria-hidden', 'true');
          }
          setStatus(`No slot curve data available for week ${sanitized}.`, 'error');
          return;
        }

        renderHeatmaps(stores, intervals, days, { week: sanitized, country });
        setStatus(
          `Loaded ${stores.length} store${stores.length === 1 ? '' : 's'} for week ${sanitized} (${country}).`,
          'success'
        );
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load slot curves', error);
        clearHeatmaps();
        if (legend) {
          legend.hidden = true;
          legend.setAttribute('aria-hidden', 'true');
        }
        const friendly = error?.message || 'Unexpected error.';
        setStatus(`We could not load slot curve data. ${friendly}`, 'error');
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      loadWeek(weekInput.value);
    });

    const currentWeek = sanitizeWeek(weekInput.value) || getCurrentISOWeek();
    weekInput.value = currentWeek;
    loadWeek(currentWeek);

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
