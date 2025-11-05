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
(function highlightActive() {
  const here = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('.nav__link').forEach(a => {
    const href = a.getAttribute('href') || '';
    // normalize relative links
    const normalized = href.startsWith('pages/') ? `/${href}` : href;
    if (normalized === here || (here === '' && normalized === '/')) {
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
  const a = document.querySelector(`a[href="${pathname}"]`);
  if (a) a.classList.add('is-active');
};

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();
