// Site-styled replacements for native window.alert / window.confirm /
// window.prompt — those native dialogs are jarring, can't be themed, and
// (in Safari/Chromium) sometimes treat "cancel" inconsistently. Use these
// instead anywhere we'd reach for window.* dialogs in this codebase.
//
// All functions return a Promise so callers can `await` the user's choice.

import { icon } from '../icons.js';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Open a confirm dialog. Resolves true on confirm, false on cancel/dismiss.
 *  Caller controls the labels; defaults match the most common case. */
export function openConfirm({
  title = '',
  message = '',
  confirmLabel = 'אשר',
  cancelLabel = 'בטל',
  destructive = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay dialog-overlay';
    overlay.innerHTML = `
      <div class="modal dialog dialog--confirm" role="alertdialog" aria-modal="true">
        ${title ? `<h3 class="dialog-title">${escapeHtml(title)}</h3>` : ''}
        ${message ? `<p class="dialog-message">${escapeHtml(message)}</p>` : ''}
        <div class="dialog-actions">
          <button type="button" class="dialog-btn dialog-btn--ghost" data-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="dialog-btn ${destructive ? 'dialog-btn--danger' : 'dialog-btn--primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    mount(overlay, resolve);
  });
}

/** Open an input dialog. Resolves with the entered string on confirm, or
 *  null on cancel/dismiss. NEVER returns an empty string on cancel — the
 *  caller can rely on `null` to mean "user backed out". */
export function openPrompt({
  title = '',
  message = '',
  placeholder = '',
  initial = '',
  multiline = false,
  confirmLabel = 'שלח',
  cancelLabel = 'בטל',
  required = false,
  maxLength = 200,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay dialog-overlay';
    const inputHtml = multiline
      ? `<textarea class="dialog-input" rows="3" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>${escapeHtml(initial)}</textarea>`
      : `<input type="text" class="dialog-input" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(initial)}" ${required ? 'required' : ''} />`;
    overlay.innerHTML = `
      <div class="modal dialog dialog--prompt" role="dialog" aria-modal="true">
        ${title ? `<h3 class="dialog-title">${escapeHtml(title)}</h3>` : ''}
        ${message ? `<p class="dialog-message">${escapeHtml(message)}</p>` : ''}
        <form class="dialog-form">
          ${inputHtml}
          <div class="dialog-actions">
            <button type="button" class="dialog-btn dialog-btn--ghost" data-cancel>${escapeHtml(cancelLabel)}</button>
            <button type="submit" class="dialog-btn dialog-btn--primary" data-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      </div>
    `;
    mount(overlay, (confirmed) => {
      if (!confirmed) return resolve(null);
      const input = overlay.querySelector('.dialog-input');
      const value = (input?.value || '').trim();
      if (required && !value) return resolve(null);
      resolve(value);
    });
    // Auto-focus the input.
    requestAnimationFrame(() => {
      const input = overlay.querySelector('.dialog-input');
      input?.focus();
      if (input && input.value) input.setSelectionRange(input.value.length, input.value.length);
    });
  });
}

/** Show a brief message at the bottom of the screen. Auto-dismisses. */
export function showToast(text, { duration = 2400, kind = 'info' } = {}) {
  const t = document.createElement('div');
  t.className = `toast toast--${kind}`;
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 250);
  }, duration);
}

function mount(overlay, resolve) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let settled = false;
  const close = (confirmed) => {
    if (settled) return;
    settled = true;
    overlay.classList.remove('visible');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 200);
    resolve(confirmed);
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
  }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });
  overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
  overlay.querySelector('[data-confirm]')?.addEventListener('click', (e) => {
    // For prompts, the form submit handles it; for confirms, click directly.
    const form = overlay.querySelector('.dialog-form');
    if (!form) close(true);
  });
  overlay.querySelector('.dialog-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    close(true);
  });
}
