// Admin notifications page. Pulls /admin/notifications and renders a list of
// recent events (new subscribe / unsubscribe / weekly send) with relative
// times. Marks all as read on render.

import { icon } from '../../icons.js';
import { loadConfig } from '../../lib/store.js';

const KEY_STORAGE = 'mashmaut.adminKey';
function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
}

async function api(path, opts = {}) {
  const cfg = await loadConfig();
  const base = (cfg.apiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('API לא מוגדר');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getKey(),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

export async function renderNotifications(root) {
  root.innerHTML = `<header class="admin-header"><h1>התראות</h1></header><div class="loading"><div class="spinner"></div></div>`;
  let data;
  try {
    data = await api('/admin/notifications');
  } catch (e) {
    root.innerHTML = `<header class="admin-header"><h1>התראות</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
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
        <ul class="notif-list">
          ${items.map((n) => renderItem(n, readUntil)).join('')}
        </ul>
      </div>
    `}
  `;

  const btn = root.querySelector('#markAllRead');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await api('/admin/notifications/mark-read', { method: 'POST', body: {} }); }
      catch (_) {}
      renderNotifications(root);
    });
  }

  // Auto-mark-read on first render after a short delay so the user sees the
  // unread highlights briefly.
  if (data.unread > 0) {
    setTimeout(() => {
      api('/admin/notifications/mark-read', { method: 'POST', body: {} }).catch(() => {});
    }, 1500);
  }
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

/** Fetch unread count for the sidebar/tabbar badge. Returns 0 on failure. */
export async function getUnreadNotifCount() {
  try {
    const data = await api('/admin/notifications');
    return data.unread || 0;
  } catch { return 0; }
}
