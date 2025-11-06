(function () {
  // ===== Constants =====
  const DAY_ORDER = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // gradient: green -> amber -> red
  const HEATMAP_STOPS = [
    { stop: 0.0, r: 34,  g: 197, b: 94  }, // emerald 500
    { stop: 0.5, r: 250, g: 204, b: 21  }, // amber 400
    { stop: 1.0, r: 220, g: 38,  b: 38  }, // red 600
  ];

  // ===== Small helpers =====
  const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

  const sanitizeWeek = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < 1) return 1;
    if (num > 53) return 53;
    return Math.round(num);
  };

  const getCurrentISOWeek = () => {
    const now = new Date();
    const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const diff = target - yearStart;
    return Math.ceil((diff / 86400000 + 1) / 7);
  };

  const getCountry = () => {
    const root = document.documentElement.getAttribute("data-country");
    if (root) return root;
    const meta = document.querySelector('meta[name="ultradar-country"]');
    return meta?.content || "AE";
  };

  // "HH:MM - HH:MM" -> start minutes (0..1430 step 30)
  const parseIntervalValue = (interval) => {
    if (!interval) return 0;
    const [start] = String(interval).split(" - ");
    if (!start) return 0;
    const [hours, minutes] = start.split(":").map((p) => parseInt(p, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  };

  // Accept 0..1 or 0..100, return % in 0..100 with 2 decimals
  const normalizePct = (value) => {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const pct = n > 1 ? n : n * 100;
    return Math.round(clamp(pct, 0, 100) * 100) / 100; // 2 decimals
  };

  const formatPercent = (value) => {
    const pct = normalizePct(value);
    if (pct == null) return "—";
    return `${pct.toFixed(2)}%`;
  };

  const interpolateChannel = (start, end, t) => Math.round(start + (end - start) * t);
  const toRgbString = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

  // Map t in [0,1] to rgb via HEATMAP_STOPS
  const colorFromT = (t) => {
    const x = clamp(t, 0, 1);
    let a = HEATMAP_STOPS[0];
    let b = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];
    for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
      const s = HEATMAP_STOPS[i], e = HEATMAP_STOPS[i + 1];
      if (x >= s.stop && x <= e.stop) { a = s; b = e; break; }
    }
    const span = (b.stop - a.stop) || 1;
    const local = (x - a.stop) / span;
    return toRgbString({
      r: interpolateChannel(a.r, b.r, local),
      g: interpolateChannel(a.g, b.g, local),
      b: interpolateChannel(a.b, b.b, local),
    });
  };

  // Very tolerant payload normalizer
  const normalisePayload = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    if (typeof payload === "string") {
      try { return normalisePayload(JSON.parse(payload)); } catch { return []; }
    }
    if (payload.body) {
      if (Array.isArray(payload.body)) return payload.body;
      if (typeof payload.body === "string") {
        try { return normalisePayload(JSON.parse(payload.body)); } catch { return []; }
      }
    }
    if (Array.isArray(payload.data))    return payload.data;
    if (Array.isArray(payload.records)) return payload.records;
    if (Array.isArray(payload.items))   return payload.items;
    if (payload.result && Array.isArray(payload.result)) return payload.result;

    if (typeof payload === "object") return [payload];
    return [];
  };

  const buildCanonicalIntervals = () => {
    const out = [];
    for (let m = 0; m < 24 * 60; m += 30) {
      const h  = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const n  = (m + 30) % (24 * 60);
      const nh = String(Math.floor(n / 60)).padStart(2, "0");
      const nm = String(n % 60).padStart(2, "0");
      out.push(`${h}:${mm} - ${nh}:${nm}`);
    }
    return out;
  };

  /**
   * NEW-FORMAT GROUPER
   * Input: [{ store_name, marketplace_id, days: { "Wednesday": [{time_interval, pct_of_day}, ...], ... } }, ...]
   * Output: { stores: [{ storeName, entries: [{day, interval, value}, ...] }...], intervals: [...], days: [...] }
   */
  const buildStoreGroupsFromStoreObjects = (storesPayload) => {
    // Collect unique intervals (sorted by start minute) and days (prefer DAY_ORDER)
    const intervalSet = new Set();
    const allDaySet = new Set();

    const stores = (storesPayload || [])
      .filter(Boolean)
      .map((s) => {
        const storeName = s.store_name || "Unnamed Store";
        const daysObj = s.days || {};
        const entries = [];

        for (const [day, arr] of Object.entries(daysObj)) {
          allDaySet.add(day);
          (arr || []).forEach(({ time_interval, pct_of_day }) => {
            if (time_interval) intervalSet.add(time_interval);
            entries.push({
              day,
              interval: time_interval,
              value: pct_of_day
            });
          });
        }

        return { storeName, entries };
      })
      .sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { sensitivity: "base" }));

    // Determine intervals: if API gave any, use them in chronological order; else canonical 48
    let intervals = Array.from(intervalSet);
    if (intervals.length) {
      intervals.sort((ia, ib) => parseIntervalValue(ia) - parseIntervalValue(ib));
    } else {
      intervals = buildCanonicalIntervals();
    }

    // Determine days: respect default order first, then append unknowns sorted
    const extraDays = Array.from(allDaySet).filter((d) => !DAY_ORDER.includes(d)).sort();
    const days = [...DAY_ORDER.filter((d) => allDaySet.has(d)), ...extraDays];

    return { stores, intervals, days };
  };

  /**
   * BACK-COMPAT GROUPER (old flat rows)
   * Input: [{ store_name, day_of_week, time_interval, pct_of_day }, ...]
   */
  const buildStoreGroupsFromFlatRecords = (records) => {
    const storeMap = new Map();
    const intervalSet = new Set();
    const allDaySet = new Set();

    records.forEach((rec) => {
      if (!rec) return;
      const store    = rec.store_name || "Unnamed Store";
      const day      = rec.day_of_week || "";
      const interval = rec.time_interval || "";
      const value    = rec.pct_of_day;

      if (!storeMap.has(store)) storeMap.set(store, []);
      storeMap.get(store).push({ day, interval, value });

      if (interval) intervalSet.add(interval);
      if (day) allDaySet.add(day);
    });

    const intervals = Array.from(intervalSet);
    if (intervals.length) {
      intervals.sort((a, b) => parseIntervalValue(a) - parseIntervalValue(b));
    } else {
      intervals.push(...buildCanonicalIntervals());
    }

    const extraDays = Array.from(allDaySet).filter((d) => !DAY_ORDER.includes(d)).sort();
    const days = [...DAY_ORDER.filter((d) => allDaySet.has(d)), ...extraDays];

    const stores = Array.from(storeMap.entries())
      .map(([storeName, entries]) => ({ storeName, entries }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { sensitivity: "base" }));

    return { stores, intervals, days };
  };

  /**
   * Unified dispatcher that detects the new format and falls back to old format.
   */
  const buildStoreGroups = (records) => {
    if (!Array.isArray(records) || !records.length) {
      return { stores: [], intervals: [], days: [] };
    }
    const looksNew =
      typeof records[0] === "object" &&
      records[0] !== null &&
      ("days" in records[0]) &&
      (typeof records[0].days === "object");

    return looksNew
      ? buildStoreGroupsFromStoreObjects(records)
      : buildStoreGroupsFromFlatRecords(records);
  };

  const formatDayLabel = (day) => {
    if (!day) return "—";
    const trimmed = day.trim();
    if (!trimmed) return "—";
    return trimmed.charAt(0).toUpperCase();
  };

  const formatIntervalLabel = (interval) => {
    if (!interval) return "—";
    const [start] = interval.split(" - ");
    if (!start) return interval;
    const [h, m] = start.split(":").map((p) => parseInt(p, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return interval;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // ===== Main UI =====
  const ready = () => {
    const form      = document.getElementById("slotCurvesWeekForm");
    const weekInput = document.getElementById("slotCurvesWeek");
    const message   = document.getElementById("slotCurvesMessage");
    const legend    = document.getElementById("slotCurvesLegend");
    const container = document.getElementById("slotCurvesHeatmaps");
    if (!form || !weekInput || !container) return;

    const state = { abortController: null, lastWeek: null, lastCountry: null };

    const setStatus = (text, variant) => {
      if (!message) return;
      if (!text) {
        message.textContent = "";
        message.removeAttribute("data-state");
        return;
      }
      message.textContent = text;
      message.dataset.state = variant || "info";
    };

    const clearHeatmaps = () => { container.innerHTML = ""; };

    // ====== RENDER (Per-Weekday Normalization) ======
    const renderHeatmaps = (groups, intervals, days, context) => {
      clearHeatmaps();
      if (legend) {
        const vis = !!(groups.length && intervals.length && days.length);
        legend.hidden = !vis;
        legend.setAttribute("aria-hidden", vis ? "false" : "true");
      }
      if (!groups.length || !intervals.length || !days.length) return;

      const frag = document.createDocumentFragment();

      groups.forEach(({ storeName, entries }) => {
        // Build lookup for quick cell fetch
        const lookup = new Map();
        entries.forEach(({ day, interval, value }) => {
          lookup.set(`${day}__${interval}`, normalizePct(value)); // store as % (0..100, 2dp)
        });

        // Precompute per-column min/max (%)
        const colMin = Array(days.length).fill(+Infinity);
        const colMax = Array(days.length).fill(-Infinity);

        intervals.forEach((interval) => {
          days.forEach((day, c) => {
            const v = lookup.get(`${day}__${interval}`);
            if (v == null) return;
            if (v < colMin[c]) colMin[c] = v;
            if (v > colMax[c]) colMax[c] = v;
          });
        });
        for (let c = 0; c < days.length; c++) {
          if (!isFinite(colMin[c])) colMin[c] = 0;
          if (!isFinite(colMax[c])) colMax[c] = 0;
          if (colMax[c] === colMin[c]) colMax[c] = colMin[c] + 0.0001; // avoid /0
        }

        // Card
        const card = document.createElement("article");
        card.className = "heatmap-card";
        card.setAttribute("role", "listitem");

        const title = document.createElement("h3");
        title.className = "heatmap-card__title";
        title.textContent = storeName;
        card.appendChild(title);

        const subtitle = document.createElement("p");
        subtitle.className = "heatmap-card__subtitle";
        subtitle.textContent = `Week ${context.week} · ${context.country}`;
        card.appendChild(subtitle);

        const tableWrap = document.createElement("div");
        tableWrap.className = "heatmap-card__body";

        const table = document.createElement("table");
        table.className = "heatmap-table";
        table.setAttribute(
          "aria-label",
          `Slot curve distribution for ${storeName} in week ${context.week} for ${context.country}`
        );

        // Responsive tuning for square-ish grid
        const cols = days.length;      // usually 7
        const rows = intervals.length; // 48
        const labelCol = 36;
        const headH = 12;
        const cellW = 22;
        let cellH = (labelCol + cols * cellW - headH) / rows;
        cellH = Math.max(3, Math.min(cellH, 12));
        table.style.setProperty("--cell-w", `${cellW}px`);
        table.style.setProperty("--cell-h", `${Math.round(cellH)}px`);

        // THEAD
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        const intervalHead = document.createElement("th");
        intervalHead.scope = "col";
        intervalHead.textContent = "";
        intervalHead.setAttribute("aria-label", "Time slot");
        headRow.appendChild(intervalHead);
        days.forEach((day) => {
          const th = document.createElement("th");
          th.scope = "col";
          th.textContent = formatDayLabel(day);
          th.title = day;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // TBODY
        const tbody = document.createElement("tbody");
        intervals.forEach((interval) => {
          const tr = document.createElement("tr");

          const rowHeader = document.createElement("th");
          rowHeader.scope = "row";
          rowHeader.textContent = formatIntervalLabel(interval);
          rowHeader.title = interval || "";
          tr.appendChild(rowHeader);

          days.forEach((day, c) => {
            const td = document.createElement("td");
            const v = lookup.get(`${day}__${interval}`);

            if (v == null) {
              td.style.setProperty("--cell-color", "#9ad58a");
              td.title = `${day || "Unknown day"} ${interval || ""}: —`;
              td.setAttribute("aria-label", `${day || "Unknown day"} ${interval || ""}: —`);
            } else {
              // Per-weekday normalization (column): lowest=green, highest=red
              let t = (v - colMin[c]) / (colMax[c] - colMin[c]); // 0..1
              t = Math.round(clamp(t, 0, 1) * 100) / 100;        // 2-dec granularity
              const color = colorFromT(t);

              td.style.backgroundColor = color;                  // hard inline (wins)
              td.style.setProperty("--cell-color", color);       // for your CSS path

              const label = `${formatPercent(v)} (scaled ${t.toFixed(2)})`;
              td.title = `${day || "Unknown day"} ${interval || ""}: ${formatPercent(v)}`;
              td.setAttribute("aria-label", `${day || "Unknown day"} ${interval || ""}: ${label}`);

              // screen-reader text
              const srOnly = document.createElement("span");
              srOnly.className = "sr-only";
              srOnly.textContent = label;
              td.appendChild(srOnly);
            }

            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        card.appendChild(tableWrap);
        frag.appendChild(card);
      });

      container.appendChild(frag);
    };

    // ===== Data load =====
    const loadWeek = async (week, { silent } = {}) => {
      const sanitized = sanitizeWeek(week);
      if (!sanitized) {
        setStatus("Enter a week number between 1 and 53.", "error");
        clearHeatmaps();
        if (legend) { legend.hidden = true; legend.setAttribute("aria-hidden", "true"); }
        return;
      }

      if (state.abortController) state.abortController.abort();
      const controller = new AbortController();
      state.abortController = controller;

      const country = getCountry();
      state.lastWeek = sanitized;
      state.lastCountry = country;

      if (!silent) setStatus(`Loading week ${sanitized} for ${country}…`, "loading");

      try {
        const apiUrl = new URL("https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com/by-week");
        apiUrl.searchParams.set("weeknum", sanitized);

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

        const raw = await response.text();
        let payload;
        try { payload = raw ? JSON.parse(raw) : []; }
        catch { throw new Error("The /by-week API did not return valid JSON."); }

        const records = normalisePayload(payload);
        if (!records.length) {
          clearHeatmaps();
          if (legend) { legend.hidden = true; legend.setAttribute("aria-hidden", "true"); }
          setStatus(`No slot curve data returned for week ${sanitized} in ${country}.`, "error");
          return;
        }

        const { stores, intervals, days } = buildStoreGroups(records);
        if (!stores.length) {
          clearHeatmaps();
          if (legend) { legend.hidden = true; legend.setAttribute("aria-hidden", "true"); }
          setStatus(`No slot curve data available for week ${sanitized}.`, "error");
          return;
        }

        renderHeatmaps(stores, intervals, days, { week: sanitized, country });
        setStatus(
          `Loaded ${stores.length} store${stores.length === 1 ? "" : "s"} for week ${sanitized} (${country}).`,
          "success"
        );
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Failed to load slot curves", error);
        clearHeatmaps();
        if (legend) { legend.hidden = true; legend.setAttribute("aria-hidden", "true"); }
        setStatus(`We could not load slot curve data. ${error?.message || "Unexpected error."}`, "error");
      }
    };

    // ===== Wire up =====
    form.addEventListener("submit", (e) => { e.preventDefault(); loadWeek(weekInput.value); });

    const currentWeek = sanitizeWeek(weekInput.value) || getCurrentISOWeek();
    weekInput.value = currentWeek;
    loadWeek(currentWeek);

    document.addEventListener("ultradar:countrychange", (event) => {
      const nextCountry = event?.detail?.country;
      if (!state.lastWeek) return;
      if (nextCountry && nextCountry === state.lastCountry) return;
      loadWeek(state.lastWeek);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
