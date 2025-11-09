// strategy-form.js — full drop-in with correct Strategy Preview gating:
// Preview hides if either Lookback weeks OR Decay α is missing (unless Override Decay is ON).
// Also includes error banners in Slot/Week previews + pseudo-data warnings from prior version.

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
      .legend{ font-weight:700; margin-bottom:6px; color:var(--ink); }
      .muted{ color:var(--muted); font-size:12px; }
      .pill, .pill-textarea, select.pill{ border-radius:9999px; padding:8px 12px; border:1px solid var(--neutral); background:#fff; transition:border-color .12s, box-shadow .12s; }
      .pill-textarea{ border-radius:16px; padding:10px 12px; min-height:72px; resize:vertical; width:100%; }
      .pill:focus, .pill-textarea:focus, select.pill:focus{ border-color:var(--brand); outline:none; box-shadow:0 0 0 3px rgba(37,99,235,.15); }
      .pill.invalid{ border-color:var(--error); box-shadow:0 0 0 2px rgba(220,38,38,.3); }
      .toggle-wrap{ display:flex; justify-content:flex-end; align-items:center; }
      .toggle{ position:relative; width:42px; height:22px; border-radius:9999px; background:#cbd5e1; transition:background .2s ease; cursor:pointer; display:inline-block; }
      .toggle::after{ content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s ease; }
      input[type="checkbox"].toggle-input{ display:none; }
      input[type="checkbox"].toggle-input:checked + .toggle{ background:var(--brand); }
      input[type="checkbox"].toggle-input:checked + .toggle::after{ left:23px; }
      #ud-view, #ud-slot-view, #ud-wod-view{ border:1px solid var(--neutral); border-radius:12px; padding:var(--pad); margin-top:14px; min-height:200px; }
      #ud-curve-svg, #ud-slot-svg, #ud-wod-svg{ width:100%; height:220px; display:block; }
      .ud-err{ color:#dc2626; font-weight:700; text-align:center; margin-top:70px; }
      .badges { display:flex; gap:8px; justify-content:flex-end; margin-top:6px; flex-wrap:wrap; }
      .badge { background:#f1f5f9; border:1px solid var(--neutral); border-radius:9999px; padding:4px 8px; font-size:12px; }
      .badge em { font-style:normal; font-weight:700; }
      .note-warn { display:flex; gap:8px; align-items:flex-start; background:#fff7ed; border:1px solid #fdba74; color:#9a3412; border-radius:10px; padding:8px 10px; line-height:1.35; margin-top:6px; }
      .note-warn .icon { line-height:1; font-size:14px; }
      .inline.narrow { grid-template-columns: 180px 1fr; }
      .inline-center { display:flex; align-items:center; gap:12px; margin-top:8px; }
      .inline-center .label { width: var(--label); font-weight:600; }
      .inline-center .grow { flex:1; }
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

        <div id="ud-view">
          <div class="legend">Strategy Preview</div>
          <svg id="ud-curve-svg" viewBox="0 0 600 220" preserveAspectRatio="none"></svg>
          <div id="ud-error-msg" class="ud-err" style="display:none;"></div>
          <div class="muted" style="text-align:center;margin-top:4px;">X = week index, Y = weight</div>
        </div>

        <div id="ud-vol-slot" class="fieldset" style="display:none;">
          <div class="legend">Slot of Day Volatility</div>
          <label class="inline"><div>Volatility λ</div><input class="pill" name="volatility_lambda" type="number" step="0.01" min="0" max="1" placeholder="0.00–1.00"></label>
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

        <div class="fieldset">
          <div class="inline-center">
            <label for="ud-created-by" class="label">Created by</label>
            <input id="ud-created-by" class="pill grow" name="created_by" placeholder="insert creator's name" />
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button type="button" id="ud-create-btn" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer;">Create Strategy</button>
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
      renderAll(form, svgMain, svgSlot, svgWod, btn);
    });

    chkWeek.addEventListener("change", () => renderAll(form, svgMain, svgSlot, svgWod, btn));

    lb.addEventListener("input", () => { if (chkOv.checked) makeOverrideRows(form); renderAll(form, svgMain, svgSlot, svgWod, btn); });

    form.addEventListener("input", debounce(() => renderAll(form, svgMain, svgSlot, svgWod, btn), 120));
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
  }

  // ---------- Strategy Preview (decay curve) ----------
  let lastWeights = [];
  function renderMain(form, svg, btn) {
    // RAW lookback read (no clamping before validation)
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

    // Now safe to clamp for drawing
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

    let lambda = numOr(form.elements.volatility_lambda?.value, 1);
    let floor  = clamp(numOr(form.elements.trust_floor?.value, 0.2), 0, 1);
    let ceil   = clamp(numOr(form.elements.trust_ceiling?.value, 0.9), 0, 1);
    if (ceil < floor) ceil = floor;
    let blendG = clamp(numOr(form.elements.blend_global?.value, 0.5), 0, 1);

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

  const PSEUDO_SLOT = [
    0.006,0.012,0.032,0.018,0.044,
    0.009,0.015,0.022,0.017,0.028,
    0.011,0.008,0.019,0.027,0.035,
    0.014,0.021,0.018,0.024,0.031,
    0.016,0.013,0.026,0.029,0.041
  ];
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
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

})();
