// Minimalist thread-preview list under each bulletin.
//
// A clear, inviting "התחל שיחה" button (chat icon + label, pill style) sits
// at the top of the section. Below it: a flat list of existing threads, one
// per line — title (with a fade-out mask near its left edge so long titles
// don't crash into "הצג") + a small "הצג" link.

import { listThreads } from '../lib/threads.js';
import { withBase } from '../router.js';
import { icon } from '../icons.js';

export function mountThreadList(rootEl, { yearId, slug, onCount }) {
  if (!rootEl) return () => {};
  let aborted = false;

  rootEl.innerHTML = renderShell({ yearId, slug, threads: null });

  (async () => {
    try {
      const data = await listThreads({ year: yearId, slug });
      if (aborted) return;
      const threads = data.threads || [];
      rootEl.innerHTML = renderShell({ yearId, slug, threads });
      if (typeof onCount === 'function') {
        onCount(threads.filter((t) => !t.deleted).length);
      }
    } catch (_) {
      if (aborted) return;
      // Quiet failure: still show the "start a conversation" button.
      rootEl.innerHTML = renderShell({ yearId, slug, threads: [] });
      if (typeof onCount === 'function') onCount(0);
    }
  })();

  return () => { aborted = true; };
}

function renderShell({ yearId, slug, threads }) {
  const newHref = withBase(`/y/${yearId}/${slug}/discuss/new`);
  const items = (threads || []).filter((t) => !t.deleted);
  return `
    <section class="threadlist" aria-label="שיחות על העלון">
      <a class="threadlist-cta" href="${newHref}">
        <span class="threadlist-cta-icon">${icon('dialog', { size: 18 })}</span>
        <span class="threadlist-cta-label">התחל שיחה על העלון</span>
      </a>
      ${threads === null || items.length === 0 ? '' : `
        <ul class="threadlist-items">
          ${items.map((t) => renderRow(yearId, slug, t)).join('')}
        </ul>
      `}
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
