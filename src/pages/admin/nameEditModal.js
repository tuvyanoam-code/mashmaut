// Site-styled name editor for a subscriber (replaces the old browser prompts).
// Two tabs — full name, and the first name used for the weekly-email greeting —
// with a live preview of how the greeting will read. Resolves to the updated
// { name, firstName } on save, or null if cancelled.

import { icon } from '../../icons.js';
import { adminCall } from '../../lib/adminApi.js';

// Mirror of the worker's greeting rule: the whole name minus its last word.
function greetingFirstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const parts = n.split(/\s+/);
  return parts.length <= 1 ? n : parts.slice(0, -1).join(' ');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function openNameEditModal(sub) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="עריכת שם">
        <button class="modal-close" aria-label="סגור">${icon('close', { size: 22 })}</button>
        <div class="modal-icon">${icon('email', { size: 32 })}</div>
        <h2>עריכת שם</h2>
        <p class="modal-sub">${escapeHtml(sub.email || '')}</p>
        <div class="modal-tabs" role="tablist">
          <button type="button" class="modal-tab active" data-tab="full" role="tab">שם מלא</button>
          <button type="button" class="modal-tab" data-tab="first" role="tab">שם פרטי לפנייה</button>
        </div>
        <form id="nameForm">
          <div class="modal-panel" data-panel="full">
            <input type="text" name="fullName" placeholder="שם מלא" value="${escapeHtml(sub.name || '')}" autocomplete="off" />
            <p class="modal-hint">השם המלא כפי שמופיע ברשימת המנויים.</p>
          </div>
          <div class="modal-panel" data-panel="first" hidden>
            <input type="text" name="firstName" placeholder="אוטומטי" value="${escapeHtml(sub.firstName || '')}" autocomplete="off" />
            <p class="modal-hint">כך נפנה במייל: <b id="greetPreview"></b><br>
              השאר ריק לאוטומטי — כל השם חוץ מהמילה האחרונה. למשל <b>"יעקב בן זכאי"</b> ← כתוב <b>"יעקב"</b>.</p>
          </div>
          <button class="btn" type="submit">${icon('check', { size: 18 })} שמור</button>
          <div id="nameStatus"></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('visible'), 10);

    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(result || null);
    };
    overlay.querySelector('.modal-close').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); close(null); }
    });

    const fullInput = overlay.querySelector('input[name=fullName]');
    const firstInput = overlay.querySelector('input[name=firstName]');
    const greetPreview = overlay.querySelector('#greetPreview');
    const updatePreview = () => {
      const eff = firstInput.value.trim() || greetingFirstName(fullInput.value);
      greetPreview.textContent = eff ? `ערב שבת שלום, ${eff}!` : 'ערב שבת שלום!';
    };
    updatePreview();
    fullInput.addEventListener('input', updatePreview);
    firstInput.addEventListener('input', updatePreview);

    overlay.querySelectorAll('.modal-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t === tab));
        overlay.querySelectorAll('.modal-panel').forEach((pnl) => { pnl.hidden = pnl.dataset.panel !== tab.dataset.tab; });
        (tab.dataset.tab === 'full' ? fullInput : firstInput).focus();
      });
    });

    overlay.querySelector('#nameForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = overlay.querySelector('#nameStatus');
      const name = fullInput.value.trim();
      const firstName = firstInput.value.trim();
      status.innerHTML = '<div class="modal-status">שומר…</div>';
      try {
        await adminCall('/admin/subscribers/set-name', { method: 'POST', body: { email: sub.email, name, firstName } });
        close({ name: name || null, firstName: firstName || null });
      } catch (err) {
        status.innerHTML = `<div class="modal-status error">${escapeHtml(err.message)}</div>`;
      }
    });

    setTimeout(() => fullInput.focus(), 60);
  });
}
