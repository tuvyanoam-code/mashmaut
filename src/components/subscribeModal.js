// A simple subscribe-by-email modal. Posts to /subscribe on the Worker.

import { icon } from '../icons.js';
import { apiBase } from '../lib/api.js';
import { showToast } from './shareButtons.js';

export function openSubscribeModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" aria-label="סגור">${icon('close', { size: 22 })}</button>
      <div class="modal-icon">${icon('email', { size: 36 })}</div>
      <h2>קבל את העלון למייל</h2>
      <p>בכל יום חמישי בערב נשלח אליך את העלון השבועי, יחד עם קישור נוח לשתף עם חברים.</p>
      <form id="subscribeForm">
        <input type="text" name="name" placeholder="שם מלא" required autofocus autocomplete="name" />
        <input type="email" name="email" placeholder="הכנס כתובת מייל" required />
        <button class="btn" type="submit">${icon('check', { size: 18 })} הירשם</button>
      </form>
      <p class="modal-fineprint">בלי ספאם. אפשר להסיר רישום בלחיצה אחת בכל מייל.</p>
      <div id="subscribeStatus"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('visible'), 10);

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#subscribeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = overlay.querySelector('#subscribeStatus');
    const fd = new FormData(e.target);
    const email = (fd.get('email') || '').trim();
    const name = (fd.get('name') || '').trim();
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
      status.innerHTML = '<div class="modal-status success">נרשמת בהצלחה. שלחנו לך מייל ברוך הבא.</div>';
      showToast('נרשמת בהצלחה');
      // Suppress the timed subscribe banner — they've just subscribed.
      try { localStorage.setItem('mashmaut.subInvite', 'done'); } catch (_) {}
      setTimeout(close, 1800);
    } catch (err) {
      status.innerHTML = `<div class="modal-status error">${err.message}</div>`;
    }
  });
}

export function openContactModal(adminEmail) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" aria-label="סגור">${icon('close', { size: 22 })}</button>
      <div class="modal-icon">${icon('share', { size: 36 })}</div>
      <h2>צור קשר</h2>
      <p>שלח הערה, שאלה, רעיון או תגובה — כל הודעה היא בברכה.</p>
      <a class="btn" href="mailto:${adminEmail}?subject=${encodeURIComponent('משוב על עלון משמעות')}">${icon('email', { size: 18 })} פתח מייל</a>
      <p class="modal-fineprint">${adminEmail}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('visible'), 10);
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
