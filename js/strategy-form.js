// strategy-form.js — full drop-in with separate Slot/WoD volatility editors,
// correct preview gating, and JSON modal export following the provided schema.

(function () {
  const ns = (window.UltradarStrategyForm = window.UltradarStrategyForm || {});

  ns.mount = function (hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = template();
    const form     = hostEl.querySelector("#ud-strategy-form");
    const svgMain  = form.querySelector("#ud-curve-svg");
    const svgSlot  = form.querySelector("#ud-slot-svg");
    const svgWod   = form.querySelector("#ud-wod-svg");
    const btn      = form.querySelector("#ud-create-btn");
    wire(form, svgMain, svgSlot, svgWod, btn);
    renderAll(form, svgMain, svgSlot, svgWod, btn);
  };

  // ---------- Template ----------
  function template() {
    const css = `
      #ud-strategy-form { --pad:12px; --label:200px; --neutral:#e2e8f0; --muted:#64748b; --ink:#0f172a; --brand:#2563eb; --violet:#7c3aed; --error:#dc2626; }
      h4 { margin-top:4px; margin-bottom:8px; font-size:18px; }
      .fieldset{ border:1px solid var(--neutral); border-radius:12px; padding:var(--pad); margin-top:14px; }
      .inline{ display:grid; grid-template-columns:var(--label) 1fr; gap:12px; align-items:center; margin-top:8px; }
      .inline.narrow { grid-template-columns: 180px 1fr; }
      .legend{ font-weight:700; margin-bottom:6px; color:var(--ink); }
      .muted{ color:var(--muted); font-size:12px; }
      .pill, .pill-textarea, select.pill{ border-radius:9999px; padding:8px 12px; border:1px solid var(--neutral); background:#fff; transition:border-color .12s, box-shadow .12s; }
      .pill-textarea{ border-radius:16px; padding:10px 12px; min-height:72px; resize:vertical; width:100%; }
      .pill:focus, .pill-textarea:focus, select.pill:focus{ border-color:var(--brand); outline:none; box-shadow:0 0 0 3px rgba(37,99,235,.15); }
      .pill.invalid{ border-color:var(--error); box-shadow:0 0 0 2px rgba(220,38,38,.3); }

      /* Toggles */
      .toggle-wrap{ display:flex; justify-content:flex-end; align-items:center; }
      .toggle{ position:relative; width:42px; height:22px; border-radius:9999px; background:#cbd5e1; transition:background .2s ease; cursor:pointer; display:inline-block; }
      .toggle::after{ content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s ease; }
      input[type="checkbox"].toggle-input{ display:none; }
      input[type="checkbox"].toggle-input:checked + .toggle{ background:var(--brand); }
      input[type="checkbox"].toggle-input:checked + .toggle::after{ left:23px; }

      /* Previews */
      #ud-view, #ud-slot-view, #ud-wod-view{ border:1px solid var(--neutral); border-radius:12px; padding:var(--pad); margin-top:14px; min-height:200px; }
      #ud-curve-svg, #ud-slot-svg, #ud-wod-svg{ width:100%; height:220px; display:block; }
      .ud-err{ color:#dc2626; font-weight:700; text-align:center; margin-top:70px; }

      .inline-center { display:flex; align-items:center; gap:12px; margin-top:8px; }
      .inline-center .label { width: var(--label); font-weight:600; }
      .inline-center .grow { flex:1; }

      .badges { display:flex; gap:8px; justify-content:flex-end; margin-top:6px; flex-wrap:wrap; }
      .badge { background:#f1f5f9; border:1px solid var(--neutral); border-radius:9999px; padding:4px 8px; font-size:12px; }
      .badge em { font-style:normal; font-weight:700; }

      .note-warn { display:flex; gap:8px; align-items:flex-start; background:#fff7ed; border:1px solid #fdba74; color:#9a3412; border-radius:10px; padding:8px 10px; line-height:1.35; margin-top:6px; }
      .note-warn .icon { line-height:1; font-size:14px; }
    `;

    return `
      <style>${css}</style>
      <form id="ud-strategy-form" novalidate>
        <h4>Create Strategy</h4>

        <div class="fieldset">
          <label class="inline"><div>Strategy ID</div><input class="pill" name="strategy_id" placeholder="Auto-generated UUID" /></label>
          <label class="inline"><div>Name</div><input class="pill" name="name" maxlength="256" placeholder="Strategy name" /></label>
          <div style="margin-top:10px;">
            <div style="font-weight:600; margin-bottom:4px;">Description</div>
            <textarea class="pill-textarea" name="description" placeholder="Describe strategy…"></textarea>
          </div>
        </div>

        <!-- Topline Configs -->
        <div class="fieldset">
          <div class="legend">Topline Configs</div>
          <label class="inline narrow"><div>Strategy Type</div>
            <select class="pill" name="type"><option value="decay" selected>Decay Function</option></select>
          </label>
          <label class="inline narrow"><div>Apply Slot Level Volatility Rules</div>
            <div class="toggle-wrap"><input class="toggle-input" type="checkbox" id="apply_slot_vol"><label for="apply_slot_vol" class="toggle"></label></div>
          </label>
          <label class="inline narrow"><div>Apply Weekly Volatility Rules</div>
            <div class="toggle-wrap"><input class="toggle-input" type="checkbox" id="apply_week_vol"><label for="apply_week_vol" class="toggle"></label></div>
          </label>
        </div>

        <!-- Strategy Parameters -->
        <div class="fieldset">
          <div class="legend">Strategy Parameters</div>
          <label class="inline"><div>Lookback weeks</div><input class="pill" name="lookback_weeks" type="number" min="2" max="25" placeholder="e.g. 5"></label>
          <label class="inline"><div>Decay α</div><input class="pill" name="decay_alpha" type="number" step="0.01" min="0" max="1" placeholder="0.00–1.00" id="decay-alpha-row"></label>
          <label class="inline"><div>Override Decay</div>
            <div class="toggle-wrap"><input class="toggle-input" type="checkbox" id="override_decay"><label for="override_decay" class="toggle"></label></div>
          </label>
          <div id="ud-override-box" style="display:none;">
            <div class="muted">Enter weights per week (≤1.00, sum = 1.00)</div>
            <div id="ud-override-rows" style="margin-top:6px;"></div>
          </div>
        </div>

        <!-- Strategy Preview -->
        <div id="ud-view">
          <div class="legend">Strategy Preview</div>
          <svg id="ud-curve-svg" viewBox="0 0 600 220" preserveAspectRatio="none"></svg>
          <div id="ud-error-msg" class="ud-err" style="display:none;"></div>
          <div class="muted" style="text-align:center;margin-top:4px;">X = week index, Y = weight</div>
        </div>

        <!-- Slot of Day Volatility (editor) -->
        <div id="ud-vol-slot" class="fieldset" style="display:none;">
          <div class="legend">Slot of Day Volatility</div>
          <label class="inline"><div>Volatility λ</div>
            <input class="pill" name="volatility_lambda" type="number" step="0.01" min="0" max="1" placeholder="0.00–1.00">
          </label>
          <label class="inline"><div>Trust floor / ceiling</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <input class="pill" name="trust_floor" type="number" step="0.01" min="0" max="1" placeholder="floor e.g., 0.2">
              <input class="pill" name="trust_ceiling" type="number" step="0.01" min="0" max="1" placeholder="ceiling e.g., 0.9">
            </div>
          </label>
          <label class="inline"><div>Global–local blend</div>
            <input class="pill" name="blend_global" type="number" step="0.05" min="0" max="1" placeholder="0.0–1.0 (e.g., 0.5)">
          </label>
        </div>

        <!-- Slot Effect Preview -->
        <div id="ud-slot-view" style="display:none;">
          <div class="legend">Slot Effect Preview (line: % of day, columns: trust)</div>
          <svg id="ud-slot-svg" viewBox="0 0 600 220" preserveAspectRatio="none"></svg>
          <div id="ud-slot-error" class="ud-err" style="display:none;"></div>
          <div class="badges" id="ud-slot-badges"></div>
          <div class="note-warn" role="note" aria-live="polite">
            <div class="icon">⚠️</div>
            <div>
              This chart uses <b>pseudo data</b> to visualize how slot-level history is processed
              (trend, residuals, and trust). It’s for illustration only—production runs use your real data.
            </div>
          </div>
          <div class="muted" style="text-align:center;margin-top:4px;">
            Trust reflects residual volatility vs global baseline; edges corrected for sample size.
          </div>
        </div>

        <!-- Week of Day Volatility (editor) -->
        <div id="ud-vol-wod" class="fieldset" style="display:none;">
          <div class="legend">Week of Day Volatility</div>
          <label class="inline"><div>Volatility λ</div>
            <input class="pill" name="wod_lambda" type="number" step="0.01" min="0" max="1" placeholder="0.00–1.00">
          </label>
          <label class="inline"><div>Trust floor / ceiling</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <input class="pill" name="wod_trust_floor" type="number" step="0.01" min="0" max="1" placeholder="floor e.g., 0.2">
              <input class="pill" name="wod_trust_ceiling" type="number" step="0.01" min="0" max="1" placeholder="ceiling e.g., 0.9">
            </div>
          </label>
          <label class="inline"><div>Global–local blend</div>
            <input class="pill" name="wod_blend_global" type="number" step="0.05" min="0" max="1" placeholder="0.0–1.0 (e.g., 0.5)">
          </label>
        </div>

        <!-- Week of Day Volatility Preview -->
        <div id="ud-wod-view" style="display:none;">
          <div class="legend">Week of Day Volatility Preview</div>
          <svg id="ud-wod-svg" viewBox="0 0 600 220" preserveAspectRatio="none"></svg>
          <div id="ud-wod-error" class="ud-err" style="display:none;"></div>
          <div class="badges" id="ud-wod-badges"></div>
          <div class="note-warn" role="note" aria-live="polite">
            <div class="icon">⚠️</div>
            <div>
              This preview uses <b>pseudo day-of-week history</b> (T-N … T-1) for demonstration.
              Actual values will be derived from your store’s data per day-of-week.
            </div>
          </div>
          <div class="muted" style="text-align:center;margin-top:4px;">
            Trend-aware, trust bars show stability for this weekday across the lookback window.
          </div>
        </div>

        <!-- Strategy Constraints -->
        <div class="fieldset" id="ud-constraints">
          <div class="legend">Strategy Constraints</div>

          <label class="inline">
            <div>Minimum historical weeks</div>
            <input class="pill" name="min_weeks_required" type="number" min="1" max="25" placeholder="e.g. 6">
          </label>

          <label class="inline">
            <div>Low-volume padding rule</div>
            <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:8px;align-items:center;">
              <div class="muted">If &lt; X</div>
              <input class="pill" name="lv_threshold" type="number" step="1" min="0" placeholder="X (orders)">
              <div class="muted">set floor to</div>
              <input class="pill" name="lv_floor" type="number" step="1" min="0" placeholder="Y (orders)">
            </div>
          </label>
        </div>

        <div class="fieldset">
          <div class="inline-center">
            <label for="ud-created-by" class="label">Created by</label>
            <input id="ud-created-by" class="pill grow" name="created_by" placeholder="insert creator's name" />
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button type="button" id="ud-create-btn" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer;">Create Strategy</button>
        </div>

        <!-- Global error slot (used by Create validation) -->
        <div id="ud-strategy-errors" class="muted" style="color:#b91c1c;margin-top:6px;"></div>

        <!-- JSON Preview Modal -->
        <div id="ud-json-modal" style="display:none; position:fixed; inset:0; background:rgba(2,6,23,.55); z-index:9999; align-items:center; justify-content:center;">
          <div style="background:#fff; border-radius:12px; width:min(760px, 92vw); max-height:80vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid #e2e8f0;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e2e8f0;">
              <div style="font-weight:700;">Strategy JSON (preview)</div>
              <button type="button" id="ud-json-close" class="btn-plain" style="border:0; background:#f1f5f9; border-radius:8px; padding:6px 10px; cursor:pointer;">Close</button>
            </div>
            <pre id="ud-json-pre" style="margin:0; padding:12px; white-space:pre-wrap; overflow:auto; font-size:12px; background:#0b1220; color:#e5e7eb;"></pre>
            <div style="display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid #e2e8f0;">
              <button type="button" id="ud-json-copy" class="btn-chip">Copy</button>
              <button type="button" id="ud-json-download" class="btn-chip">Download</button>
            </div>
          </div>
        </div>
      </form>
    `;
  }

  // ---------- Wiring ----------
  function wire(form, svgMain, svgSlot, svgWod, btn) {
    const lb = form.elements.lookback_weeks;
    const alphaRow = form.querySelector("#decay-alpha-row");
    const chkOv = form.querySelector("#override_decay");
    const chkSlot = form.querySelector("#apply_slot_vol");
    const chkWeek = form.querySelector("#apply_week_vol");

    const toggle = (chk, sel) => { const el=form.querySelector(sel); if (el) el.style.display = chk.checked ? "" : "none"; };

    chkOv.addEventListener("change", () => {
      toggle(chkOv, "#ud-override-box");
      alphaRow.parentElement.style.display = chkOv.checked ? "none" : "";
      if (chkOv.checked) makeOverrideRows(form);
      renderAll(form, svgMain, svgSlot, svgWod, btn);
    });

    chkSlot.addEventListener("change", () => {
      toggle(chkSlot, "#ud-vol-slot");
      toggle(chkSlot, "#ud-slot-view");
      renderAll(form, svgMain, svgSlot, svgWod, btn);
    });

    chkWeek.addEventListener("change", () => {
      toggle(chkWeek, "#ud-vol-wod");
      toggle(chkWeek, "#ud-wod-view");
      renderAll(form, svgMain, svgSlot, svgWod, btn);
    });

    lb.addEventListener("input", () => { if (chkOv.checked) makeOverrideRows(form); renderAll(form, svgMain, svgSlot, svgWod, btn); });
    form.addEventListener("input", debounce(() => renderAll(form, svgMain, svgSlot, svgWod, btn), 120));

    // reflect initial toggle states on mount
    toggle(chkSlot, "#ud-vol-slot"); toggle(chkSlot, "#ud-slot-view");
    toggle(chkWeek, "#ud-vol-wod");  toggle(chkWeek, "#ud-wod-view");

    // Create Strategy — validate visible fields, build JSON, show modal
    btn.addEventListener('click', () => {
      const result = validateAndBuild(form);
      const errors = form.querySelector('#ud-strategy-errors') || form.querySelector('#ud-error-msg');
      if (!result.ok) {
        if (errors) { errors.style.display = ''; errors.textContent = result.error; }
        if (result.el) { result.el.classList.add('invalid'); result.el.scrollIntoView({ behavior:'smooth', block:'center' }); }
        return;
      }
      if (errors) { errors.style.display='none'; errors.textContent=''; }
      showJsonModal(result.json);
    });
  }

  // ---------- Override rows ----------
  function makeOverrideRows(form) {
    const rows = form.querySelector("#ud-override-rows");
    const n = clampInt(form.elements.lookback_weeks.value || "0", 2, 25);
    rows.innerHTML = "";
    for (let i = 0; i < n; i++) {
      rows.insertAdjacentHTML("beforeend",
        `<div style="display:grid;grid-template-columns:70px 1fr;gap:8px;align-items:center;margin-top:4px;">
           <div>W${i + 1}</div>
           <input class="pill" type="number" step="0.0001" min="0" max="1" name="override_${i}" placeholder="0.0">
         </div>`
      );
    }
  }

  // ---------- Render orchestrator ----------
  function renderAll(form, svgMain, svgSlot, svgWod, btn) {
    renderMain(form, svgMain, btn);
    renderSlotTrust(form, svgSlot);
    renderWodTrust(form, svgWod);
    validateConstraints(form);
  }

  // ---------- Strategy Preview (decay curve) ----------
  let lastWeights = [];
  function renderMain(form, svg, btn) {
    const nRaw = parseInt(form.elements.lookback_weeks.value, 10);
    const lookbackValid = Number.isFinite(nRaw) && nRaw >= 2 && nRaw <= 25;

    const alphaStr = form.elements.decay_alpha.value;
    const alpha = parseFloat(alphaStr);
    const alphaValid = !Number.isNaN(alpha) && alphaStr.trim() !== "";

    const override = form.querySelector("#override_decay").checked;
    const errMsg = form.querySelector("#ud-error-msg");

    // Gate: if lookback missing OR (no override AND decay missing) => show error/hide chart
    if (!lookbackValid || (!override && !alphaValid)) {
      svg.style.display = "none";
      errMsg.style.display = "";
      errMsg.textContent = "Missing required input: please enter Lookback weeks and Decay α.";
      btn.disabled = true;
      return;
    }

    const n = Math.max(2, Math.min(nRaw, 25));
    let weights = [];
    let valid = true;

    if (override) {
      for (let i = 0; i < n; i++) {
        const input = form.elements[`override_${i}`];
        const v = parseFloat(input?.value || "0");
        if (v > 1) { input.classList.add("invalid"); input.title = "Each weight ≤ 1.00"; valid = false; }
        else { input.classList.remove("invalid"); input.title = ""; }
        weights.push(Number.isFinite(v) ? v : 0);
      }
      const sum = weights.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.001) {
        errMsg.style.display = "";
        errMsg.textContent = `Invalid override: weights must sum to 1.00 (current: ${sum.toFixed(3)})`;
        svg.style.display = "none";
        valid = false;
      } else { errMsg.style.display = "none"; svg.style.display = ""; }
    } else {
      const raw = Array.from({ length: n }, (_, i) => (1 - alpha) * Math.pow(alpha, i));
      const s = raw.reduce((a, b) => a + b, 0) || 1;
      weights = raw.map(v => v / s);
      errMsg.style.display = "none";
      svg.style.display = "";
    }

    btn.disabled = !valid;
    if (!valid) return;

    animateCurve(svg, lastWeights, weights);
    lastWeights = weights;
  }

  // ---------- Slot-of-Day trust preview ----------
  function renderSlotTrust(form, svg) {
    const wrap    = form.querySelector("#ud-slot-view");
    const err     = form.querySelector("#ud-slot-error");
    const badges  = form.querySelector("#ud-slot-badges");
    const on      = form.querySelector("#apply_slot_vol").checked;

    wrap.style.display = on ? "" : "none";
    if (!on) return;

    let N = parseInt(form.elements.lookback_weeks?.value, 10);
    if (!Number.isFinite(N) || N < 2) {
      svg.style.display = "none";
      if (badges) badges.style.display = "none";
      err.style.display = "";
      err.textContent = "Missing required input: please enter Lookback weeks";
      return;
    }
    err.style.display = "none";
    if (badges) badges.style.display = "";
    svg.style.display = "";

    // SLOT inputs (independent of WoD)
    let lambda = numOr(form.elements.volatility_lambda?.value, 1);
    let floor  = clamp(numOr(form.elements.trust_floor?.value, 0.2), 0, 1);
    let ceil   = clamp(numOr(form.elements.trust_ceiling?.value, 0.9), 0, 1);
    if (ceil < floor) ceil = floor;
    let blendG = clamp(numOr(form.elements.blend_global?.value, 0.5), 0, 1);

    const series = PSEUDO_SLOT.slice(0, N);
    const trend  = linearFit(series);
    const blended= series.map((v, i) => (1 - blendG) * v + blendG * trend[i]);
    const res    = series.map((v, i) => v - blended[i]);
    const z      = robustZ(res);
    const trust  = z.map(v => clamp(1 - lambda * v, floor, ceil));

    setBadges(badges, avg(trust));
    drawComboTrust(svg, series, trust, trend);
  }

  // ---------- Week-of-Day trust preview ----------
  function renderWodTrust(form, svg) {
    const wrap    = form.querySelector("#ud-wod-view");
    const err     = form.querySelector("#ud-wod-error");
    const badges  = form.querySelector("#ud-wod-badges");
    const on      = form.querySelector("#apply_week_vol").checked;

    wrap.style.display = on ? "" : "none";
    if (!on) return;

    let N = parseInt(form.elements.lookback_weeks?.value, 10);
    if (!Number.isFinite(N) || N < 2) {
      svg.style.display = "none";
      if (badges) badges.style.display = "none";
      err.style.display = "";
      err.textContent = "Missing required input: please enter Lookback weeks";
      return;
    }
    err.style.display = "none";
    if (badges) badges.style.display = "";
    svg.style.display = "";

    // WOD inputs (independent from Slot)
    let lambda = numOr(form.elements.wod_lambda?.value, 1);
    let floor  = clamp(numOr(form.elements.wod_trust_floor?.value, 0.2), 0, 1);
    let ceil   = clamp(numOr(form.elements.wod_trust_ceiling?.value, 0.9), 0, 1);
    if (ceil < floor) ceil = floor;
    let blendG = clamp(numOr(form.elements.wod_blend_global?.value, 0.5), 0, 1);

    const series = PSEUDO_WOD.slice(0, N);
    const trend  = linearFit(series);
    const blended= series.map((v, i) => (1 - blendG) * v + blendG * trend[i]);
    const res    = series.map((v, i) => v - blended[i]);
    const z      = robustZ(res);
    const trust  = z.map(v => clamp(1 - lambda * v, floor, ceil));

    setBadges(badges, avg(trust));
    drawComboTrust(svg, series, trust, trend);
  }

  // ========= Data, Math, Drawing =========

  // Pseudo slot contributions (% of day) — 25 points
  const PSEUDO_SLOT = [
    0.006,0.012,0.032,0.018,0.044,
    0.009,0.015,0.022,0.017,0.028,
    0.011,0.008,0.019,0.027,0.035,
    0.014,0.021,0.018,0.024,0.031,
    0.016,0.013,0.026,0.029,0.041
  ];
  // Pseudo day-of-week series (% of week) — 25 points
  const PSEUDO_WOD = [
    0.024,0.028,0.031,0.026,0.033,
    0.029,0.030,0.032,0.034,0.035,
    0.031,0.029,0.027,0.030,0.033,
    0.036,0.034,0.035,0.037,0.039,
    0.038,0.037,0.036,0.040,0.041
  ];

  function numOr(v, d){ const x = parseFloat(v); return Number.isFinite(x) ? x : d; }
  function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
  function clampInt(v, lo, hi){ const x = parseInt(v,10); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; }
  function avg(arr){ return arr.reduce((a,b)=>a+b,0) / (arr.length||1); }

  function linearFit(y) {
    const N = y.length;
    const xs = Array.from({length:N}, (_,i)=>i+1);
    const xbar = avg(xs), ybar = avg(y);
    let num=0, den=0;
    for(let i=0;i<N;i++){ num += (xs[i]-xbar)*(y[i]-ybar); den += Math.pow(xs[i]-xbar,2); }
    const b1 = den ? num/den : 0;
    const b0 = ybar - b1*xbar;
    return xs.map(x => b0 + b1*x);
  }

  function robustZ(residuals, eps=1e-12) {
    const m   = median(residuals);
    const madV= mad(residuals, m) || eps;
    const zs  = residuals.map(r => Math.abs(r - m) / (1.4826*madV + eps));
    return zs.map(z => Math.max(0, Math.min(1, z/3)));
  }
  function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x,y)=>x-y);
    const mid = Math.floor(a.length/2);
    return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
  }
  function mad(arr, med) {
    const dev = arr.map(v => Math.abs(v - (med ?? median(arr))));
    return median(dev);
  }

  function drawComboTrust(svg, series, trust, trend) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const N = series.length;
    const W = 600, H = 220, L = 42, B = 26;
    const plotW = W - L - 8, plotH = H - 6 - B;

    const maxLeft  = Math.max(...series, 0.01);
    const maxRight = 1;

    const x = (idx) => L + (plotW * ((idx-1) / (N - 1 || 1)));
    const yL= (v) => 6 + (plotH * (1 - v / maxLeft));
    const yR= (t) => 6 + (plotH * (1 - t / maxRight));

    ax(svg, L,6, L,6+plotH); ax(svg, L,6+plotH, L+plotW,6+plotH); ax(svg, L+plotW,6, L+plotW,6+plotH);
    for(let i=1;i<=N;i++){ label(svg, x(i), H-8, 10, 'middle', String(i)); }
    for(let i=0;i<=4;i++){
      const yy=6+(plotH*(i/4));
      label(svg, 8,      yy+4, 10, 'start', ((maxLeft)*(1-i/4)*100).toFixed(2)+'%');
      label(svg, W-22,   yy+4, 10, 'end',   (maxRight*(1-i/4)*100).toFixed(0)+'%');
    }

    const barW = Math.max(6, plotW/(N*2));
    for(let i=1;i<=N;i++){
      const t = clamp(trust[i-1], 0, 1);
      const xC = x(i) - barW/2;
      const yC = yR(t);
      const h  = (6+plotH) - yC;
      const r  = mk('rect');
      r.setAttribute('x', xC); r.setAttribute('y', yC);
      r.setAttribute('width', barW); r.setAttribute('height', h);
      r.setAttribute('fill', 'rgba(124,58,237,0.28)');
      svg.appendChild(r);
    }

    const ptsTrend = trend.map((v,i)=>`${x(i+1)},${yL(v)}`).join(' ');
    const tr = mk('polyline'); tr.setAttribute('points', ptsTrend);
    tr.setAttribute('fill','none'); tr.setAttribute('stroke','#111827'); tr.setAttribute('stroke-width','2');
    tr.setAttribute('stroke-dasharray','6 5'); tr.setAttribute('opacity','0.6');
    svg.appendChild(tr);

    const pts = series.map((v,i)=>`${x(i+1)},${yL(v)}`).join(' ');
    const pl = mk('polyline'); pl.setAttribute('points', pts);
    pl.setAttribute('fill','none'); pl.setAttribute('stroke','#2563eb'); pl.setAttribute('stroke-width','2');
    svg.appendChild(pl);
    series.forEach((v,i)=>{ const c=mk('circle'); c.setAttribute('cx',x(i+1)); c.setAttribute('cy',yL(v)); c.setAttribute('r',3); c.setAttribute('fill','#2563eb'); svg.appendChild(c); });

    legend(svg, W, [
      ['#2563eb','Base (% of day)'],
      ['#111827','Global trend (fit)', true],
      ['rgba(124,58,237,0.28)','Trust (0–100%)', false, true],
    ]);
  }

  function setBadges(container, avgTrust) {
    if (!container) return;
    container.innerHTML = `<div class="badge">Avg trust: <em>${(avgTrust*100).toFixed(0)}%</em></div>`;
  }

  // Strategy preview drawing & helpers
  function animateCurve(svg, oldW, newW) {
    const steps = 20;
    const n = Math.max(oldW.length, newW.length);
    const pad = (arr, len) => [...arr, ...Array(Math.max(0,len - arr.length)).fill(0)];
    const a = pad(oldW, n), b = pad(newW, n);
    let f = 0;
    const anim = () => {
      f++;
      const t = f / steps;
      const mix = a.map((v, i) => v + (b[i] - v) * (1 - Math.pow(1 - t, 3)));
      drawWeights(svg, mix);
      if (f < steps) requestAnimationFrame(anim);
    };
    anim();
  }
  function drawWeights(svg, w) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!w.length) return;

    const W = 600, H = 220, L = 40, B = 26, plotW = W - L - 6, plotH = H - 6 - B;
    const maxY = Math.max(...w, 0.01);
    const x = i => L + (plotW * (i / (w.length - 1 || 1)));
    const y = v => 6 + (plotH * (1 - v / maxY));

    ax(svg, L,6, L,6+plotH); ax(svg, L,6+plotH, L+plotW,6+plotH);
    for(let i=0;i<w.length;i++){ label(svg, x(i), H-8, 10, 'middle', i+1); }
    for(let i=0;i<=4;i++){ const yy=6+(plotH*(i/4)); label(svg, 8, yy+4, 10, 'start', (maxY*(1-i/4)).toFixed(2)); }

    const pts = w.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
    const pl = mk("polyline"); pl.setAttribute("points",pts); pl.setAttribute("fill","none"); pl.setAttribute("stroke","#2563eb"); pl.setAttribute("stroke-width","2");
    svg.appendChild(pl);
    w.forEach((v,i)=>{const c=mk("circle");c.setAttribute("cx",x(i));c.setAttribute("cy",y(v));c.setAttribute("r",3);c.setAttribute("fill","#2563eb");svg.appendChild(c);});
  }

  function mk(tag){ return document.createElementNS("http://www.w3.org/2000/svg", tag); }
  function ax(svg,x1,y1,x2,y2){ const l=mk('line'); l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2); l.setAttribute('stroke','#94a3b8'); svg.appendChild(l); }
  function label(svg,x,y,size,anchor,text){ const t=mk('text'); t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('font-size',size); if(anchor) t.setAttribute('text-anchor',anchor); t.textContent=String(text); svg.appendChild(t); }
  function legend(svg, W, items) {
    const g = mk('g'); let x0 = W - 10, y0 = 12;
    items.slice().reverse().forEach(([color,label,dashed,isBar])=>{
      const Ln=10, gap=6; x0 -= (label.length*6 + Ln + gap + 12);
      if (isBar) {
        const r=mk('rect'); r.setAttribute('x',x0); r.setAttribute('y',y0-7); r.setAttribute('width',Ln); r.setAttribute('height',10); r.setAttribute('fill',color); g.appendChild(r);
      } else {
        const line=mk('line'); line.setAttribute('x1',x0); line.setAttribute('y1',y0);
        line.setAttribute('x2',x0+Ln); line.setAttribute('y2',y0); line.setAttribute('stroke',color); line.setAttribute('stroke-width','2');
        if (dashed) line.setAttribute('stroke-dasharray','6 5');
        g.appendChild(line);
      }
      const tx=mk('text'); tx.setAttribute('x',x0+Ln+gap); tx.setAttribute('y',y0+3); tx.setAttribute('font-size','10'); tx.textContent=label; g.appendChild(tx);
      x0 -= 8;
    });
    svg.appendChild(g);
  }

  // --- Strategy Constraints: basic UI validation
  function validateConstraints(form){
    const t = parseFloat(form.elements.lv_threshold?.value);
    const f = parseFloat(form.elements.lv_floor?.value);
    const th = form.elements.lv_threshold, fl = form.elements.lv_floor;

    if (th) { th.classList.remove('invalid'); th.title = ''; }
    if (fl) { fl.classList.remove('invalid'); fl.title = ''; }

    if (Number.isFinite(t) && Number.isFinite(f) && f < t) {
      if (fl) { fl.classList.add('invalid'); fl.title = 'Floor should be ≥ threshold X'; }
    }
  }

  // -------- Create Strategy validation + JSON building --------
  function validateAndBuild(form){
    clearInvalids(form);
    const isShown = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';

    // Base fields
    const fId   = form.elements.strategy_id;
    const fName = form.elements.name;
    const fDesc = form.elements.description;
    const fLB   = form.elements.lookback_weeks;
    const fAlpha= form.elements.decay_alpha;
    const override = form.querySelector('#override_decay')?.checked;

    // Auto-generate ID if blank
    if (!fId.value.trim()) fId.value = uuidv4();

    // Required base
    if (!fName.value.trim()) return fail('Name is required', fName);

    const fCreator = form.elements.created_by;
    if (!fCreator || !fCreator.value.trim()) return fail('Created by is required', fCreator);

    const lb = parseInt(fLB?.value, 10);
    if (!Number.isFinite(lb) || lb < 2 || lb > 25) return fail('Lookback weeks must be 2–25', fLB);

    // Decay
    let decayMode = 'alpha';
    let overrideWeights = null;
    let alpha = null;

    if (override){
      decayMode = 'override';
      const weights = [];
      for (let i = 0; i < lb; i++){
        const el = form.elements[`override_${i}`];
        const v  = parseFloat(el?.value);
        if (!Number.isFinite(v) || v < 0 || v > 1) return fail(`Override weight W${i+1} must be 0–1`, el);
        weights.push(v);
      }
      const sum = weights.reduce((a,b)=>a+b,0);
      if (Math.abs(sum - 1) > 0.001) return fail(`Override weights must sum to 1.00 (current: ${sum.toFixed(3)})`, form.querySelector('#ud-override-rows'));
      overrideWeights = weights;
    } else {
      alpha = parseFloat(fAlpha?.value);
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return fail('Decay α must be 0.00–1.00', fAlpha);
    }

    // Slot-of-day volatility (only if toggle on and editor visible)
    const slotToggle = form.querySelector('#apply_slot_vol');
    const slotPanel  = form.querySelector('#ud-vol-slot');
    let slotVol = { enabled: !!slotToggle?.checked };
    if (slotVol.enabled && isShown(slotPanel)) {
      const fLam  = form.elements.volatility_lambda;
      const fFloor= form.elements.trust_floor;
      const fCeil = form.elements.trust_ceiling;
      const fBlend= form.elements.blend_global;

      const lam   = parseFloat(fLam?.value);
      const floor = parseFloat(fFloor?.value);
      const ceil  = parseFloat(fCeil?.value);
      const blend = parseFloat(fBlend?.value);

      if (!numIn(lam,0,1))   return fail('Slot-of-day λ must be 0.00–1.00', fLam);
      if (!numIn(floor,0,1)) return fail('Slot-of-day trust floor must be 0.00–1.00', fFloor);
      if (!numIn(ceil,0,1))  return fail('Slot-of-day trust ceiling must be 0.00–1.00', fCeil);
      if (ceil < floor)      return fail('Slot-of-day trust ceiling must be ≥ floor', fCeil);
      if (!numIn(blend,0,1)) return fail('Slot-of-day global–local blend must be 0.00–1.00', fBlend);

      slotVol = { enabled:true, lambda:lam, trust_floor:floor, trust_ceiling:ceil, blend_global:blend };
    }

    // Week-of-day volatility (only if toggle on and editor visible)
    const weekToggle = form.querySelector('#apply_week_vol');
    const weekEdit   = form.querySelector('#ud-vol-wod');
    let weekVol = { enabled: !!weekToggle?.checked };
    if (weekVol.enabled && isShown(weekEdit)) {
      const fLam   = form.elements.wod_lambda;
      const fFloor = form.elements.wod_trust_floor;
      const fCeil  = form.elements.wod_trust_ceiling;
      const fBlend = form.elements.wod_blend_global;

      const lam   = parseFloat(fLam?.value);
      const floor = parseFloat(fFloor?.value);
      const ceil  = parseFloat(fCeil?.value);
      const blend = parseFloat(fBlend?.value);

      if (!numIn(lam,0,1))   return fail('Week-of-day λ must be 0.00–1.00', fLam);
      if (!numIn(floor,0,1)) return fail('Week-of-day trust floor must be 0.00–1.00', fFloor);
      if (!numIn(ceil,0,1))  return fail('Week-of-day trust ceiling must be 0.00–1.00', fCeil);
      if (ceil < floor)      return fail('Week-of-day trust ceiling must be ≥ floor', fCeil);
      if (!numIn(blend,0,1)) return fail('Week-of-day global–local blend must be 0.00–1.00', fBlend);

      weekVol = { enabled:true, lambda:lam, trust_floor:floor, trust_ceiling:ceil, blend_global:blend };
    }

    // Constraints
    const fMinWeeks = form.elements.min_weeks_required;
    const fTh = form.elements.lv_threshold;
    const fFl = form.elements.lv_floor;

    let minWeeks = intOr(fMinWeeks?.value, null);
    if (minWeeks != null && (minWeeks < 2 || minWeeks > 25)) return fail('Minimum weeks required must be 2–25', fMinWeeks);

    let lvEnabled = false, thVal = null, flVal = null;
    const thNum = numOr(fTh?.value, NaN), flNum = numOr(fFl?.value, NaN);
    if (Number.isFinite(thNum) || Number.isFinite(flNum)) {
      if (!Number.isFinite(thNum) || !Number.isFinite(flNum)) return fail('Provide both X and Y for low-volume padding', ( !Number.isFinite(thNum) ? fTh : fFl ));
      if (flNum < thNum) return fail('Padding floor (Y) must be ≥ threshold (X)', fFl);
      lvEnabled = true; thVal = thNum; flVal = flNum;
    }

    // Build JSON with requested schema
    const out = {
      "strategy_id": fId.value.trim(),
      "name": fName.value.trim(),
      "description": fDesc?.value ?? "",
      "type": "decay",

      "parameters": {
        "lookback_weeks": lb,
        "decay": (decayMode === 'alpha'
          ? { "mode":"alpha", "alpha": alpha }
          : { "mode":"override", "override_weights": overrideWeights })
      },

      "volatility": {
        "slot_of_day": slotVol,
        "week_of_day": weekVol
      },

      "constraints": {
        "low_volume_padding": {
          "enabled": lvEnabled,
          "threshold_orders_lt": lvEnabled ? thVal : 0,
          "floor_orders_set_to": lvEnabled ? flVal : 0
        },
        "min_weeks_required": (minWeeks ?? lb)
      },

      "metadata": {
        "created_by": fCreator.value.trim(),
        "created_at": new Date().toISOString()
      },

      "preview_meta": {
        "ui_only": true,
        "notes": "non-persistent UI hints"
      },
      "version": 1
    };

    return { ok:true, json: out };

    function fail(msg, el){ return { ok:false, error: msg, el }; }
  }

  function clearInvalids(form){
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
  }

  function numIn(x, lo, hi){ return Number.isFinite(x) && x >= lo && x <= hi; }
  function intOr(v, d){ const x = parseInt(v,10); return Number.isFinite(x) ? x : d; }

  // RFC4122 v4 — use crypto.randomUUID when available, fallback otherwise
  function uuidv4(){
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    for (let i=0;i<16;i++) bytes[i] = Math.floor(Math.random()*256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = [...bytes].map(b => b.toString(16).padStart(2,'0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }

  // JSON modal (copy/download)
  function showJsonModal(obj){
    const modal = document.getElementById('ud-json-modal');
    const pre   = document.getElementById('ud-json-pre');
    const btnC  = document.getElementById('ud-json-copy');
    const btnD  = document.getElementById('ud-json-download');
    const btnX  = document.getElementById('ud-json-close');

    const text = JSON.stringify(obj, null, 2);
    pre.textContent = text;

    modal.style.display = 'flex';

    btnX.onclick = () => modal.style.display = 'none';
    btnC.onclick = async () => { try { await navigator.clipboard.writeText(text); btnC.textContent='Copied'; setTimeout(()=>btnC.textContent='Copy',1000);} catch{} };
    btnD.onclick = () => {
      const blob = new Blob([text], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${obj.strategy_id || 'strategy'}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
    };
  }

  // Small utilities
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

})();
