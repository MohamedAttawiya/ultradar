// Helpers
const normalizePath = (pathname) => {
  if (!pathname) return '/';
  return pathname.replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
};

const resolvePath = (href, base = location.href) => {
  try {
    const url = new URL(href, base);
    return normalizePath(url.pathname);
  } catch (_e) {
    return normalizePath(href);
  }
};

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Active link highlight (simple path-based match)
(function highlightActiveOnLoad() {
  const here = normalizePath(location.pathname);
  document.querySelectorAll('.nav__link').forEach((a) => {
    if (resolvePath(a.getAttribute('href')) === here) {
      a.classList.add('is-active');
    }
  });
})();

// Country selector persistence & metadata
const COUNTRY_OPTIONS = ['AE', 'SA', 'EG'];
const COUNTRY_STORAGE_KEY = 'ultradar.country';
const DEFAULT_COUNTRY = COUNTRY_OPTIONS[0];

const sanitizeCountry = (value) => {
  const code = (value || '').toUpperCase();
  return COUNTRY_OPTIONS.includes(code) ? code : DEFAULT_COUNTRY;
};

const ensureCountryMeta = () => {
  let meta = document.querySelector('meta[name="ultradar-country"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'ultradar-country';
    document.head.appendChild(meta);
  }
  return meta;
};

const applyCountry = (value) => {
  const country = sanitizeCountry(value);
  document.documentElement.setAttribute('data-country', country);
  ensureCountryMeta().setAttribute('content', country);
  return country;
};

const readStoredCountry = () => {
  try {
    return localStorage.getItem(COUNTRY_STORAGE_KEY);
  } catch (_e) {
    return null;
  }
};

const writeStoredCountry = (country) => {
  try {
    localStorage.setItem(COUNTRY_STORAGE_KEY, country);
  } catch (_e) {
    // Storage might be unavailable (Safari private mode, etc.)
  }
};

const initCountrySelector = (root = document) => {
  const select = root.querySelector('#countrySelector');
  if (!select) return;

  const stored = sanitizeCountry(readStoredCountry());
  select.value = stored;
  applyCountry(stored);

  select.addEventListener('change', (event) => {
    const next = sanitizeCountry(event.target.value);
    select.value = next;
    applyCountry(next);
    writeStoredCountry(next);
    document.dispatchEvent(new CustomEvent('ultradar:countrychange', {
      detail: { country: next }
    }));
  });
};

const initialCountry = applyCountry(sanitizeCountry(readStoredCountry()));
writeStoredCountry(initialCountry);
initCountrySelector(document);

// js/main.js
window.injectPartial = async function injectPartial(targetId, path){
  try {
    const el = document.getElementById(targetId);
    if (!el) return;
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch ' + path);
    el.innerHTML = await res.text();
    const navToggle = document.getElementById('navToggle');
    const mainNav = document.getElementById('mainNav');
    if (navToggle && mainNav) {
      navToggle.addEventListener('click', () => {
        const open = mainNav.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    initCountrySelector(el);
  } catch (e){ console.error(e); }
};
window.highlightActive = function highlightActive(pathname){
  const targetPath = resolvePath(pathname);
  document.querySelectorAll('.nav__link').forEach((a) => {
    if (resolvePath(a.getAttribute('href')) === targetPath) {
      a.classList.add('is-active');
    }
  });
};

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
