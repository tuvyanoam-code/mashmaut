// Auto-hide the top nav while reading: it slides away on scroll-down and
// returns on scroll-up (and is always shown near the top). Reuses the existing
// `.nav--hidden` class (transform: translateY(-100%) with a 260ms transition).
//
// The home page runs its own splash-based nav logic (home.js), and the PDF
// view hides the nav entirely, so both are skipped here.

const DELTA = 6;      // ignore sub-pixel / jittery scrolls
const TOP_ZONE = 90;  // always reveal within this many px of the top

export function initNavAutoHide() {
  if (typeof window === 'undefined') return;
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const body = document.body;
    if (body.classList.contains('is-home') || body.classList.contains('is-pdf')) return;
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const y = window.scrollY;
    if (y <= TOP_ZONE) { nav.classList.remove('nav--hidden'); lastY = y; return; }
    const d = y - lastY;
    if (Math.abs(d) < DELTA) return;
    nav.classList.toggle('nav--hidden', d > 0); // down → hide, up → show
    lastY = y;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}
