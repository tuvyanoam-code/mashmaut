// Admin notifications page. Pulls /admin/notifications and renders a list of
// recent events (new subscribe / unsubscribe / weekly send) with relative
// times. Marks all as read on render.

import { icon } from '../../icons.js';
import { adminCall } from '../../lib/adminApi.js';
import { applyShowMore } from '../../lib/showMore.js';

const api = adminCall;

export async function renderNotifications(root) {
  // Don't blank up-front — keep previous section visible until data arrives.
  // If the fetch is slow, swap to a spinner after 250ms.
  const t = setTimeout(() => {
    root.innerHTML = `<header class="admin-header"><h1>התראות</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, 250);
  let data;
  try {
    data = await api('/admin/notifications');
  } catch (e) {
    clearTimeout(t);
    root.innerHTML = `<header class="admin-header"><h1>התראות</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
  clearTimeout(t);
  const items = data.items || [];
  const readUntil = data.readUntil || '';

  root.innerHTML = `
    <header class="admin-header">
      <h1>התראות ${items.length ? `<span class="muted" style="font-size:1rem; font-weight: 400;">(${items.length})</span>` : ''}</h1>
      ${items.length ? `<button class="btn btn-secondary" type="button" id="markAllRead">${icon('check', { size: 18 })} סמן הכל כנקרא</button>` : ''}
    </header>
    ${items.length === 0 ? `
      <div class="admin-card">
        <p class="muted" style="margin:0; text-align:center; padding: 32px 8px;">אין התראות חדשות.</p>
      </div>
    ` : `
      <div class="admin-card" style="padding:0; overflow:hidden;">
        <ul class="notif-list" id="notifList">
          ${items.map((n) => renderItem(n, readUntil)).join('')}
        </ul>
      </div>
    `}
  `;

  const ul = root.querySelector('#notifList');
  if (ul) applyShowMore(ul, { initial: 10, after: ul.parentElement });

  const btn = root.querySelector('#markAllRead');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api('/admin/notifications/mark-read', { method: 'POST', body: {} });
        clearAllBadges();
      } catch (_) {}
      renderNotifications(root);
    });
  }

  // Auto-mark-read on first render after a short delay so the user sees the
  // unread highlights briefly. Then clear the badge in the chrome so it
  // disappears immediately, without waiting for the next page render.
  if (data.unread > 0) {
    setTimeout(async () => {
      try {
        await api('/admin/notifications/mark-read', { method: 'POST', body: {} });
        clearAllBadges();
      } catch { /* best-effort */ }
    }, 1500);
  } else {
    // If we landed here with zero unread, the chrome's badge should already
    // be clear — but make sure (e.g. after a different tab marked them read).
    clearAllBadges();
  }
}

/** Hide every unread-badge element in the document — and mute the count for
 * a window so the next refresh doesn't bring it back due to KV lag. */
function clearAllBadges() {
  muteUnreadFor(90_000);
  document.querySelectorAll('[data-notif-badge]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
}

function renderItem(n, readUntil) {
  const unread = (n.at || '') > readUntil;
  const t = describe(n);
  const ago = relativeTime(n.at);
  return `
    <li class="notif-item ${unread ? 'unread' : ''}">
      <span class="notif-icon ${t.kind}" aria-hidden="true">${icon(t.icon, { size: 16 })}</span>
      <div class="notif-body">
        <p class="notif-text">${t.text}</p>
        <p class="notif-meta">${ago}</p>
      </div>
      ${unread ? `<span class="notif-dot" aria-label="חדש"></span>` : ''}
    </li>
  `;
}

function describe(n) {
  switch (n.type) {
    case 'subscribe': {
      const place = [n.city, n.country].filter(Boolean).join(', ');
      return {
        kind: 'pos',
        icon: 'email',
        text: `מנוי חדש: <b>${escapeHtml(n.email || '')}</b>${place ? ` <span class="muted">(${escapeHtml(place)})</span>` : ''}`,
      };
    }
    case 'unsubscribe':
      return { kind: 'neg', icon: 'close', text: `הסרת מנוי: <b>${escapeHtml(n.email || '')}</b>` };
    case 'bulletin-sent': {
      const detail = `נשלחו ${n.sent || 0} מיילים${n.failed ? ` · ${n.failed} נכשלו` : ''}`;
      const name = n.parshaName ? `פרשת ${n.parshaName}` : (n.slug || '');
      return { kind: 'info', icon: 'check', text: `העלון נשלח: <b>${escapeHtml(name)}</b> <span class="muted">${detail}</span>` };
    }
    case 'stats-archived': {
      const sizeKb = n.sizeBytes ? (n.sizeBytes / 1024).toFixed(1) + ' KB' : '';
      const range = n.periodStart && n.periodEnd ? `${n.periodStart.slice(0, 10)} → ${n.periodEnd.slice(0, 10)}` : '';
      return { kind: 'info', icon: 'archive', text: `נתוני שימוש אורכבו <span class="muted">${escapeHtml(range)}${sizeKb ? ' · ' + sizeKb : ''}</span>` };
    }
    case 'comment-reported': {
      const where = n.parshaName ? `פרשת ${n.parshaName}` : (n.slug || '');
      const preview = n.preview ? ` <span class="muted">"${escapeHtml(n.preview)}"</span>` : '';
      return { kind: 'neg', icon: 'eye', text: `דווח על תגובה ב-<b>${escapeHtml(where)}</b>${preview}` };
    }
    case 'dispatch-pending': {
      const name = n.parshaName ? `פרשת ${n.parshaName}` : (n.slug || '');
      return { kind: 'info', icon: 'calendar', text: `העלון <b>${escapeHtml(name)}</b> ממתין לאישור שליחה` };
    }
    default:
      return { kind: 'info', icon: 'eye', text: escapeHtml(n.type || '') };
  }
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  // Fall back to ISO date for older items.
  return new Date(iso).toLocaleDateString('he-IL');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Mute the unread count for a window after mark-read fires. Cloudflare KV is
// eventually consistent; the next /admin/notifications fetch can return the
// stale `notif-read-until` cursor and report unread > 0 again, making the
// badge re-appear seconds after the user marked everything read. While muted
// we just report 0.
let _mutedUntil = 0;

export function muteUnreadFor(ms = 90_000) {
  _mutedUntil = Math.max(_mutedUntil, Date.now() + ms);
}

/** Fetch unread count for the sidebar/tabbar badge. Returns 0 on failure. */
export async function getUnreadNotifCount() {
  if (Date.now() < _mutedUntil) return 0;
  try {
    const data = await api('/admin/notifications');
    return data.unread || 0;
  } catch { return 0; }
}
