// pages/slot-of-day.js — day-only multi-store curves via /curves-by-day

const API_BASE = window.ULTRADAR_API_BASE;

const $ = sel => document.querySelector(sel);
const dateInp    = $("#dateInput");
const plotBtn    = $("#plotBtn");
const downloadBtn= $("#downloadBtn");
const errorBox   = $("#errorBox");
const summary    = $("#summary");
const canvas     = $("#curvesChart");

let chart;
let lastPayload = null; // { labels, datasets } from API

// Prefill date with today (YYYY-MM-DD)
(function seedDate(){
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  dateInp.value ||= iso;
})();

function showError(msg){
  errorBox.textContent = msg || "Unknown error";
  errorBox.hidden = false;
  setTimeout(()=> (errorBox.hidden = true), 6000);
}

async function fetchJSON(url){
  const res = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-cache" });
  if (!res.ok) {
    const body = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} — ${body || res.statusText}`);
  }
  return res.json();
}

// Simple color util (distinct, readable)
function color(i){ const h=(i*47)%360; return `hsl(${h} 70% 45%)`; }

// Draw the chart
function draw(labels, datasets){
  if (chart) chart.destroy();
  const ds = datasets.map((d,i)=>({
    ...d,
    borderColor: color(i),
    borderWidth: 2,
    fill: false,
    tension: 0.25,
    pointRadius: 0
  }));
  chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { position: "top" },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}%` } }
      },
      scales: {
        x: { title: { display: true, text: "Time Interval" }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { title: { display: true, text: "% of Day" }, ticks: { callback: v => `${v}%` }, min: 0 }
      }
    }
  });
}

// Plot handler
async function plot(){
  const day = dateInp.value;
  if (!day) return showError("Pick a date.");

  try {
    plotBtn.disabled = true;
    downloadBtn.disabled = true;
    summary.textContent = `Loading ${day}…`;

    const payload = await fetchJSON(`${API_BASE}/curves-by-day?day=${encodeURIComponent(day)}`);
    const { labels, datasets } = payload || {};
    if (!labels?.length || !datasets?.length) {
      if (chart) chart.destroy();
      lastPayload = null;
      summary.textContent = "";
      return showError("No data for the selected day.");
    }

    draw(labels, datasets);
    lastPayload = payload;
    summary.textContent = `${datasets.length} stores • ${day}`;
  } catch (e){
    console.error(e);
    showError(e.message);
    summary.textContent = "";
    lastPayload = null;
    if (chart) chart.destroy();
  } finally {
    plotBtn.disabled = false;
    downloadBtn.disabled = !lastPayload;
  }
}

// Download the current payload as JSON
function download(){
  if (!lastPayload) return;
  const day = dateInp.value || "day";
  const blob = new Blob([JSON.stringify(lastPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `curves-by-day_${day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

plotBtn.addEventListener("click", plot);
downloadBtn.addEventListener("click", download);
