// strategy-form.js — Ultradar Strategy Form (create/edit)
(function () {
  const ns = (window.UltradarStrategyForm = window.UltradarStrategyForm || {});

  // Public API ---------------------------------------------------------------
  ns.mount = function mount(hostEl, initial = {}) {
    if (!hostEl) return;
    hostEl.innerHTML = template();
    const form = hostEl.querySelector('#ud-strategy-form');
    const preview = hostEl.querySelector('#ud-strategy-preview');
    const errors = hostEl.querySelector('#ud-strategy-errors');

    hydrate(form, initial);
    const render = () => {
      try {
        const obj = build(form);
        errors.textContent = '';
        preview.textContent = JSON.stringify(obj, null, 2);
        ns._last = obj;
        ns._notify(obj);
        try { localStorage.setItem('ultradar.strategy.create.draft', JSON.stringify(toDraft(form))); } catch {}
      } catch (e) {
        errors.textContent = String(e.message || e);
      }
    };

    hostEl.addEventListener('input', debounce(render, 200));
    hostEl.querySelector('#ud-add-local')?.addEventListener('click', () => {
      addLocalRow(form.querySelector('.ud-local'), {});
      render();
    });
    hostEl.querySelector('#ud-copy')?.addEventListener('click', () => copy(preview.textContent));
    hostEl.querySelector('#ud-download')?.addEventListener('click', () => download(preview.textContent));

    // initial render
    render();
  };

  ns.getJson = () => ns._last || null;
  ns.onChange = (fn) => (ns._notify = typeof fn === 'function' ? fn : () => {});
  ns._notify = () => {};

  // Internals ----------------------------------------------------------------
  function template() {
    return `
      <form id="ud-strategy-form" class="panel form-grid" novalidate>
        <h4>Create Strategy</h4>

        <div class="grid">
          <label>Strategy ID <input name="strategy_id" required placeholder="STRAT_EXP_DECAY_V1"></label>
          <label>Name <input name="name" required placeholder="Exponential Decay Blend"></label>
        </div>

        <label>Description <input name="description" placeholder="Generates weekly, daily, and slot-level curves"></label>

        <div class="grid">
          <label>Mode
            <select name="mode"><option value="dynamic">dynamic</option><option value="static">static</option></select>
          </label>
          <label>Type
            <select name="type"><option value="curve_generation">curve_generation</option><option value="volatility_guard">volatility_guard</option></select>
          </label>
          <label>Version <input name="version" type="number" min="1" step="1" value="1"></label>
        </div>

        <div class="grid">
          <label>Lookback weeks <input name="lookback_weeks" type="number" min="1" max="26" value="4"></label>
          <label>Decay α <input name="decay_alpha" type="number" step="0.01" min="0" max="1" value="0.35"></label>
          <label>Volatility λ <input name="volatility_lambda" type="number" step="0.01" min="0" max="1" value="0.45"></label>
        </div>

        <div class="grid">
          <label>Use volatility weighting
            <select name="use_volatility_weighting"><option value="true">true</option><option value="false">false</option></select>
          </label>
          <label>Slot smoothing σ <input name="slot_smoothing_strength" type="number" step="0.1" min="0" max="6" value="1.2"></label>
          <label>Created by <input name="created_by" value="mohamed.a"></label>
        </div>

        <fieldset>
          <legend>Output schema</legend>
          <label class="chk"><input type="checkbox" name="weekly_shape" checked> weekly_shape</label>
          <label class="chk"><input type="checkbox" name="daily_shape"  checked> daily_shape</label>
          <label class="chk"><input type="checkbox" name="slot_shape"   checked> slot_shape</label>
        </fieldset>

        <fieldset>
          <legend>Exclusions</legend>
          <label>Global (comma separated) <input name="ex_global" placeholder="GLOBAL_HOLIDAY_V3"></label>
          <div class="ud-local"></div>
          <button type="button" class="btn" id="ud-add-local">+ Add local rule</button>
        </fieldset>

        <div id="ud-strategy-errors" class="muted" style="min-height:1.2em;"></div>

        <div class="actions">
          <button type="button" class="btn" id="ud-copy">Copy</button>
          <button type="button" class="btn" id="ud-download">Download</button>
        </div>
      </form>

      <div class="panel">
        <h4>Preview</h4>
        <pre id="ud-strategy-preview" class="codeblock" style="white-space:pre-wrap;overflow:auto;min-height:180px;">{}</pre>
      </div>
    `;
  }

  function hydrate(form, preset) {
    const draft = safeJSON(localStorage.getItem('ultradar.strategy.create.draft')) || {};
    const p = Object.assign({
      strategy_id: "STRAT_EXP_DECAY_V1",
      name: "Exponential Decay Blend",
      description: "Generates weekly, daily, and slot-level curves using exponential decay.",
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
    }, draft, preset || {});

    const set = (n, v) => { const el=form.elements[n]; if(!el) return; if(el.type==='checkbox') el.checked=!!v; else el.value=(v??''); };
    set('strategy_id', p.strategy_id); set('name', p.name); set('description', p.description);
    set('version', p.version); set('mode', p.mode); set('type', p.type);
    set('lookback_weeks', p.lookback_weeks); set('decay_alpha', p.decay_alpha);
    set('use_volatility_weighting', String(!!p.use_volatility_weighting));
    set('slot_smoothing_strength', p.slot_smoothing_strength);
    set('volatility_lambda', p.volatility_lambda); set('created_by', p.created_by);
    form.elements.weekly_shape.checked = !!p.weekly_shape;
    form.elements.daily_shape.checked  = !!p.daily_shape;
    form.elements.slot_shape.checked   = !!p.slot_shape;
    set('ex_global', p.ex_global);

    const container = form.querySelector('.ud-local');
    container.innerHTML = '';
    (Array.isArray(p.local) ? p.local : []).forEach((r) => addLocalRow(container, r));
    if (!p.local || !p.local.length) addLocalRow(container, {});
  }

  function addLocalRow(container, r={}) {
    const idx = container.querySelectorAll('.ud-local-row').length;
    container.insertAdjacentHTML('beforeend', `
      <div class="ud-local-row" style="display:grid;grid-template-columns:160px 1fr 1fr 1fr 1fr auto;gap:8px;margin:6px 0;">
        <select name="local_type_${idx}">
          <option value="weekday"${r.type==='weekday'?' selected':''}>weekday</option>
          <option value="time_window"${r.type==='time_window'?' selected':''}>time_window</option>
        </select>
        <input name="local_days_${idx}"   placeholder="days (e.g., 5,6)" value="${r.days ? String(r.days) : ''}">
        <input name="local_reason_${idx}" placeholder="reason" value="${r.reason || ''}">
        <input name="local_start_${idx}"  placeholder="start_slot" value="${r.start_slot ?? ''}">
        <input name="local_end_${idx}"    placeholder="end_slot" value="${r.end_slot ?? ''}">
        <button type="button" class="btn danger" data-rm="${idx}">Remove</button>
      </div>
    `);
    container.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rm]');
      if (!b) return;
      b.closest('.ud-local-row')?.remove();
    }, { once: true });
  }

  function build(form) {
    const get = n => form.elements[n]?.value?.trim() ?? '';
    const num = (n,d) => { const v=parseFloat(get(n)); return Number.isFinite(v)?v:d; };

    // locals
    const locals = Array.from(form.querySelectorAll('.ud-local-row')).map(row => {
      const type  = row.querySelector('select')?.value || 'weekday';
      const days  = row.querySelector(`[name^="local_days_"]`)?.value?.trim();
      const reason= row.querySelector(`[name^="local_reason_"]`)?.value?.trim() || undefined;
      const start = row.querySelector(`[name^="local_start_"]`)?.value?.trim();
      const end   = row.querySelector(`[name^="local_end_"]`)?.value?.trim();
      const obj = { type };
      if (type === 'weekday') { if (days) obj.days = days.split(',').map(s=>Number(s.trim())).filter(Number.isFinite); }
      else { if (start) obj.start_slot = Number(start); if (end) obj.end_slot = Number(end); }
      if (reason) obj.reason = reason;
      return obj;
    }).filter(o => Object.keys(o).length > 1);

    if (!get('strategy_id')) throw new Error('Strategy ID is required');
    if (!get('name')) throw new Error('Name is required');

    const out = {
      strategy_id: get('strategy_id'),
      version: Math.max(1, parseInt(get('version') || '1', 10)),
      name: get('name'),
      description: get('description'),
      type: get('type') || 'curve_generation',
      mode: get('mode') || 'dynamic',
      lookback_weeks: Math.max(1, parseInt(get('lookback_weeks') || '4', 10)),
      decay_alpha: clamp(num('decay_alpha', 0.35), 0, 1),
      use_volatility_weighting: (get('use_volatility_weighting') === 'true'),
      slot_smoothing_strength: clamp(num('slot_smoothing_strength', 1.2), 0, 6),
      volatility_lambda: clamp(num('volatility_lambda', 0.45), 0, 1),
      exclusions: {
        global: (get('ex_global') ? get('ex_global').split(',').map(s=>s.trim()).filter(Boolean) : []),
        local: locals
      },
      output_schema: {
        weekly_shape: form.elements.weekly_shape.checked,
        daily_shape:  form.elements.daily_shape.checked,
        slot_shape:   form.elements.slot_shape.checked
      },
      metadata: {
        created_by: get('created_by') || 'unknown',
        created_at: new Date().toISOString(),
        preview_metrics: { avg_volatility: null, smoothness_index: null, centroid_shift: null }
      }
    };
    return out;
  }

  function toDraft(form){
    const o = {};
    for (const el of Array.from(form.elements)) {
      if (!el.name) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = el.value;
    }
    // extract local rows into array
    o.local = Array.from(form.querySelectorAll('.ud-local-row')).map(row => ({
      type: row.querySelector('select')?.value || 'weekday',
      days: row.querySelector(`[name^="local_days_"]`)?.value || '',
      reason: row.querySelector(`[name^="local_reason_"]`)?.value || '',
      start_slot: row.querySelector(`[name^="local_start_"]`)?.value || '',
      end_slot: row.querySelector(`[name^="local_end_"]`)?.value || ''
    }));
    return o;
  }

  // helpers
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
  function safeJSON(s){ try { return JSON.parse(s); } catch { return null; } }
  function copy(text){ navigator.clipboard?.writeText(text||'{}').catch(()=>{}); }
  function download(text){
    const blob = new Blob([text||'{}'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='strategy.json';
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }
})();
