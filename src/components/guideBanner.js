// A one-time invite that points first-time visitors at the new usage guide.
// Slides up shortly after arrival, links to /guide, and never shows again once
// seen or dismissed. Reuses the subscribe banner's visual language (rounded
// card, coloured icon, changing accent colour).

import { icon } from '../icons.js';
import { navigate } from '../router.js';

const FLAG_KEY = 'mashmaut.guideInvite'; // 'seen' | 'dismissed' | 'done'
const DELAY_MS = 7000; // let the page settle, then invite

function handled() {
  try { return !!localStorage.getItem(FLAG_KEY); } catch (_) { return false; }
}
function setFlag(v) {
  try { localStorage.setItem(FLAG_KEY, v); } catch (_) {}
}

/** Arm the first-visit timer. Safe to call once at app start. */
export function initGuideBanner() {
  if (handled()) return;
  setTimeout(() => {
    if (handled()) return;
    const p = location.pathname;
    if (p.startsWith('/admin')) return;                 // never over the admin panel
    if (p === '/guide' || p.startsWith('/guide/')) return; // pointless if they're already there
    if (document.querySelector('.subscribe-banner-overlay')) return; // don't stack over another invite
    showGuideBanner();
  }, DELAY_MS);
}

export function showGuideBanner() {
  if (document.querySelector('.guide-invite-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'subscribe-banner-overlay guide-invite-overlay';
  overlay.innerHTML = `
    <div class="subscribe-banner guide-invite" role="dialog" aria-modal="true" aria-label="מדריך שימוש לאתר">
      <button type="button" class="subscribe-banner-close" data-close aria-label="סגור">${icon('close', { size: 18 })}</button>
      <div class="subscribe-banner-icon">${icon('star', { size: 26 })}</div>
      <h3 class="subscribe-banner-title">חדש — סיור מודרך באתר</h3>
      <p class="subscribe-banner-text">רוצים להכיר את כל מה שאפשר לעשות כאן? הכנו מדריך קצר עם סרטונים — קריאה, ניווט בפרקים, חיפוש, שיחה, שיתוף והרשמה. שלב אחר שלב.</p>
      <div class="guide-invite-actions">
        <button type="button" class="btn" data-go>${icon('book', { size: 18 })} <span>לסיור המהיר</span></button>
        <button type="button" class="btn-text guide-invite-later" data-later>אולי אחר כך</button>
      </div>
    </div>
  `;
  // Inherit the current page's (per-bulletin) accent so the icon + button match
  // the site's changing colour, not the default green.
  const themed = document.querySelector('[style*="--bulletin-primary"]');
  if (themed) {
    const c = getComputedStyle(themed).getPropertyValue('--bulletin-primary').trim();
    if (c) overlay.style.setProperty('--bulletin-primary', c);
  }
  document.body.appendChild(overlay);
  setFlag('seen'); // shown once — never reappear in this browser
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = (flag) => {
    if (flag) setFlag(flag);
    overlay.classList.remove('visible');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 340);
  };
  const onKey = (e) => { if (e.key === 'Escape') close('dismissed'); };
  document.addEventListener('keydown', onKey);

  overlay.querySelector('[data-close]').addEventListener('click', () => close('dismissed'));
  overlay.querySelector('[data-later]').addEventListener('click', () => close('dismissed'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close('dismissed'); });
  overlay.querySelector('[data-go]').addEventListener('click', () => {
    close('done');
    navigate('/guide');
  });
}
