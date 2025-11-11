(() => {
  const API_BASE = 'https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com';
  const ORDER_FORECAST_ENDPOINT = `${API_BASE}/order-forecast`;

  let latestForecast = null;

  const els = {};

  document.addEventListener('DOMContentLoaded', () => {
    els.refreshBtn = document.getElementById('orderForecastRefresh');
    els.downloadBtn = document.getElementById('orderForecastDownload');
    els.status = document.getElementById('orderForecastMessage');
    els.meta = document.getElementById('orderForecastMeta');
    els.tableWrap = document.getElementById('orderForecastTableWrap');
    els.tableHead = document.querySelector('#orderForecastTable thead');
    els.tableBody = document.querySelector('#orderForecastTable tbody');
    els.rawDetails = document.getElementById('orderForecastRaw');
    els.rawPre = document.getElementById('orderForecastJson');
    els.form = document.getElementById('orderForecastForm');
    els.fileInput = document.getElementById('orderForecastFile');

    if (!els.refreshBtn || !els.status || !els.tableWrap) {
      return;
    }

    els.refreshBtn.addEventListener('click', () => {
      loadLatestForecast();
    });

    if (els.downloadBtn) {
      els.downloadBtn.addEventListener('click', handleDownloadClick);
    }

    if (els.form) {
      els.form.addEventListener('submit', handleUploadSubmit);
    }

    // Try to load on first paint for immediate context.
    loadLatestForecast({ silent: true });
  });

  function setStatus(state, message) {
    if (!els.status) return;
    if (state) {
      els.status.dataset.state = state;
    } else {
      delete els.status.dataset.state;
    }
    if (typeof message === 'string') {
      els.status.textContent = message;
    } else if (message instanceof Node) {
      els.status.textContent = '';
      els.status.appendChild(message);
    } else {
      els.status.textContent = '';
    }
  }

  function toggleLoading(isLoading) {
    if (els.refreshBtn) {
      els.refreshBtn.disabled = isLoading;
    }
    if (els.form) {
      const submit = els.form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = isLoading;
    }
  }

  async function loadLatestForecast(options = {}) {
    const { silent = false } = options;
    try {
      toggleLoading(true);
      if (!silent) {
        setStatus('loading', 'Loading latest forecast…');
      }
      const res = await fetch(ORDER_FORECAST_ENDPOINT, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      latestForecast = data;
      renderForecast(data);
      if (!silent) {
        setStatus('success', 'Latest forecast loaded.');
      } else {
        setStatus(null, '');
      }
    } catch (error) {
      console.error(error);
      if (!silent) {
        setStatus('error', formatError(error, 'Unable to load the latest forecast.'));
      }
    } finally {
      toggleLoading(false);
    }
  }

  async function handleUploadSubmit(event) {
    event.preventDefault();
    if (!els.fileInput || !els.fileInput.files || !els.fileInput.files.length) {
      setStatus('error', 'Please choose a CSV file before uploading.');
      return;
    }

    const file = els.fileInput.files[0];

    try {
      toggleLoading(true);
      setStatus('loading', 'Uploading forecast…');
      const text = await file.text();
      const parsed = parseForecastCsv(text);
      const payload = buildForecastPayload(parsed.columns, parsed.rows);
      await uploadForecast(payload);
      latestForecast = payload;
      renderForecast(payload);
      setStatus('success', 'Forecast uploaded successfully.');
      if (els.form) {
        els.form.reset();
      }
    } catch (error) {
      console.error(error);
      setStatus('error', formatError(error, 'Upload failed. Please check the CSV format and try again.'));
    } finally {
      toggleLoading(false);
      if (els.fileInput) {
        els.fileInput.value = '';
      }
    }
  }

  async function uploadForecast(payload) {
    const res = await fetch(ORDER_FORECAST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed with status ${res.status}: ${text}`);
    }
    return res;
  }

  function renderForecast(data) {
    if (!data || !Array.isArray(data.rows) || !Array.isArray(data.columns)) {
      els.tableWrap.hidden = true;
      if (els.meta) {
        els.meta.textContent = '';
        els.meta.hidden = true;
      }
      if (els.rawDetails) {
        els.rawDetails.hidden = true;
      }
      if (els.downloadBtn) {
        els.downloadBtn.hidden = true;
      }
      return;
    }

    renderMetadata(data.metadata || {});
    renderTable(data.columns, data.rows);
    renderRawJson(data);

    if (els.downloadBtn) {
      els.downloadBtn.hidden = false;
    }
  }

  function renderMetadata(metadata) {
    if (!els.meta) return;
    const parts = [];
    if (metadata.generated_at) {
      const dt = new Date(metadata.generated_at);
      const formatted = Number.isNaN(dt.getTime()) ? metadata.generated_at : dt.toLocaleString();
      parts.push(`Generated ${formatted}`);
    }
    if (metadata.units) {
      parts.push(`Units: ${metadata.units}`);
    }
    if (metadata.note) {
      parts.push(metadata.note);
    }
    els.meta.textContent = parts.join(' • ');
    els.meta.hidden = parts.length === 0;
  }

  function renderTable(columns, rows) {
    if (!els.tableHead || !els.tableBody || !els.tableWrap) return;
    els.tableHead.textContent = '';
    els.tableBody.textContent = '';

    const headerRow = document.createElement('tr');
    const storeHeader = document.createElement('th');
    storeHeader.scope = 'col';
    storeHeader.textContent = 'Store';
    headerRow.appendChild(storeHeader);
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = col;
      headerRow.appendChild(th);
    });
    els.tableHead.appendChild(headerRow);

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const storeCell = document.createElement('th');
      storeCell.scope = 'row';
      storeCell.textContent = row.store_name || row.store || '';
      tr.appendChild(storeCell);

      const values = Array.isArray(row.values) ? row.values : [];
      columns.forEach((_, index) => {
        const td = document.createElement('td');
        const value = values[index];
        td.textContent = formatNumber(value);
        tr.appendChild(td);
      });
      els.tableBody.appendChild(tr);
    });

    els.tableWrap.hidden = false;
  }

  function renderRawJson(data) {
    if (!els.rawDetails || !els.rawPre) return;
    els.rawDetails.hidden = false;
    els.rawDetails.open = false;
    els.rawPre.textContent = JSON.stringify(data, null, 2);
  }

  function handleDownloadClick() {
    if (!latestForecast) return;
    const blob = new Blob([JSON.stringify(latestForecast, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `order-forecast-${timestampSlug()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function timestampSlug() {
    const now = new Date();
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes())
    ].join('');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    if (Number.isNaN(number)) {
      return String(value);
    }
    return number.toLocaleString();
  }

  function parseForecastCsv(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('CSV content is empty.');
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (!lines.length) {
      throw new Error('CSV file does not contain any rows.');
    }

    const headerCells = splitCsvLine(lines[0]);
    if (headerCells.length < 2) {
      throw new Error('CSV header must include store column plus at least one week column.');
    }

    const columns = headerCells.slice(1).map((cell) => cell.trim());
    if (columns.some((col) => !col)) {
      throw new Error('Week column headers cannot be empty.');
    }

    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = splitCsvLine(lines[i]);
      if (!cells.length) continue;
      const store = (cells[0] || '').trim();
      if (!store) {
        throw new Error(`Missing store name in row ${i + 1}.`);
      }
      const values = [];
      for (let colIdx = 0; colIdx < columns.length; colIdx += 1) {
        const cell = (cells[colIdx + 1] || '').trim();
        if (!cell) {
          throw new Error(`Missing value for ${columns[colIdx]} in store ${store}.`);
        }
        const numeric = normaliseNumber(cell);
        if (Number.isNaN(numeric)) {
          throw new Error(`Invalid number "${cell}" for ${columns[colIdx]} in store ${store}.`);
        }
        values.push(numeric);
      }
      rows.push({ store_name: store, values });
    }

    if (!rows.length) {
      throw new Error('CSV file does not contain any data rows.');
    }

    return { columns, rows };
  }

  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result.map((value) => value.trim());
  }

  function normaliseNumber(value) {
    if (typeof value !== 'string') {
      return Number(value);
    }
    const cleaned = value.replace(/[\s,]/g, '');
    const number = Number(cleaned);
    return number;
  }

  function buildForecastPayload(columns, rows) {
    return {
      schema: { name: 'weekly_total_forecast_matrix', version: 1 },
      metadata: {
        generated_at: new Date().toISOString(),
        units: 'orders',
        note: 'Columns are ISO week labels; each row has values aligned by index.'
      },
      columns,
      rows
    };
  }

  function formatError(error, fallbackMessage) {
    if (!error) return fallbackMessage;
    if (error instanceof Error) {
      return error.message || fallbackMessage;
    }
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch (_err) {
      return fallbackMessage;
    }
  }
})();
