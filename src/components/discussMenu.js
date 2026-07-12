// "My discussions" menu shown at the top of every thread page.
//
// Two pill tabs: "השיחות שלי" + "הגדרות". Clicking a tab toggles its panel
// open/closed below. Both panels closed by default — the menu doesn't eat
// vertical space until the user asks for it. The active panel slides in
// with a small spring, the inactive tab dims.

import { icon } from '../icons.js';
import { withBase } from '../router.js';
import { getDisplayName, setDisplayName, promptForDisplayName } from '../lib/displayName.js';
import { getEmailPrefs, setEmailPrefs, MODES, isValidEmail } from '../lib/emailPrefs.js';
import { saveServerPrefs } from '../lib/threads.js';
import { getFollows, unfollow, checkUpdates } from '../lib/myDiscussions.js';
import { showToast } from '../lib/dialog.js';

export function discussMenuHtml({ currentThreadId } = {}) {
  return `
    <nav class="discuss-menu" aria-label="התפריט שלי">
      <div class="discuss-menu-tabs" role="tablist">
        <button type="button" class="discuss-menu-tab" data-tab="threads" role="tab" aria-selected="false" aria-expanded="false" aria-controls="discussMenuPanel">
          ${icon('dialog', { size: 16 })}
          <span>השיחות שלי</span>
          <span class="discuss-menu-tab-badge" data-threads-badge hidden></span>
        </button>
        <button type="button" class="discuss-menu-tab" data-tab="settings" role="tab" aria-selected="false" aria-expanded="false" aria-controls="discussMenuPanel">
          ${icon('settings', { size: 16 })}
          <span>הגדרות</span>
        </button>
      </div>
      <div class="discuss-menu-panel" id="discussMenuPanel" data-tab-content hidden></div>
    </nav>
  `;
}

export function bindDiscussMenu(rootEl, { currentThreadId } = {}) {
  if (!rootEl) return;
  const tabs = rootEl.querySelectorAll('[data-tab]');
  const panel = rootEl.querySelector('[data-tab-content]');
  let openTab = null;
  let updatesCache = null;

  // Background load of unread badge.
  refreshThreadsBadge(rootEl);

  tabs.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      if (openTab === tab) {
        // Toggle off: same tab clicked again → collapse.
        closePanel();
        return;
      }
      openTab = tab;
      tabs.forEach((t) => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('aria-expanded', active ? 'true' : 'false');
      });
      panel.hidden = false;
      panel.classList.add('opening');
      panel.innerHTML = '<p class="discuss-menu-loading">טוען…</p>';
      requestAnimationFrame(() => panel.classList.remove('opening'));

      if (tab === 'threads') {
        try {
          updatesCache = await checkUpdates();
          panel.innerHTML = renderThreadsPanel(updatesCache, currentThreadId);
          bindThreadsPanel(panel, rootEl);
        } catch (_) {
          panel.innerHTML = '<p class="discuss-menu-empty">לא הצלחנו לטעון את השיחות. נסה שוב.</p>';
        }
      } else {
        panel.innerHTML = renderSettingsPanel(getDisplayName(), getEmailPrefs());
        bindSettingsPanel(panel);
      }
    });
  });

  function closePanel() {
    openTab = null;
    panel.hidden = true;
    panel.innerHTML = '';
    tabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('aria-expanded', 'false');
    });
  }

  // Click anywhere outside to close (matches dropdown patterns).
  document.addEventListener('click', (e) => {
    if (!openTab) return;
    if (!rootEl.contains(e.target)) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openTab) closePanel();
  });
}

async function refreshThreadsBadge(rootEl) {
  const badge = rootEl.querySelector('[data-threads-badge]');
  if (!badge || !getFollows().length) return;
  try {
    const results = await checkUpdates();
    const total = results.reduce((s, r) => s + (r.newRepliesCount || 0), 0);
    // The badge is a visual dot only — show or hide, no number rendered.
    badge.hidden = total === 0;
    badge.setAttribute('aria-label', total > 0 ? `${total} תגובות חדשות` : '');
  } catch (_) { /* silent */ }
}

function renderThreadsPanel(updates, currentThreadId) {
  if (!updates || !updates.length) {
    return '<p class="discuss-menu-empty">עוד לא נכנסת לשיחה אחרת. כשתפרסם הודעה בשיחה, היא תופיע כאן.</p>';
  }
  return `
    <ul class="discuss-menu-list">
      ${updates.map((u) => {
        const href = withBase(`/y/${u.year}/${u.slug}/discuss/${u.threadId}`);
        const isCurrent = u.threadId === currentThreadId;
        const newCount = u.newRepliesCount || 0;
        const subtitle = newCount > 0 && u.lastReplyAuthor
          ? `${escapeHtml(u.lastReplyAuthor)} ענה`
          : (u.parshaName ? `פרשת ${escapeHtml(u.parshaName)}` : '');
        return `
          <li class="discuss-menu-item ${isCurrent ? 'is-current' : ''} ${newCount > 0 ? 'has-new' : ''}">
            <a class="discuss-menu-item-link" href="${href}">
              <span class="discuss-menu-item-title">${escapeHtml(u.liveTitle || u.title || '(שיחה)')}</span>
              ${subtitle ? `<span class="discuss-menu-item-sub">${subtitle}</span>` : ''}
            </a>
            ${newCount > 0 ? `<span class="discuss-menu-item-badge">${newCount > 9 ? '9+' : newCount}</span>` : ''}
            <button type="button" class="discuss-menu-item-remove" data-unfollow="${escapeAttr(u.threadId)}" aria-label="הסר משיחות שלי">×</button>
          </li>`;
      }).join('')}
    </ul>
  `;
}

function bindThreadsPanel(panel, rootEl) {
  panel.querySelectorAll('[data-unfollow]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      unfollow(btn.dataset.unfollow);
      btn.closest('.discuss-menu-item')?.remove();
      if (!panel.querySelectorAll('.discuss-menu-item').length) {
        panel.innerHTML = '<p class="discuss-menu-empty">אין שיחות במעקב.</p>';
      }
      refreshThreadsBadge(rootEl);
    });
  });
}

function renderSettingsPanel(name, prefs) {
  const email = prefs.email || '';
  const mode = prefs.mode || 'mention';
  // The four notification modes are mutually exclusive — render as a
  // toggle group where flipping one off-state to on flips the others off.
  // When there's no email, all toggles are disabled and the "off" pill
  // is highlighted to make the state clear.
  const noEmail = !email;
  return `
    <div class="discuss-menu-settings">
      <div class="discuss-menu-setting-row">
        <div>
          <div class="discuss-menu-setting-label">השם שלך בשיחות</div>
          <div class="discuss-menu-setting-value">
            ${name ? escapeHtml(name) : '<span class="discuss-menu-empty-value">לא נבחר עדיין</span>'}
          </div>
        </div>
        <button type="button" class="discuss-menu-setting-btn" data-action="rename">${name ? 'שנה' : 'בחר'}</button>
      </div>
      <p class="discuss-menu-setting-hint">השם נשמר בדפדפן הזה. שינוי יחול על שיחות חדשות בלבד — בשיחות שכבר כתבת בהן השם יישאר כפי שהוא.</p>

      <div class="discuss-menu-divider"></div>

      <div class="discuss-menu-setting-row">
        <div>
          <div class="discuss-menu-setting-label">מייל להתראות</div>
          <div class="discuss-menu-setting-value">
            ${email ? escapeHtml(email) : '<span class="discuss-menu-empty-value">לא הוגדר</span>'}
          </div>
        </div>
        <button type="button" class="discuss-menu-setting-btn" data-action="set-email">${email ? 'ערוך' : 'הוסף'}</button>
      </div>

      <div class="discuss-menu-toggles" data-toggles aria-disabled="${noEmail ? 'true' : 'false'}">
        ${renderToggleRow('all',     'בכל תגובה לשיחה',        'מקבל הודעה על כל תגובה חדשה בכל שיחה שאתה משתתף בה.',    mode, noEmail)}
        ${renderToggleRow('admin',   'רק בתגובת מנהל',          'מקבל הודעה כאשר המנהל עונה לשיחה שאתה משתתף בה.',         mode, noEmail)}
        ${renderToggleRow('mention', 'רק כשעונים לי או מזכירים אותי', 'מקבל הודעה רק כאשר מישהו מגיב ישירות אליך או מזכיר אותך בשם.', mode, noEmail)}
        ${renderToggleRow('off',     'כבה התראות מייל',         'לא תקבל מייל על תגובות. עדיין תראה אותן באתר.',           mode, noEmail)}
      </div>
      ${noEmail ? '<p class="discuss-menu-setting-hint">הוסף כתובת מייל למעלה כדי להפעיל התראות.</p>' : ''}
    </div>
  `;
}

function renderToggleRow(value, title, desc, currentMode, disabled) {
  const on = currentMode === value;
  return `
    <label class="discuss-toggle-row ${on ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}">
      <span class="discuss-toggle-text">
        <span class="discuss-toggle-title">${title}</span>
        <span class="discuss-toggle-desc">${desc}</span>
      </span>
      <input type="checkbox" class="discuss-toggle-checkbox" data-mode="${value}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
      <span class="discuss-toggle-switch" aria-hidden="true"><span class="discuss-toggle-knob"></span></span>
    </label>
  `;
}

function bindSettingsPanel(panel) {
  panel.querySelectorAll('[data-action="rename"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const current = getDisplayName();
      const chosen = await promptForDisplayName({ initial: current, askEmail: false });
      if (chosen) {
        setDisplayName(chosen);
        showToast('השם עודכן');
        panel.innerHTML = renderSettingsPanel(chosen, getEmailPrefs());
        bindSettingsPanel(panel);
      }
    });
  });
  panel.querySelectorAll('[data-action="set-email"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const current = getEmailPrefs();
      const next = window.prompt('הכנס כתובת מייל להתראות (השאר ריק כדי להסיר):', current.email || '');
      if (next === null) return; // user cancelled
      const trimmed = next.trim();
      if (trimmed && !isValidEmail(trimmed)) {
        showToast('כתובת מייל לא תקינה');
        return;
      }
      const updated = setEmailPrefs({
        email: trimmed,
        mode: trimmed ? (current.mode === 'off' ? 'mention' : current.mode) : 'off',
        opted: true,
      });
      showToast(trimmed ? 'המייל נשמר' : 'המייל הוסר');
      panel.innerHTML = renderSettingsPanel(getDisplayName(), updated);
      bindSettingsPanel(panel);
      // Push to the worker so it knows where to send notifications.
      // Silent on failure — the local prefs are the source of truth for
      // the UI, and the next change will re-sync.
      saveServerPrefs({ email: updated.email, mode: updated.mode }).catch(() => {});
    });
  });
  panel.querySelectorAll('.discuss-toggle-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      // Mutually exclusive group: any change forces the picked mode and
      // turns the others off. The DOM will be re-rendered to reflect it.
      const mode = cb.dataset.mode;
      const updated = setEmailPrefs({ mode });
      showToast('ההעדפות עודכנו');
      panel.innerHTML = renderSettingsPanel(getDisplayName(), updated);
      bindSettingsPanel(panel);
      saveServerPrefs({ email: updated.email, mode: updated.mode }).catch(() => {});
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
