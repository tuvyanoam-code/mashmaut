// Display name for comments — chosen on the first comment from this browser,
// stored in localStorage so subsequent comments don't re-prompt. The server
// enforces uniqueness per fp (first browser to claim a normalized name owns
// it) — so the prompt re-asks if the user picks a name that's already taken.
//
// The same prompt also handles first-time email-notification opt-in (only on
// the very first post — once opted, the email section is skipped). Caller
// can force the email section back via { askEmail: true } when re-prompting
// from the settings panel.

import { icon } from '../icons.js';
import { setEmailPrefs, markOpted, hasOpted, isValidEmail, getEmailPrefs } from './emailPrefs.js';

const STORAGE_KEY = 'mashmaut.displayName';

// Mirror of the server's FORBIDDEN_NAME_PATTERNS — keeps the two in sync so
// the user gets feedback the moment they try the name, not after they've
// already saved it locally and are then surprised by a 409 from the server.
// The server is the source of truth (it re-validates on every POST) — this
// is purely a UX nicety.
const FORBIDDEN_NAME_PATTERNS = [
  /משמעות/i,
  /גינזבורג/i,
  /גנזבורג/i,
  /ginzburg/i,
  /mashmaut/i,
];

export function isForbiddenName(s) {
  const n = String(s || '').trim().toLowerCase();
  return FORBIDDEN_NAME_PATTERNS.some((re) => re.test(n));
}

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
 *
 *  Options:
 *    initial      — name text to pre-fill
 *    error        — banner message at top (e.g. "name taken")
 *    askEmail     — force-show the email opt-in section even if the user
 *                   has previously opted. Used by the settings panel when
 *                   the user explicitly chose "change name + email".
 */
export function promptForDisplayName({ initial = '', error = '', askEmail = null } = {}) {
  return new Promise((resolve) => {
    // Email section visible on the very first post (auto), or when the
    // caller passes askEmail explicitly. After the user opts (either way)
    // we skip the section on subsequent name re-prompts.
    const showEmail = askEmail === null ? !hasOpted() : !!askEmail;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay name-prompt-overlay';
    const existingPrefs = getEmailPrefs();
    overlay.innerHTML = `
      <div class="modal name-prompt" role="dialog" aria-modal="true" aria-label="הצטרפות לשיחות">
        <button type="button" class="modal-close" aria-label="סגור">${icon('close', { size: 20 })}</button>
        <div class="modal-icon">${icon('dialog', { size: 28 })}</div>
        <h3 style="margin: 4px 0 6px;">כמה רגעים לפני שמתחילים</h3>
        <p class="muted" style="margin: 0 0 16px;">הפרטים נשמרים בדפדפן הזה. תוכל לשנות בכל זמן ב"הגדרות".</p>
        ${error ? `<div class="admin-status error" style="margin-bottom: 12px;">${escapeHtml(error)}</div>` : ''}
        <form class="name-prompt-form" novalidate>
          <label class="name-prompt-label">איך תרצה שיציגו אותך?</label>
          <input type="text" name="name" maxlength="40" required autofocus placeholder="לדוגמה: ישראל" value="${escapeAttr(initial)}" />
          <p class="muted name-prompt-hint">השם יופיע ליד ההודעות שלך, 2–40 תווים.</p>

          ${showEmail ? `
            <div class="name-prompt-divider"></div>
            <label class="name-prompt-label">לקבל התראה במייל כשעונים לך?</label>
            <div class="name-prompt-email-row">
              <input type="email" name="email" placeholder="your@email.com" value="${escapeAttr(existingPrefs.email)}" inputmode="email" autocomplete="email" />
              <button type="button" class="btn-text name-prompt-skip" data-skip-email>דלג</button>
            </div>
            <p class="muted name-prompt-hint">ברירת המחדל: רק כשעונים לך ישירות או מזכירים אותך. את שאר האפשרויות תמצא ב"הגדרות".</p>
          ` : ''}

          <div class="name-prompt-actions">
            <button type="button" class="btn-text" data-cancel>בטל</button>
            <button type="submit" class="btn">${icon('check', { size: 18 })} <span>אישור</span></button>
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
    const form = overlay.querySelector('form');
    const input = form.querySelector('input[name="name"]');
    const emailInput = form.querySelector('input[name="email"]');
    const skipBtn = form.querySelector('[data-skip-email]');
    // Inline error region — appears as soon as the user types a forbidden
    // name (and again on submit if they tried to dismiss the warning).
    const errorEl = document.createElement('div');
    errorEl.className = 'admin-status error';
    errorEl.style.cssText = 'margin: 8px 0 0; display: none;';
    input.insertAdjacentElement('afterend', errorEl);

    function setForbidden(forbidden) {
      if (forbidden) {
        errorEl.textContent = 'השם הזה שמור — בחר שם אחר.';
        errorEl.style.display = '';
        input.setAttribute('aria-invalid', 'true');
      } else {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        input.removeAttribute('aria-invalid');
      }
    }

    input.addEventListener('input', () => setForbidden(isForbiddenName(input.value)));

    function commitEmail({ skipped = false } = {}) {
      if (!showEmail) return;
      if (skipped) {
        markOpted();
        return;
      }
      const email = (emailInput?.value || '').trim();
      if (email && isValidEmail(email)) {
        setEmailPrefs({ email, mode: 'mention', opted: true });
      } else {
        markOpted();
      }
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        if (emailInput) emailInput.value = '';
        commitEmail({ skipped: true });
        // Continue submission with just the name
        const name = (input.value || '').trim();
        if (name.length < 2) {
          input.focus();
          return;
        }
        if (isForbiddenName(name)) { setForbidden(true); input.focus(); return; }
        cleanup(name);
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (new FormData(e.target).get('name') || '').toString().trim();
      if (name.length < 2) return;
      if (isForbiddenName(name)) {
        setForbidden(true);
        input.focus();
        return;
      }
      commitEmail();
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
