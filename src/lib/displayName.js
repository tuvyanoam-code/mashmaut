// Display name for comments — chosen on the first comment from this browser,
// stored in localStorage so subsequent comments don't re-prompt. The server
// enforces uniqueness per fp (first browser to claim a normalized name owns
// it) — so the prompt re-asks if the user picks a name that's already taken.

import { icon } from '../icons.js';

const STORAGE_KEY = 'mashmaut.displayName';

export function getDisplayName() {
  try { return (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch (_) { return ''; }
}

export function setDisplayName(name) {
  try { localStorage.setItem(STORAGE_KEY, String(name || '').trim()); } catch (_) {}
}

export function clearDisplayName() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/** Open a modal and resolve with the chosen name, or null if cancelled.
 *  Caller can pass an `error` to display (e.g. "name taken"). */
export function promptForDisplayName({ initial = '', error = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay name-prompt-overlay';
    overlay.innerHTML = `
      <div class="modal name-prompt" role="dialog" aria-modal="true" aria-label="בחירת שם">
        <button type="button" class="modal-close" aria-label="סגור">${icon('close', { size: 20 })}</button>
        <div class="modal-icon">${icon('email', { size: 28 })}</div>
        <h3 style="margin: 4px 0 6px;">איך אתה רוצה שיציגו אותך?</h3>
        <p class="muted" style="margin: 0 0 16px;">השם יופיע ליד התגובות שלך. אפשר לכנות את עצמך באיך שתרצה — שם פרטי, ראשי תיבות, או כינוי.</p>
        ${error ? `<div class="admin-status error" style="margin-bottom: 12px;">${escapeHtml(error)}</div>` : ''}
        <form class="name-prompt-form">
          <input type="text" name="name" maxlength="40" required autofocus placeholder="לדוגמה: ישראל" value="${escapeAttr(initial)}" style="width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; font: inherit; text-align: right; box-sizing: border-box;" />
          <p class="muted" style="font-size: .8rem; margin: 8px 0 16px;">2–40 תווים. השם יישמר במחשב שלך — תוכל לשנות בכל זמן.</p>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn-text" data-cancel>בטל</button>
            <button type="submit" class="btn">${icon('check', { size: 18 })} אישור</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const cleanup = (value) => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
    overlay.querySelector('.modal-close').addEventListener('click', () => cleanup(null));
    overlay.querySelector('[data-cancel]').addEventListener('click', () => cleanup(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (new FormData(e.target).get('name') || '').toString().trim();
      if (name.length < 2) return;
      cleanup(name);
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
