// Admin discussion moderation. Two top-level views:
//   1. שיחות   — flat list of threads + drill-in to manage each
//   2. משתמשים — directory of unique participants + rename action
//
// Aesthetic: cream paper cards on a soft-cream background, green accent for
// names + actions, apricot accent for warnings. The "users" tab uses an
// avatar-circle (initial-stamp) per participant — visually consistent with
// the user-menu trigger in the public site, so the moderator immediately
// recognizes the same person across surfaces.

import { icon } from '../../icons.js';
import { adminCall } from '../../lib/adminApi.js';
import { openPrompt, openConfirm, showToast } from '../../lib/dialog.js';
import { applyShowMore } from '../../lib/showMore.js';

let _view = 'threads';        // 'threads' | 'users'
let _selected = null;          // { year, slug, threadId } when drilled in
let _rootEl = null;

export async function renderComments(root) {
  _rootEl = root;
  if (_selected) return renderThread(_selected);
  return renderTopLevel();
}

async function renderTopLevel() {
  _rootEl.innerHTML = `
    <header class="admin-header">
      <h1>שיחות</h1>
    </header>
    <div class="admin-discuss-tabs" role="tablist">
      <button type="button" class="admin-discuss-tab ${_view === 'threads' ? 'active' : ''}" role="tab" data-view="threads">
        ${icon('dialog', { size: 16 })}
        <span>שיחות</span>
      </button>
      <button type="button" class="admin-discuss-tab ${_view === 'users' ? 'active' : ''}" role="tab" data-view="users">
        ${icon('email', { size: 16 })}
        <span>משתתפים</span>
      </button>
    </div>
    <div class="admin-discuss-body" id="adminDiscussBody"></div>
  `;
  _rootEl.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _view = btn.dataset.view;
      renderTopLevel();
    });
  });
  const body = _rootEl.querySelector('#adminDiscussBody');
  if (_view === 'threads') await renderThreadsList(body);
  else await renderUsersList(body);
}

// === שיחות tab ===

async function renderThreadsList(body) {
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let data;
  try {
    data = await adminCall('/admin/discuss/threads');
  } catch (e) {
    body.innerHTML = `<div class="admin-card"><p class="admin-status error">${escapeHtml(e.message)}</p></div>`;
    return;
  }
  const threads = (data.threads || []).filter((th) => !th.deleted);
  if (threads.length === 0) {
    body.innerHTML = `<div class="admin-card"><p class="muted" style="text-align:center; padding: 32px 8px;">עוד אין שיחות פתוחות בעלונים.</p></div>`;
    return;
  }
  body.innerHTML = `
    <div class="admin-card" style="padding:0;">
      <table class="admin-table">
        <thead><tr><th>כותרת</th><th>עלון</th><th>תגובות</th><th>פעילות</th><th></th></tr></thead>
        <tbody>
          ${threads.map((th) => `
            <tr>
              <td data-label="כותרת"><b>${escapeHtml(th.title || '')}</b></td>
              <td data-label="עלון"><span class="muted">${escapeHtml(th.year + '/' + th.slug)}</span></td>
              <td data-label="תגובות">${th.replyCount || 0}</td>
              <td data-label="פעילות">${relativeTime(th.lastAt)}</td>
              <td><button type="button" class="btn btn-secondary" data-open data-year="${escapeAttr(th.year)}" data-slug="${escapeAttr(th.slug)}" data-thread="${escapeAttr(th.id)}">פתח</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  body.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _selected = { year: btn.dataset.year, slug: btn.dataset.slug, threadId: btn.dataset.thread };
      renderThread(_selected);
    });
  });
  const tbody = body.querySelector('table.admin-table tbody');
  if (tbody) applyShowMore(tbody, { initial: 4, after: tbody.parentElement });
}

// === משתתפים tab ===

async function renderUsersList(body) {
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let data;
  try {
    data = await adminCall('/admin/discuss/users');
  } catch (e) {
    body.innerHTML = `<div class="admin-card"><p class="admin-status error">${escapeHtml(e.message)}</p></div>`;
    return;
  }
  const users = data.users || [];
  if (users.length === 0) {
    body.innerHTML = `<div class="admin-card"><p class="muted" style="text-align:center; padding: 32px 8px;">עוד אין משתתפים בשיחות.</p></div>`;
    return;
  }
  body.innerHTML = `
    <p class="muted" style="font-size:.88rem; margin: 0 0 14px;">כל אדם שכתב הודעה בשיחה. שינוי השם כאן יעדכן את כל ההודעות שלו.</p>
    <div class="admin-users-grid">
      ${users.map((u) => renderUserCard(u)).join('')}
    </div>
  `;
  body.querySelectorAll('[data-rename]').forEach((btn) => {
    btn.addEventListener('click', () => onRename(btn.dataset.rename, btn.dataset.currentName));
  });
  const grid = body.querySelector('.admin-users-grid');
  if (grid) applyShowMore(grid, { initial: 4, after: grid });
}

function renderUserCard(u) {
  const initial = (u.currentName || '·').charAt(0) || '·';
  const aliases = u.names.length > 1
    ? `<div class="admin-user-aliases">היה גם: ${u.names.slice(0, -1).map((n) => escapeHtml(n)).join(' · ')}</div>`
    : '';
  const recent = u.recent && u.recent.length
    ? `<ul class="admin-user-recent">
         ${u.recent.map((r) => `
           <li>
             <a href="/y/${encodeURIComponent(r.year)}/${encodeURIComponent(r.slug)}/discuss/${encodeURIComponent(r.threadId)}" target="_blank">
               <span class="admin-user-recent-title">${escapeHtml(r.title || '(שיחה)')}</span>
               <span class="admin-user-recent-meta">${escapeHtml(r.year + '/' + r.slug)}</span>
             </a>
           </li>
         `).join('')}
       </ul>`
    : '';
  return `
    <article class="admin-user-card">
      <header class="admin-user-card-head">
        <div class="admin-user-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
        <div class="admin-user-identity">
          <h3 class="admin-user-name">${escapeHtml(u.currentName || 'אנונימי')}</h3>
          <div class="admin-user-meta">
            <span>${u.messageCount} ${u.messageCount === 1 ? 'הודעה' : 'הודעות'}</span>
            <span class="admin-user-dot">·</span>
            <span>${u.threadCount} ${u.threadCount === 1 ? 'שיחה' : 'שיחות'}</span>
            <span class="admin-user-dot">·</span>
            <span class="muted">${relativeTime(u.lastAt)}</span>
          </div>
          ${aliases}
        </div>
        <button type="button" class="admin-user-rename" data-rename="${escapeAttr(u.fp)}" data-current-name="${escapeAttr(u.currentName || '')}" title="שנה שם">
          ${icon('edit', { size: 14 })}
          <span>שנה שם</span>
        </button>
      </header>
      ${recent}
    </article>
  `;
}

async function onRename(fp, currentName) {
  const newName = await openPrompt({
    title: 'שינוי שם משתתף',
    message: `שנה את השם של "${currentName || 'אנונימי'}" בכל ההודעות שלו. הפעולה תופיע מיד באתר.`,
    placeholder: 'השם החדש',
    initial: currentName || '',
    confirmLabel: 'עדכן',
    cancelLabel: 'בטל',
    required: true,
    maxLength: 40,
  });
  if (!newName) return;
  if (newName === currentName) {
    showToast('השם לא שונה', { kind: 'info' });
    return;
  }
  try {
    const r = await adminCall('/admin/discuss/rename-user', { method: 'POST', body: { fp, newName } });
    showToast(`עודכן ב-${r.updated} מקומות`, { kind: 'success' });
    // Re-render the users tab to reflect the new name.
    const body = _rootEl.querySelector('#adminDiscussBody');
    if (body) await renderUsersList(body);
  } catch (e) {
    showToast(e.message || 'שגיאה', { kind: 'error' });
  }
}

// === thread drilldown (unchanged from before) ===

async function renderThread({ year, slug, threadId }) {
  const t = setTimeout(() => {
    _rootEl.innerHTML = `<header class="admin-header"><h1>שיחה</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, 250);
  let data;
  try {
    data = await adminCall(`/admin/discuss/threads/${encodeURIComponent(year)}/${encodeURIComponent(slug)}/${encodeURIComponent(threadId)}`);
  } catch (e) {
    clearTimeout(t);
    _rootEl.innerHTML = `<header class="admin-header"><h1>שיחה</h1></header>
      <div class="admin-card"><p class="admin-status error">${escapeHtml(e.message)}</p></div>`;
    return;
  }
  clearTimeout(t);
  const thread = data.thread;
  const replies = data.replies || [];
  const reactions = data.reactions || {};
  const reports = data.reports || {};

  _rootEl.innerHTML = `
    <header class="admin-header">
      <button type="button" class="btn-text" data-back>${icon('arrowRight', { size: 16 })} לכל השיחות</button>
      <h1 style="margin:8px 0 0;">${escapeHtml(thread.title || '')}</h1>
      <p class="muted" style="margin:4px 0 0;">${escapeHtml(year + '/' + slug)} · <a href="/y/${encodeURIComponent(year)}/${encodeURIComponent(slug)}/discuss/${encodeURIComponent(thread.id)}" target="_blank">פתח באתר ↗</a></p>
    </header>

    <div class="admin-card">
      <div class="admin-comment ${thread.deleted ? 'deleted' : ''}">
        <div class="admin-comment-head">
          <b>${escapeHtml(thread.author || '')}</b>          <span class="muted">${formatTime(thread.createdAt)}${thread.editedAt ? ' · נערך' : ''}</span>
          ${reports[thread.id] ? `<span class="admin-status error" style="margin-right:8px;">${reports[thread.id]} דיווחים</span>` : ''}
        </div>
        <div class="admin-comment-body">${thread.deleted ? '<i>[נמחקה]</i>' : (escapeHtml(thread.body || '').replace(/\n/g, '<br>'))}</div>
        ${formatReactions(reactions[thread.id])}
        <div class="admin-comment-actions">
          ${!thread.deleted ? `<button type="button" class="btn-text" data-del-thread>${icon('trash', { size: 14 })} מחק שיחה</button>` : ''}
        </div>
      </div>

      ${replies.length === 0 ? '<p class="muted" style="margin-top:18px;">אין תגובות.</p>' : `
        <ul class="admin-comment-list" style="margin-top: 18px;">
          ${replies.map((r) => `
            <li class="admin-comment ${r.deleted ? 'deleted' : ''} ${r.isAdmin ? 'admin-reply' : ''}">
              <div class="admin-comment-head">
                <b>${escapeHtml(r.author || '')}</b>                <span class="muted">${formatTime(r.createdAt)}${r.editedAt ? ' · נערך' : ''}</span>
                ${reports[r.id] ? `<span class="admin-status error" style="margin-right:8px;">${reports[r.id]} דיווחים</span>` : ''}
              </div>
              <div class="admin-comment-body">${r.deleted ? '<i>[נמחקה]</i>' : (escapeHtml(r.body || '').replace(/\n/g, '<br>'))}</div>
              ${formatReactions(reactions[r.id])}
              <div class="admin-comment-actions">
                ${!r.deleted ? `<button type="button" class="btn-text" data-del-reply data-id="${escapeAttr(r.id)}">${icon('trash', { size: 14 })} מחק</button>` : ''}
              </div>
            </li>
          `).join('')}
        </ul>
      `}
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0;">תגובת מנהל</h3>
      <form class="admin-comment-reply">
        <textarea name="body" rows="3" placeholder="כתוב תגובה כמנהל…" required maxlength="4000" style="width:100%; padding: 12px; border: 1px solid var(--border); border-radius: 12px; font: inherit; box-sizing: border-box;"></textarea>
        <div style="display:flex; gap:8px; justify-content: flex-end; margin-top: 10px;">
          <button type="submit" class="btn">${icon('share', { size: 16 })} שלח כמנהל</button>
        </div>
      </form>
    </div>
  `;

  _rootEl.querySelector('[data-back]').addEventListener('click', () => {
    _selected = null;
    renderTopLevel();
  });

  const delThreadBtn = _rootEl.querySelector('[data-del-thread]');
  if (delThreadBtn) delThreadBtn.addEventListener('click', async () => {
    const ok = await openConfirm({
      title: 'מחיקת שיחה',
      message: 'הכותרת וההודעה הראשונה ייעלמו, התגובות יישארו אבל יפסיקו להופיע באתר.',
      confirmLabel: 'מחק',
      cancelLabel: 'בטל',
      destructive: true,
    });
    if (!ok) return;
    try {
      await adminCall('/admin/discuss/delete', { method: 'POST', body: { year, slug, threadId } });
      _selected = null;
      renderTopLevel();
    } catch (err) {
      showToast(err.message || 'שגיאה', { kind: 'error' });
    }
  });

  _rootEl.querySelectorAll('[data-del-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'מחיקת תגובה',
        message: 'התגובה תוסר לתצוגה.',
        confirmLabel: 'מחק',
        cancelLabel: 'בטל',
        destructive: true,
      });
      if (!ok) return;
      try {
        await adminCall('/admin/discuss/delete', { method: 'POST', body: { year, slug, threadId, replyId: btn.dataset.id } });
        renderThread({ year, slug, threadId });
      } catch (err) {
        showToast(err.message || 'שגיאה', { kind: 'error' });
      }
    });
  });

  _rootEl.querySelector('.admin-comment-reply').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = (fd.get('body') || '').toString().trim();
    if (!body) return;
    try {
      await adminCall('/admin/discuss/reply', { method: 'POST', body: { year, slug, threadId, body } });
      renderThread({ year, slug, threadId });
    } catch (err) {
      showToast(err.message || 'שגיאה', { kind: 'error' });
    }
  });
}

function formatReactions(agg) {
  if (!agg) return '';
  const entries = Object.entries(agg).filter(([, n]) => n > 0);
  if (!entries.length) return '';
  return '<div class="admin-comment-reactions" style="margin-top:8px; font-size:.85rem;">' + entries.map(([e, n]) => `${e} ${n}`).join(' · ') + '</div>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL');
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
  return `לפני ${days} ימים`;
}
