// A gentle, timed "subscribe to the weekly bulletin" invite that slides up
// after the reader has spent ~2 minutes on the site. Shares the subscribe
// modal's visual language (rounded card, email icon, pill inputs). Shows at
// most once per browser until it's dismissed or the reader subscribes.

import { icon } from '../icons.js';
import { apiBase } from '../lib/api.js';
import { showToast } from './shareButtons.js';

const FLAG_KEY = 'mashmaut.subInvite'; // set to 'done' | 'dismissed' once handled
const DELAY_MS = 2 * 60 * 1000; // 2 minutes on the site

function handled() {
  try { return !!localStorage.getItem(FLAG_KEY); } catch (_) { return false; }
}
function setFlag(v) {
  try { localStorage.setItem(FLAG_KEY, v); } catch (_) {}
}

/** Start the 2-minute timer. Safe to call once at app start. */
export function initSubscribeBanner() {
  if (handled()) return;
  setTimeout(() => {
    if (handled()) return;
    if (location.pathname.startsWith('/admin')) return; // never over the admin panel
    if (document.querySelector('.subscribe-banner')) return;
    showSubscribeBanner();
  }, DELAY_MS);
}

export function showSubscribeBanner() {
  if (document.querySelector('.subscribe-banner')) return;
  const el = document.createElement('div');
  el.className = 'subscribe-banner';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'הרשמה לעלון משמעות');
  el.innerHTML = `
    <button type="button" class="subscribe-banner-close" aria-label="סגור">${icon('close', { size: 18 })}</button>
    <div class="subscribe-banner-icon">${icon('email', { size: 26 })}</div>
    <h3 class="subscribe-banner-title">קבל את העלון כל שבוע</h3>
    <p class="subscribe-banner-text">בכל יום חמישי — רעיון לפרשת השבוע, ישר לתיבה שלך. בלי ספאם, הסרה בלחיצה אחת.</p>
    <form class="subscribe-banner-form">
      <input type="text" name="name" placeholder="שם מלא" required autocomplete="name" />
      <input type="email" name="email" placeholder="הכנס כתובת מייל" required />
      <button class="btn" type="submit">${icon('check', { size: 18 })} הירשם</button>
    </form>
    <div class="subscribe-banner-status"></div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));

  const close = (flag) => {
    if (flag) setFlag(flag);
    el.classList.remove('visible');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 320);
  };
  const onKey = (e) => { if (e.key === 'Escape') close('dismissed'); };
  document.addEventListener('keydown', onKey);

  el.querySelector('.subscribe-banner-close').addEventListener('click', () => close('dismissed'));

  el.querySelector('.subscribe-banner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = el.querySelector('.subscribe-banner-status');
    const fd = new FormData(e.target);
    const name = (fd.get('name') || '').trim();
    const email = (fd.get('email') || '').trim();
    if (!name) { status.innerHTML = '<div class="modal-status error">נא להזין שם מלא</div>'; return; }
    status.innerHTML = '<div class="modal-status">שולח…</div>';
    try {
      const base = await apiBase();
      if (!base) throw new Error('המערכת עדיין לא הוגדרה');
      const r = await fetch(base + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'שגיאה');
      status.innerHTML = '<div class="modal-status success">נרשמת בהצלחה! שלחנו לך מייל ברוך הבא.</div>';
      showToast('נרשמת בהצלחה');
      setFlag('done');
      setTimeout(() => close(), 1900);
    } catch (err) {
      status.innerHTML = `<div class="modal-status error">${err.message}</div>`;
    }
  });
}
