// Minimalist thread-preview list under each bulletin.
//
// Layout: a small "התחל שיחה" link on top, then a flat list of existing
// threads — one per line, each rendered as
//
//     <title text…>            הצג
//
// The title fades to the page background as it approaches the "הצג" link
// (gradient mask). No colors, no badges, no avatars. Returns a cleanup
// function (no-op currently — no timers — but symmetric with mountDiscussion).

import { listThreads } from '../lib/threads.js';
import { withBase } from '../router.js';

export function mountThreadList(rootEl, { yearId, slug, parshaName }) {
  if (!rootEl) return () => {};
  let aborted = false;

  rootEl.innerHTML = renderShell({ yearId, slug, parshaName, threads: null });

  (async () => {
    try {
      const data = await listThreads({ year: yearId, slug });
      if (aborted) return;
      rootEl.innerHTML = renderShell({ yearId, slug, parshaName, threads: data.threads || [] });
    } catch (_) {
      if (aborted) return;
      // Quiet failure: still show the "start a conversation" link.
      rootEl.innerHTML = renderShell({ yearId, slug, parshaName, threads: [] });
    }
  })();

  return () => { aborted = true; };
}

function renderShell({ yearId, slug, threads }) {
  const newHref = withBase(`/y/${yearId}/${slug}/discuss/new`);
  const items = (threads || []).filter((t) => !t.deleted);
  return `
    <section class="threadlist" aria-label="שיחות על העלון">
      <a class="threadlist-new" href="${newHref}">התחל שיחה</a>
      ${threads === null ? '' : (items.length === 0 ? '' : `
        <ul class="threadlist-items">
          ${items.map((t) => renderRow(yearId, slug, t)).join('')}
        </ul>
      `)}
    </section>
  `;
}

function renderRow(yearId, slug, t) {
  const href = withBase(`/y/${yearId}/${slug}/discuss/${t.id}`);
  const title = escapeHtml(t.title || '');
  return `
    <li class="threadlist-row">
      <span class="threadlist-title" title="${title}">${title}</span>
      <a class="threadlist-show" href="${href}">הצג</a>
    </li>
  `;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
