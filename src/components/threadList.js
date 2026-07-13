// Thread-preview list under each bulletin.
//
// A clear section header (title + "how many unread") sits on top, then a
// list of existing conversations — each row is ONE big tap target that opens
// the thread, shows the total message count, and (in accent) how many
// messages the reader hasn't seen yet. A friendly "פתח שיחה חדשה" button
// closes the section.

import { listThreads } from '../lib/threads.js';
import { withBase } from '../router.js';
import { icon } from '../icons.js';
import { unreadFor } from '../lib/threadSeen.js';

export function mountThreadList(rootEl, { yearId, slug, onCount }) {
  if (!rootEl) return () => {};
  let aborted = false;

  rootEl.innerHTML = renderShell({ yearId, slug, threads: null });

  (async () => {
    try {
      const data = await listThreads({ year: yearId, slug });
      if (aborted) return;
      const threads = (data.threads || []).filter((t) => !t.deleted);
      rootEl.innerHTML = renderShell({ yearId, slug, threads });
      report(threads, onCount);
    } catch (_) {
      if (aborted) return;
      // Quiet failure: still show the "start a conversation" button.
      rootEl.innerHTML = renderShell({ yearId, slug, threads: [] });
      if (typeof onCount === 'function') onCount(0, 0);
    }
  })();

  return () => { aborted = true; };
}

// Feed the thread count + total unread back to the bulletin header pill.
function report(threads, onCount) {
  if (typeof onCount !== 'function') return;
  const totalUnread = threads.reduce((sum, t) => sum + unreadFor(t.id, messageTotal(t)), 0);
  onCount(threads.length, totalUnread);
}

function messageTotal(t) {
  // Opening post + replies.
  return (t.replyCount || 0) + 1;
}

function renderShell({ yearId, slug, threads }) {
  const newHref = withBase(`/y/${yearId}/${slug}/discuss/new`);
  const loading = threads === null;
  const items = threads || [];
  // Most-recently-active conversations first — active talk floats to the top.
  const sorted = [...items].sort((a, b) => (b.lastAt || b.createdAt || '').localeCompare(a.lastAt || a.createdAt || ''));
  const totalUnread = sorted.reduce((sum, t) => sum + unreadFor(t.id, messageTotal(t)), 0);

  const summary = loading
    ? 'טוען…'
    : (sorted.length === 0
      ? 'עדיין אין שיחות — היו הראשונים לפתוח אחת.'
      : `${sorted.length} ${sorted.length === 1 ? 'שיחה' : 'שיחות'}${totalUnread > 0 ? ` · <b class="threadlist-summary-unread">${totalUnread} ${totalUnread === 1 ? 'הודעה שלא קראת' : 'הודעות שלא קראת'}</b>` : ''}`);

  return `
    <section class="threadlist" aria-label="שיחות על העלון">
      <div class="threadlist-head">
        <h2 class="threadlist-heading"><span class="threadlist-heading-icon">${icon('dialog', { size: 18 })}</span> שיחות על העלון</h2>
        <p class="threadlist-summary">${summary}</p>
      </div>
      ${sorted.length ? `
        <ul class="threadlist-items">
          ${sorted.map((t) => renderRow(yearId, slug, t)).join('')}
        </ul>
      ` : ''}
      <a class="threadlist-cta" href="${newHref}">
        <span class="threadlist-cta-icon">${icon('plus', { size: 18 })}</span>
        <span class="threadlist-cta-label">${sorted.length ? 'פתח שיחה חדשה' : 'התחל שיחה על העלון'}</span>
      </a>
    </section>
  `;
}

function renderRow(yearId, slug, t) {
  const href = withBase(`/y/${yearId}/${slug}/discuss/${t.id}`);
  const title = escapeHtml(t.title || '(שיחה)');
  const total = messageTotal(t);
  const unread = unreadFor(t.id, total);
  const initial = escapeHtml((t.author || '·').trim().charAt(0) || '·');
  const author = escapeHtml(t.author || '');
  const when = relativeTime(t.lastAt || t.createdAt);
  const meta = [author, when].filter(Boolean).join(' · ');
  const isAdmin = !!t.isAdmin;
  return `
    <li>
      <a class="threadlist-row ${unread > 0 ? 'is-unread' : ''}" href="${href}" aria-label="${title} — ${total} הודעות${unread > 0 ? `, ${unread} שלא קראת` : ''}">
        <span class="threadlist-avatar ${isAdmin ? 'is-admin' : ''}" aria-hidden="true">${isAdmin ? icon('starFilled', { size: 15 }) : initial}</span>
        <span class="threadlist-main">
          <span class="threadlist-title">${title}</span>
          ${meta ? `<span class="threadlist-meta">${meta}</span>` : ''}
        </span>
        <span class="threadlist-counts">
          ${unread > 0 ? `<span class="threadlist-unread" title="${unread} הודעות שלא קראת">${unread} ${unread === 1 ? 'חדשה' : 'חדשות'}</span>` : ''}
          <span class="threadlist-count" title="${total} הודעות בשיחה">${icon('dialog', { size: 13 })}<span>${total}</span></span>
        </span>
        <span class="threadlist-chevron" aria-hidden="true">${icon('chevronLeft', { size: 16 })}</span>
      </a>
    </li>
  `;
}

function relativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? 'לפני שעה' : `לפני ${hrs} שעות`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
