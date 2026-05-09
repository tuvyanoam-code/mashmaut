// Admin discussion moderation. Lists all threads across all bulletins with
// the most recent activity at the top. Drill-in shows the full thread with
// per-message delete + an admin reply composer.

import { icon } from '../../icons.js';
import { adminCall } from '../../lib/adminApi.js';

let _selected = null;        // { year, slug, threadId } when drilled in
let _rootEl = null;

export async function renderComments(root) {
  _rootEl = root;
  if (_selected) return renderThread(_selected);
  return renderListing();
}

async function renderListing() {
  const t = setTimeout(() => {
    _rootEl.innerHTML = `<header class="admin-header"><h1>שיחות</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, 250);
  let data;
  try {
    data = await adminCall('/admin/discuss/threads');
  } catch (e) {
    clearTimeout(t);
    _rootEl.innerHTML = `<header class="admin-header"><h1>שיחות</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
  clearTimeout(t);
  const threads = (data.threads || []).filter((th) => !th.deleted);
  _rootEl.innerHTML = `
    <header class="admin-header"><h1>שיחות</h1></header>
    ${threads.length === 0 ? `
      <div class="admin-card"><p class="muted" style="text-align:center; padding: 32px 8px;">עוד אין שיחות פתוחות בעלונים.</p></div>
    ` : `
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
    `}
  `;
  _rootEl.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _selected = { year: btn.dataset.year, slug: btn.dataset.slug, threadId: btn.dataset.thread };
      renderThread(_selected);
    });
  });
}

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
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
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
          <b>${escapeHtml(thread.author || '')}</b>${thread.isAdmin ? ' · מנהל' : ''}
          <span class="muted">${formatTime(thread.createdAt)}${thread.editedAt ? ' · נערך' : ''}</span>
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
                <b>${escapeHtml(r.author || '')}</b>${r.isAdmin ? ' · מנהל' : ''}
                <span class="muted">${formatTime(r.createdAt)}${r.editedAt ? ' · נערך' : ''}</span>
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
    renderListing();
  });

  const delThreadBtn = _rootEl.querySelector('[data-del-thread]');
  if (delThreadBtn) delThreadBtn.addEventListener('click', async () => {
    if (!confirm('למחוק את השיחה כולה? הכותרת וההודעה הראשונה ייעלמו, התגובות יישארו אבל יפסיקו להופיע באתר.')) return;
    try {
      await adminCall('/admin/discuss/delete', { method: 'POST', body: { year, slug, threadId } });
      _selected = null;
      renderListing();
    } catch (err) {
      alert(err.message || 'שגיאה');
    }
  });

  _rootEl.querySelectorAll('[data-del-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('למחוק את התגובה?')) return;
      try {
        await adminCall('/admin/discuss/delete', { method: 'POST', body: { year, slug, threadId, replyId: btn.dataset.id } });
        renderThread({ year, slug, threadId });
      } catch (err) {
        alert(err.message || 'שגיאה');
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
      alert(err.message || 'שגיאה');
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
