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
import { setEmailPrefs, isValidEmail, getEmailPrefs } from './emailPrefs.js';

const STORAGE_KEY = 'mashmaut.displayName';
// Per-thread name lock. A user's name is remembered for each conversation
// they post in, so changing the global name only affects *future*
// conversations — it never rewrites the name inside a thread they're
// already part of. Shape: { [threadId]: name }.
const THREAD_NAMES_KEY = 'mashmaut.threadNames';

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

/** The name this browser used in a specific thread, or '' if none yet.
 *  Once set, it's the fixed identity for that conversation. */
export function getThreadName(threadId) {
  if (!threadId) return '';
  try {
    const map = JSON.parse(localStorage.getItem(THREAD_NAMES_KEY) || '{}');
    return map && typeof map[threadId] === 'string' ? map[threadId] : '';
  } catch (_) { return ''; }
}

/** Remember the name used in a thread. First name to post in the thread
 *  wins; later calls with the same id are no-ops so the lock can't drift. */
export function setThreadName(threadId, name) {
  const n = String(name || '').trim();
  if (!threadId || !n) return;
  try {
    const map = JSON.parse(localStorage.getItem(THREAD_NAMES_KEY) || '{}');
    if (map[threadId] === n) return;
    map[threadId] = n;
    localStorage.setItem(THREAD_NAMES_KEY, JSON.stringify(map));
  } catch (_) {}
}

/** Open a modal and resolve with the chosen name, or null if cancelled.
 *
 *  Options:
 *    initial      — name text to pre-fill
 *    error        — banner message at top (e.g. "name taken")
 *    askEmail     — tri-state for the (mandatory) email section:
 *                     null  → show it only when no valid email is on file
 *                     true  → always show it
 *                     false → never show it (e.g. settings rename)
 *                   When shown, the email is REQUIRED — there is no "skip".
 *    lockName     — render the name field read-only. Used when we already
 *                   know the user's name (it's fixed for this conversation)
 *                   and only need to collect the missing email.
 */
export function promptForDisplayName({ initial = '', error = '', askEmail = null, lockName = false } = {}) {
  return new Promise((resolve) => {
    const existingPrefs = getEmailPrefs();
    const hasEmail = isValidEmail(existingPrefs.email);
    // Email is mandatory for every participant. Show the section whenever we
    // don't already have a valid address (or when the caller forces it).
    const showEmail = askEmail === null ? !hasEmail : !!askEmail;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay name-prompt-overlay';
    overlay.innerHTML = `
      <div class="modal name-prompt" role="dialog" aria-modal="true" aria-label="הצטרפות לשיחות">
        <button type="button" class="modal-close" aria-label="סגור">${icon('close', { size: 20 })}</button>
        <div class="modal-icon">${icon('dialog', { size: 28 })}</div>
        <h3 style="margin: 4px 0 6px;">כמה רגעים לפני שמתחילים</h3>
        <p class="muted" style="margin: 0 0 16px;">הפרטים נשמרים בדפדפן הזה. תוכל לשנות בכל זמן ב"הגדרות".</p>
        ${error ? `<div class="admin-status error" style="margin-bottom: 12px;">${escapeHtml(error)}</div>` : ''}
        <form class="name-prompt-form" novalidate>
          <label class="name-prompt-label">איך תרצה שיציגו אותך?</label>
          <input type="text" name="name" maxlength="40" required ${lockName ? 'readonly aria-readonly="true"' : 'autofocus'} placeholder="לדוגמה: ישראל" value="${escapeAttr(initial)}" />
          <p class="muted name-prompt-hint">${lockName
            ? 'זה השם שלך בשיחה הזו. שינוי שם ב"הגדרות" יחול על שיחות חדשות בלבד.'
            : 'השם יופיע ליד ההודעות שלך, 2–40 תווים.'}</p>

          ${showEmail ? `
            <div class="name-prompt-divider"></div>
            <label class="name-prompt-label">מייל לקבלת התראות <span style="color:var(--accent,#2d6a4f); font-weight:600;">(חובה)</span></label>
            <div class="name-prompt-email-row">
              <input type="email" name="email" required ${lockName ? 'autofocus' : ''} placeholder="your@email.com" value="${escapeAttr(existingPrefs.email)}" inputmode="email" autocomplete="email" />
            </div>
            <p class="muted name-prompt-hint">נשתמש בו כדי לעדכן אותך כשעונים לך או מזכירים אותך. אפשר לכוונן או לכבות התראות אחר כך ב"הגדרות".</p>
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
    // Inline error region for the name — appears as soon as the user types a
    // forbidden name (and again on submit if they tried to dismiss it).
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

    if (!lockName) input.addEventListener('input', () => setForbidden(isForbiddenName(input.value)));

    // Inline error region for the email — shown when it's missing/invalid.
    let emailErrorEl = null;
    if (emailInput) {
      emailErrorEl = document.createElement('div');
      emailErrorEl.className = 'admin-status error';
      emailErrorEl.style.cssText = 'margin: 8px 0 0; display: none;';
      emailInput.closest('.name-prompt-email-row').insertAdjacentElement('afterend', emailErrorEl);
      emailInput.addEventListener('input', () => setEmailError(''));
    }
    function setEmailError(msg) {
      if (!emailErrorEl) return;
      if (msg) {
        emailErrorEl.textContent = msg;
        emailErrorEl.style.display = '';
        emailInput.setAttribute('aria-invalid', 'true');
      } else {
        emailErrorEl.style.display = 'none';
        emailErrorEl.textContent = '';
        emailInput.removeAttribute('aria-invalid');
      }
    }

    // Persist the (required) email. Returns false and flags the field when
    // the address is missing or malformed, so the caller can block submit.
    function commitEmail() {
      if (!showEmail) return true;
      const email = (emailInput?.value || '').trim();
      if (!email || !isValidEmail(email)) {
        setEmailError('צריך כתובת מייל תקינה כדי להשתתף בשיחה.');
        emailInput?.focus();
        return false;
      }
      const mode = existingPrefs.mode && existingPrefs.mode !== 'off' ? existingPrefs.mode : 'mention';
      setEmailPrefs({ email, mode, opted: true });
      return true;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = lockName ? String(initial || '').trim() : (new FormData(e.target).get('name') || '').toString().trim();
      if (name.length < 2) { input.focus(); return; }
      if (!lockName && isForbiddenName(name)) {
        setForbidden(true);
        input.focus();
        return;
      }
      // Email must be valid before we resolve — commitEmail flags the field.
      if (!commitEmail()) return;
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
