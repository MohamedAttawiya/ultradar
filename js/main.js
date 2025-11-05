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
