// "My discussions" menu shown at the top of every thread page.
//
// Two pill tabs: "השיחות שלי" + "הגדרות". Clicking a tab toggles its panel
// open/closed below. Both panels closed by default — the menu doesn't eat
// vertical space until the user asks for it. The active panel slides in
// with a small spring, the inactive tab dims.

import { icon } from '../icons.js';
import { withBase } from '../router.js';
import { getDisplayName, setDisplayName, promptForDisplayName } from '../lib/displayName.js';
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
        panel.innerHTML = renderSettingsPanel(getDisplayName());
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

function renderSettingsPanel(name) {
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
      <p class="discuss-menu-setting-hint">השם נשמר בדפדפן הזה. אם תשנה אותו — הודעות חדשות שתפרסם יופיעו עם השם החדש.</p>
    </div>
  `;
}

function bindSettingsPanel(panel) {
  panel.querySelectorAll('[data-action="rename"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const current = getDisplayName();
      const chosen = await promptForDisplayName({ initial: current });
      if (chosen) {
        setDisplayName(chosen);
        showToast('השם עודכן');
        // Re-render this panel so the new name shows.
        panel.innerHTML = renderSettingsPanel(chosen);
        bindSettingsPanel(panel);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
