// Single-thread view. Shows the opening message and chronological replies.
//
// Each message has a small ▾ chevron. By default no actions are visible —
// click the chevron to expand:
//   - on others' messages: react + reply
//   - on your own message: edit
// While editing, the textarea replaces the body. A "save" button appears
// only after the text actually changes (otherwise hidden).

import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, loadBulletin } from '../lib/store.js';
import { setPageSeo } from '../lib/seo.js';
import { ensureFp } from '../lib/fp.js';
import { getDisplayName, setDisplayName, promptForDisplayName } from '../lib/displayName.js';
import {
  getThread, postReply, editThread, editReply, reactThread, reactReply, reportThread, reportReply,
} from '../lib/threads.js';
import { withBase } from '../router.js';

const REACTIONS = ['❤', '🙏', '👍', '🤔', '😮'];

export async function renderDiscussThread({ params }) {
  const app = document.getElementById('app');
  const fp = ensureFp();
  const [config, week, nav] = await Promise.all([
    loadConfig(),
    loadBulletin(params.year, params.slug),
    navHtml(),
  ]);
  if (!week) {
    app.innerHTML = `${nav}<div class="page-not-found"><h1>העלון לא נמצא</h1></div>`;
    return;
  }

  let data;
  try {
    data = await getThread({ year: params.year, slug: params.slug, threadId: params.threadId });
  } catch (e) {
    app.innerHTML = `${nav}<div class="page-not-found"><h1>השיחה לא נמצאה</h1><p class="muted">${escapeHtml(e.message || '')}</p></div>`;
    return;
  }

  const thread = data.thread;
  let replies = data.replies || [];
  let reactions = data.reactions || {};
  const expanded = new Set();         // message ids whose actions panel is open
  const editing = new Set();          // message ids being edited inline

  const backHref = withBase(`/y/${params.year}/${params.slug}`);

  function paint() {
    app.innerHTML = `
      ${nav}
      <div class="discuss-page fade-in">
        <a class="discuss-back" href="${backHref}">→ חזרה לעלון פרשת ${escapeHtml(week.parshaName || '')}</a>

        ${renderMessage(thread, { isOpening: true })}
        ${replies.map((r) => renderMessage(r, { isOpening: false })).join('')}

        <form class="discuss-reply-form" id="replyForm" ${thread.deleted ? 'hidden' : ''}>
          <textarea name="body" rows="3" maxlength="4000" placeholder="הוסף תגובה לשיחה…" required></textarea>
          <input type="text" name="honeypot" tabindex="-1" autocomplete="off" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;" aria-hidden="true" />
          <div class="discuss-form-actions">
            <button type="submit" class="discuss-submit">השב</button>
            <span class="discuss-status" data-status></span>
          </div>
        </form>

        ${footerHtml(config)}
      </div>
    `;
    bindNav();
    bindHandlers();
  }

  function renderMessage(m, { isOpening }) {
    if (m.deleted) {
      return `<article class="discuss-msg deleted"><p class="muted">[ההודעה נמחקה]</p></article>`;
    }
    const own = m.fp === fp;
    const editableLate = own && (Date.now() - Date.parse(m.createdAt) < 15 * 60 * 1000);
    const isExpanded = expanded.has(m.id);
    const isEditing = editing.has(m.id);
    const agg = reactions[m.id] || {};
    return `
      <article class="discuss-msg ${m.isAdmin ? 'is-admin' : ''}" data-msg-id="${escapeAttr(m.id)}">
        ${isOpening && m.title ? `<h1 class="discuss-msg-title">${escapeHtml(m.title)}</h1>` : ''}
        <header class="discuss-msg-head">
          <span class="discuss-msg-author">${escapeHtml(m.author || '')}${m.isAdmin ? ' · מנהל' : ''}</span>
          <span class="discuss-msg-time muted">${formatTime(m.createdAt)}${m.editedAt ? ' · נערך' : ''}</span>
        </header>
        ${isEditing ? renderEditForm(m, isOpening) : `<div class="discuss-msg-body">${renderBody(m.body)}</div>`}
        <button type="button" class="discuss-msg-chevron" data-toggle="${escapeAttr(m.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="פעולות">▾</button>
        ${isExpanded && !isEditing ? renderActions(m, { own, editableLate, agg }) : ''}
      </article>
    `;
  }

  function renderActions(m, { own, editableLate, agg }) {
    const reactionRow = `
      <div class="discuss-actions-reactions">
        ${REACTIONS.map((emoji) => {
          const n = agg[emoji] || 0;
          return `<button type="button" class="discuss-reaction" data-react="${escapeAttr(m.id)}" data-emoji="${escapeAttr(emoji)}">${emoji}${n ? ` ${n}` : ''}</button>`;
        }).join('')}
      </div>`;
    const links = [];
    if (!own) links.push(`<button type="button" class="discuss-link" data-reply-to="${escapeAttr(m.id)}">השב</button>`);
    if (editableLate) links.push(`<button type="button" class="discuss-link" data-edit="${escapeAttr(m.id)}">ערוך</button>`);
    if (!own) links.push(`<button type="button" class="discuss-link discuss-link--muted" data-report="${escapeAttr(m.id)}">דווח</button>`);
    return `
      <div class="discuss-actions">
        ${reactionRow}
        ${links.length ? `<div class="discuss-actions-links">${links.join('')}</div>` : ''}
      </div>
    `;
  }

  function renderEditForm(m, isOpening) {
    return `
      <form class="discuss-edit" data-edit-form="${escapeAttr(m.id)}" data-original-body="${escapeAttr(m.body || '')}" ${isOpening && m.title !== undefined ? `data-original-title="${escapeAttr(m.title || '')}"` : ''}>
        ${isOpening && m.title !== undefined ? `<input type="text" name="title" maxlength="120" value="${escapeAttr(m.title || '')}" required />` : ''}
        <textarea name="body" rows="3" maxlength="4000" required>${escapeHtml(m.body || '')}</textarea>
        <div class="discuss-edit-actions">
          <button type="button" class="discuss-link" data-edit-cancel="${escapeAttr(m.id)}">בטל</button>
          <button type="submit" class="discuss-submit" data-save="${escapeAttr(m.id)}" hidden>שמור שינויים</button>
        </div>
      </form>
    `;
  }

  function renderBody(body) {
    return escapeHtml(body || '').replace(/\n/g, '<br>');
  }

  function bindHandlers() {
    app.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggle;
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        editing.delete(id);
        paint();
      });
    });
    app.querySelectorAll('[data-react]').forEach((btn) => {
      btn.addEventListener('click', () => onReact(btn.dataset.react, btn.dataset.emoji));
    });
    app.querySelectorAll('[data-reply-to]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const composer = app.querySelector('#replyForm textarea');
        if (composer) composer.focus();
      });
    });
    app.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.edit;
        editing.add(id);
        paint();
      });
    });
    app.querySelectorAll('[data-edit-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editCancel;
        editing.delete(id);
        paint();
      });
    });
    app.querySelectorAll('[data-edit-form]').forEach((form) => {
      const id = form.dataset.editForm;
      const origBody = form.dataset.originalBody || '';
      const origTitle = form.dataset.originalTitle;
      const saveBtn = form.querySelector('[data-save]');
      const titleEl = form.querySelector('input[name="title"]');
      const bodyEl = form.querySelector('textarea[name="body"]');
      const updateSaveVisibility = () => {
        const titleChanged = titleEl ? (titleEl.value !== origTitle) : false;
        const bodyChanged = bodyEl.value !== origBody;
        saveBtn.hidden = !(titleChanged || bodyChanged);
      };
      bodyEl.addEventListener('input', updateSaveVisibility);
      if (titleEl) titleEl.addEventListener('input', updateSaveVisibility);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (saveBtn.hidden) return;
        onEditSubmit(id, form);
      });
    });
    app.querySelectorAll('[data-report]').forEach((btn) => {
      btn.addEventListener('click', () => onReport(btn.dataset.report));
    });
    const replyForm = app.querySelector('#replyForm');
    if (replyForm) {
      const status = replyForm.querySelector('[data-status]');
      replyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = (new FormData(replyForm).get('body') || '').toString().trim();
        if (!body) return;
        onPostReply(body, replyForm, status);
      });
    }
  }

  async function onReact(id, emoji) {
    try {
      const result = id === thread.id
        ? await reactThread({ year: params.year, slug: params.slug, threadId: thread.id, emoji })
        : await reactReply({ year: params.year, slug: params.slug, threadId: thread.id, replyId: id, emoji });
      reactions[id] = result.agg || {};
      paint();
    } catch (e) {
      alert(e.message || 'שגיאה');
    }
  }

  async function onEditSubmit(id, form) {
    const fd = new FormData(form);
    const body = (fd.get('body') || '').toString().trim();
    const title = fd.get('title') !== null ? (fd.get('title') || '').toString().trim() : undefined;
    try {
      if (id === thread.id) {
        const r = await editThread({
          year: params.year, slug: params.slug, threadId: id,
          title: title !== undefined ? title : undefined,
          body,
        });
        Object.assign(thread, r.thread);
      } else {
        const r = await editReply({
          year: params.year, slug: params.slug, threadId: thread.id, replyId: id, body,
        });
        const i = replies.findIndex((x) => x.id === id);
        if (i >= 0) replies[i] = r.reply;
      }
      editing.delete(id);
      paint();
    } catch (e) {
      alert(e.message || 'שגיאה');
    }
  }

  async function onReport(id) {
    const reason = prompt('סבר את סיבת הדיווח (לא חובה):') || '';
    if (reason === null) return;
    try {
      if (id === thread.id) await reportThread({ year: params.year, slug: params.slug, threadId: id, reason });
      else await reportReply({ year: params.year, slug: params.slug, threadId: thread.id, replyId: id, reason });
      alert('הדיווח התקבל. תודה.');
    } catch (e) {
      alert(e.message || 'שגיאה');
    }
  }

  async function onPostReply(body, form, status) {
    let name = getDisplayName();
    if (!name) {
      const chosen = await promptForDisplayName({});
      if (!chosen) return;
      setDisplayName(chosen);
      name = chosen;
    }
    status.textContent = 'שולח…';
    status.className = 'discuss-status info';
    try {
      const r = await postReply({
        year: params.year, slug: params.slug, threadId: thread.id, body, displayName: name,
      });
      replies.push(r.reply);
      thread.replyCount = (thread.replyCount || 0) + 1;
      thread.lastAt = r.reply.createdAt;
      form.querySelector('textarea[name="body"]').value = '';
      status.textContent = '';
      paint();
    } catch (e) {
      if (e.status === 409 && /שם תפוס/.test(e.message || '')) {
        const chosen = await promptForDisplayName({ initial: name, error: e.message });
        if (chosen) {
          setDisplayName(chosen);
          return onPostReply(body, form, status);
        }
        status.textContent = '';
        return;
      }
      status.textContent = e.message || 'שגיאה';
      status.className = 'discuss-status error';
    }
  }

  setPageSeo({
    title: `${thread.title || 'שיחה'} — פרשת ${week.parshaName} · ${config.siteName || 'משמעות'}`,
    description: (thread.body || '').slice(0, 160),
    path: `/y/${params.year}/${params.slug}/discuss/${thread.id}`,
  });

  paint();
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL');
}
