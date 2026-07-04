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
  getThread, postReply, editThread, editReply, reactThread, reactReply, reportThread, reportReply, deleteOwn,
  markSeenOnServer,
} from '../lib/threads.js';
import { withBase } from '../router.js';
import { icon } from '../icons.js';
import { follow as followThread, markSeen } from '../lib/myDiscussions.js';
import { discussMenuHtml, bindDiscussMenu } from '../components/discussMenu.js';
import { openConfirm, openPrompt, showToast } from '../lib/dialog.js';
import {
  findMentionTrigger, insertMention, collectParticipants,
  filterParticipants, extractMentions, highlightMentions, getCaretXY,
} from '../lib/mentions.js';

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
  let replyTo = null;                 // { id, author } when replying to a specific reply
  let draftText = '';                 // preserved across re-renders so user typing isn't lost
  let firstPaint = true;              // autofocus the composer ONLY on the initial render
  let suppressFocus = false;          // when true, even firstPaint doesn't focus (e.g. user clicked reply mid-thread)

  const backHref = withBase(`/y/${params.year}/${params.slug}`);

  function paint(opts = {}) {
    const draftValue = draftText;
    const scrollY = window.scrollY;
    app.innerHTML = `
      ${nav}
      <div class="discuss-page fade-in">
        <a class="discuss-back" href="${backHref}">→ חזרה לעלון פרשת ${escapeHtml(week.parshaName || '')}</a>
        ${discussMenuHtml({ currentThreadId: thread.id })}

        ${renderMessage(thread, { isOpening: true })}

        ${replies.length ? `<div class="discuss-replies-divider"><span>${replies.length} ${replies.length === 1 ? 'תגובה' : 'תגובות'}</span></div>` : ''}
        ${replies.map((r) => renderMessage(r, { isOpening: false })).join('')}

        <div class="discuss-composer ${thread.deleted ? 'is-hidden' : ''}" id="composer">
          ${replyTo ? `
            <div class="discuss-composer-context">
              <span>בתגובה ל-<b>${escapeHtml(replyTo.author || '')}</b></span>
              <button type="button" class="discuss-composer-cancel" data-cancel-reply aria-label="בטל">×</button>
            </div>` : ''}
          <form class="discuss-composer-form" id="replyForm">
            <textarea name="body" maxlength="4000" rows="1" placeholder="${replyTo ? 'תשובה ל-' + escapeAttr(replyTo.author || '') + '…' : 'כתוב הודעה…'}"></textarea>
            <input type="text" name="honeypot" tabindex="-1" autocomplete="off" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;" aria-hidden="true" />
            <button type="submit" class="discuss-composer-send" aria-label="שלח" disabled>${icon('arrowLeft', { size: 18 })}</button>
          </form>
          <p class="discuss-status" data-status></p>
        </div>
      </div>
      ${footerHtml(config)}
    `;
    bindNav();
    bindHandlers(draftValue);
    bindDiscussMenu(app.querySelector('.discuss-menu'), { currentThreadId: thread.id });
    // Restore scroll position so re-renders don't jump the page.
    if (!firstPaint && !opts.focusComposer) {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    }
    // Composer focus is opt-in. Only when the user explicitly clicks "השב"
    // do we focus the textarea — opening a thread shouldn't pop the keyboard
    // on mobile.
    if (opts.focusComposer) {
      const ta = app.querySelector('#composer textarea');
      if (ta) {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    firstPaint = false;
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
    const replyToLabel = m.replyToAuthor && m.replyToId
      ? ` <button type="button" class="discuss-msg-replyto" data-jump-to="${escapeAttr(m.replyToId)}" title="לחץ כדי לראות את ההודעה שאליה משיבים">(בתגובה ל-${escapeHtml(m.replyToAuthor)})</button>`
      : (m.replyToAuthor
        ? ` <span class="discuss-msg-replyto">(בתגובה ל-${escapeHtml(m.replyToAuthor)})</span>`
        : '');
    // Always render the actions panel; visibility is purely class-driven.
    // Toggling the chevron is then a CSS-only change with no full re-render —
    // which means no scroll-jump and no focus theft from the composer.
    return `
      <article class="discuss-msg ${m.isAdmin ? 'is-admin' : ''} ${isExpanded && !isEditing ? 'expanded' : ''}" data-msg-id="${escapeAttr(m.id)}">
        ${isOpening && m.title ? `<h1 class="discuss-msg-title">${escapeHtml(m.title)}</h1>` : ''}
        <header class="discuss-msg-head">
          <span class="discuss-msg-author">${escapeHtml(m.author || '')}${replyToLabel}</span>
          <span class="discuss-msg-meta">
            <span class="discuss-msg-time muted">${formatTime(m.createdAt)}${m.editedAt ? ' · נערך' : ''}</span>
            <button type="button" class="discuss-msg-chevron" data-toggle="${escapeAttr(m.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="פעולות">${icon('chevronDown', { size: 16 })}</button>
          </span>
        </header>
        ${isEditing ? renderEditForm(m, isOpening) : `<div class="discuss-msg-body">${renderBody(m.body)}</div>`}
        ${isEditing ? '' : renderReactionSummary(m.id, agg)}
        ${isEditing ? '' : renderActions(m, { own, editableLate, agg })}
      </article>
    `;
  }

  function renderActions(m, { own, editableLate, agg }) {
    const links = [];
    // Reply: always available — you can reply to your own opening too,
    // which is useful if the user wants to add a clarification.
    links.push(`<button type="button" class="discuss-link" data-reply-to="${escapeAttr(m.id)}">השב</button>`);
    if (own && editableLate) links.push(`<button type="button" class="discuss-link" data-edit="${escapeAttr(m.id)}">ערוך</button>`);
    if (own) links.push(`<button type="button" class="discuss-link discuss-link--danger" data-delete-own="${escapeAttr(m.id)}">מחק</button>`);
    if (!own) links.push(`<button type="button" class="discuss-link discuss-link--muted" data-report="${escapeAttr(m.id)}">דווח</button>`);
    return `
      <div class="discuss-actions">
        ${renderReactionStrip(m.id, agg)}
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
    // Escape first so injected HTML in user input is neutralised, then
    // wrap known `@Name` mentions in a styled span. The participant list
    // is recomputed from the current thread+replies on every render.
    const escaped = escapeHtml(body || '').replace(/\n/g, '<br>');
    const participants = collectParticipants(thread, replies);
    return highlightMentions(escaped, participants);
  }

  function bindHandlers(draftValue = '') {
    // Chevron toggle: pure DOM class flip — NO paint(). This avoids scrolling
    // the page and stealing focus from wherever the user was looking.
    app.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggle;
        const article = btn.closest('.discuss-msg');
        if (!article) return;
        const wasOpen = expanded.has(id);
        if (wasOpen) expanded.delete(id); else expanded.add(id);
        article.classList.toggle('expanded', !wasOpen);
        btn.setAttribute('aria-expanded', !wasOpen ? 'true' : 'false');
      });
    });
    app.querySelectorAll('[data-react]').forEach((btn) => {
      btn.addEventListener('click', () => onReact(btn.dataset.react, btn.dataset.emoji, btn));
    });
    // "השב" — explicit user action; THIS one intentionally focuses the
    // composer (the whole point is to start typing a targeted reply).
    app.querySelectorAll('[data-reply-to]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.replyTo;
        if (id === thread.id) {
          replyTo = null;
        } else {
          const target = replies.find((r) => r.id === id);
          if (target) replyTo = { id: target.id, author: target.author };
        }
        // Re-render context bar only; preserve scroll position and focus.
        paint({ focusComposer: true });
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
    app.querySelectorAll('[data-delete-own]').forEach((btn) => {
      btn.addEventListener('click', () => onDeleteOwn(btn.dataset.deleteOwn));
    });
    // "(בתגובה ל-X)" — clicking jumps to and briefly highlights the target.
    app.querySelectorAll('[data-jump-to]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        jumpToMessage(btn.dataset.jumpTo);
      });
    });
    const cancelReplyBtn = app.querySelector('[data-cancel-reply]');
    if (cancelReplyBtn) {
      cancelReplyBtn.addEventListener('click', () => {
        replyTo = null;
        paint();
      });
    }

    // Composer: phone-style flat textarea. Auto-grows with content. Send
    // button enables when there's text. Enter submits, Shift+Enter newline.
    const composerForm = app.querySelector('#replyForm');
    if (composerForm) {
      const ta = composerForm.querySelector('textarea[name="body"]');
      const send = composerForm.querySelector('.discuss-composer-send');
      const status = app.querySelector('#composer [data-status]');

      // Restore any draft the user was typing before re-render.
      if (ta && draftValue) ta.value = draftValue;

      const autosize = () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
        send.disabled = !ta.value.trim();
      };
      autosize();

      // Mention autocomplete — a dropdown of thread participants that
      // appears when the user types `@`. Arrow keys + Enter navigate;
      // clicking inserts. Escape dismisses.
      const mentionDropdown = createMentionDropdown();
      let activeTrigger = null;
      let activeIndex = 0;
      const ownName = (getDisplayName() || '').trim();
      const refreshMentionDropdown = () => {
        const trigger = findMentionTrigger(ta);
        activeTrigger = trigger;
        if (!trigger) {
          mentionDropdown.hide();
          return;
        }
        const all = collectParticipants(thread, replies, { self: ownName });
        const matches = filterParticipants(all, trigger.query);
        if (!matches.length) {
          mentionDropdown.hide();
          return;
        }
        activeIndex = 0;
        mentionDropdown.show(matches, activeIndex, (idx) => commitMention(matches[idx]));
        positionDropdown(mentionDropdown.el, ta, trigger);
      };
      const commitMention = (p) => {
        if (!p || !activeTrigger) return;
        insertMention(ta, p.name, activeTrigger);
        mentionDropdown.hide();
        activeTrigger = null;
      };

      ta.addEventListener('input', () => {
        draftText = ta.value;
        autosize();
        refreshMentionDropdown();
      });
      ta.addEventListener('click', refreshMentionDropdown);
      ta.addEventListener('keydown', (e) => {
        // While the dropdown is visible, hijack arrows + Enter + Esc.
        if (mentionDropdown.isVisible()) {
          const itemCount = mentionDropdown.itemCount();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % itemCount;
            mentionDropdown.setActive(activeIndex);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + itemCount) % itemCount;
            mentionDropdown.setActive(activeIndex);
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            mentionDropdown.pickActive();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            mentionDropdown.hide();
            return;
          }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (!send.disabled) composerForm.requestSubmit();
        }
      });
      ta.addEventListener('blur', () => {
        // Delay so a click on a dropdown item still registers.
        setTimeout(() => mentionDropdown.hide(), 120);
      });

      composerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = ta.value.trim();
        if (!body) return;
        onPostReply(body, ta, send, status);
      });

    }
  }

  // Helper: dropdown UI for mention autocomplete.
  // Mounted on document.body so `position: fixed` near the caret isn't
  // clipped by composer overflow. Visible state lives in a class, not
  // the `[hidden]` attribute, so the CSS layout vs visibility stays
  // separate.
  function createMentionDropdown() {
    let el = document.querySelector('.discuss-mention-dropdown');
    if (!el) {
      el = document.createElement('div');
      el.className = 'discuss-mention-dropdown';
      document.body.appendChild(el);
    }
    el.style.display = 'none';
    let onPick = () => {};
    return {
      el,
      isVisible: () => el.style.display !== 'none',
      itemCount: () => el.querySelectorAll('.discuss-mention-item').length,
      show(items, activeIdx, pickHandler) {
        onPick = pickHandler;
        el.innerHTML = items.map((p, i) => `
          <button type="button" class="discuss-mention-item ${i === activeIdx ? 'is-active' : ''}" data-idx="${i}">
            <span class="discuss-mention-item-avatar" aria-hidden="true">${escapeHtml((p.name || '').slice(0, 1))}</span>
            <span class="discuss-mention-item-name">${escapeHtml(p.name)}</span>
            ${p.isAdmin ? '<span class="discuss-mention-item-badge">מנהל</span>' : ''}
          </button>
        `).join('');
        el.style.display = 'block';
        el.querySelectorAll('.discuss-mention-item').forEach((btn) => {
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // keep textarea focus
            onPick(parseInt(btn.dataset.idx, 10));
          });
        });
      },
      setActive(idx) {
        el.querySelectorAll('.discuss-mention-item').forEach((b, i) => {
          b.classList.toggle('is-active', i === idx);
        });
      },
      pickActive() {
        const active = el.querySelector('.discuss-mention-item.is-active');
        if (active) onPick(parseInt(active.dataset.idx, 10));
      },
      hide() { el.style.display = 'none'; },
    };
  }

  // Anchor the dropdown to the caret (Slack/Claude-style). The mention
  // trigger's `start` index is the `@` character — we measure that so
  // the dropdown sits right at the `@`, not somewhere else on the line.
  function positionDropdown(dropdown, ta, trigger) {
    const caret = getCaretXY(ta, trigger.start);
    // Measure dropdown to decide above-or-below placement.
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';
    dropdown.style.position = 'fixed';
    dropdown.style.top = '0';
    dropdown.style.left = '0';
    const ddRect = dropdown.getBoundingClientRect();
    dropdown.style.visibility = '';
    // Default: above the caret. Flip below if too close to viewport top.
    const lineH = caret.lineHeight || 20;
    let top = caret.top - ddRect.height - 6;
    if (top < 8) top = caret.top + lineH + 6;
    // In RTL we want the dropdown's right edge anchored to the caret;
    // in LTR the left edge. Default to right (page is dir=rtl).
    let left = caret.left - ddRect.width;
    if (left < 8) left = 8;
    // Cap to viewport right edge.
    if (left + ddRect.width > window.innerWidth - 8) {
      left = window.innerWidth - ddRect.width - 8;
    }
    dropdown.style.top = `${Math.round(top)}px`;
    dropdown.style.left = `${Math.round(left)}px`;
  }

  async function onReact(id, emoji, btn) {
    // Visual pop on the clicked emoji — cheap delight, no full repaint.
    if (btn) {
      btn.classList.remove('pop');
      // Force reflow so the animation re-triggers if user clicks rapidly.
      void btn.offsetWidth;
      btn.classList.add('pop');
    }
    try {
      const result = id === thread.id
        ? await reactThread({ year: params.year, slug: params.slug, threadId: thread.id, emoji })
        : await reactReply({ year: params.year, slug: params.slug, threadId: thread.id, replyId: id, emoji });
      reactions[id] = result.agg || {};
      // Surgical update — replace just this message's reactions strip and
      // its always-visible summary, so the page neither scrolls nor loses
      // focus.
      const article = app.querySelector(`.discuss-msg[data-msg-id="${cssEscape(id)}"]`);
      if (article) {
        const strip = article.querySelector('.discuss-actions-reactions');
        if (strip) {
          strip.outerHTML = renderReactionStrip(id, reactions[id]);
          article.querySelectorAll('.discuss-actions-reactions [data-react]').forEach((b) => {
            b.addEventListener('click', () => onReact(b.dataset.react, b.dataset.emoji, b));
          });
        }
        const summary = article.querySelector(`[data-summary="${cssEscape(id)}"]`);
        if (summary) {
          summary.outerHTML = renderReactionSummary(id, reactions[id]);
        }
      }
    } catch (e) {
      showToast(e.message || 'שגיאה', { kind: 'error' });
    }
  }

  function renderReactionStrip(id, agg) {
    return `
      <div class="discuss-actions-reactions">
        ${REACTIONS.map((emoji) => {
          const n = agg[emoji] || 0;
          return `<button type="button" class="discuss-reaction" data-react="${escapeAttr(id)}" data-emoji="${escapeAttr(emoji)}">${emoji}${n ? `<span>${n}</span>` : ''}</button>`;
        }).join('')}
      </div>
    `;
  }

  /** Always-visible summary of reactions that have been used. Stays under
   *  the message body so everyone sees them without expanding the chevron. */
  function renderReactionSummary(id, agg) {
    const entries = Object.entries(agg || {}).filter(([, n]) => n > 0);
    if (!entries.length) return `<div class="discuss-msg-reaction-summary" data-summary="${escapeAttr(id)}" hidden></div>`;
    return `
      <div class="discuss-msg-reaction-summary" data-summary="${escapeAttr(id)}">
        ${entries.map(([emoji, n]) => `<span class="reaction-tally">${emoji}<span>${n}</span></span>`).join('')}
      </div>
    `;
  }

  function cssEscape(s) {
    return String(s || '').replace(/[^A-Za-z0-9_-]/g, '');
  }

  /** Scroll the target message into view and pulse its border so the user
   *  can spot which message was being replied to. Does nothing if the
   *  target is missing (deleted / not in the loaded thread). */
  function jumpToMessage(id) {
    const target = app.querySelector(`.discuss-msg[data-msg-id="${cssEscape(id)}"]`);
    if (!target) {
      showToast('ההודעה אינה זמינה', { kind: 'error' });
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Re-trigger the highlight class even on rapid repeat clicks.
    target.classList.remove('jump-highlight');
    void target.offsetWidth;
    target.classList.add('jump-highlight');
    setTimeout(() => target.classList.remove('jump-highlight'), 2000);
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
      showToast(e.message || 'שגיאה', { kind: 'error' });
    }
  }

  async function onDeleteOwn(id) {
    const isThread = id === thread.id;
    const ok = await openConfirm({
      title: isThread ? 'מחיקת השיחה' : 'מחיקת התגובה',
      message: isThread
        ? 'הכותרת וההודעה ייעלמו מהאתר. תגובות שאחרים כתבו יישארו, ושאר המשתמשים יוכלו לראות שההודעה נמחקה.'
        : 'התגובה תוסר מהאתר. שאר המשתמשים יוכלו לראות שההודעה נמחקה.',
      confirmLabel: 'מחק',
      cancelLabel: 'בטל',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteOwn({
        id, year: params.year, slug: params.slug,
        threadId: isThread ? null : thread.id,
      });
      // Local soft-delete + repaint.
      if (isThread) {
        thread.deleted = true;
      } else {
        const i = replies.findIndex((r) => r.id === id);
        if (i >= 0) replies[i] = { ...replies[i], deleted: true };
      }
      paint();
      showToast('נמחק', { kind: 'success' });
    } catch (e) {
      showToast(e.message || 'שגיאה', { kind: 'error' });
    }
  }

  async function onReport(id) {
    const reason = await openPrompt({
      title: 'דיווח על תגובה',
      message: 'אם הודעה זו אינה ראויה — ספר לנו למה. הסיבה אופציונלית.',
      placeholder: 'מה הבעיה? (לא חובה)',
      multiline: true,
      confirmLabel: 'שלח דיווח',
      cancelLabel: 'בטל',
      maxLength: 200,
    });
    // openPrompt returns null on cancel — no report sent. Empty string is also
    // valid (user submitted with no reason given).
    if (reason === null) return;
    try {
      if (id === thread.id) await reportThread({ year: params.year, slug: params.slug, threadId: id, reason });
      else await reportReply({ year: params.year, slug: params.slug, threadId: thread.id, replyId: id, reason });
      showToast('הדיווח התקבל. תודה.', { kind: 'success' });
    } catch (e) {
      showToast(e.message || 'שגיאה', { kind: 'error' });
    }
  }

  async function onPostReply(body, ta, sendBtn, status) {
    let name = getDisplayName();
    if (!name) {
      const chosen = await promptForDisplayName({});
      if (!chosen) return;
      setDisplayName(chosen);
      name = chosen;
    } else {
      // Existing user that never went through the email opt-in (signed up
      // before the popup feature existed). Surface it once so they can
      // choose to receive notifications.
      const { hasOpted } = await import('../lib/emailPrefs.js');
      if (!hasOpted()) {
        const chosen = await promptForDisplayName({ initial: name, askEmail: true });
        if (chosen === null) return; // user cancelled
        if (chosen && chosen !== name) {
          setDisplayName(chosen);
          name = chosen;
        }
      }
    }
    status.textContent = 'שולח…';
    status.className = 'discuss-status info';
    sendBtn.disabled = true;
    try {
      // Collect mentions from the body so the worker knows who to notify.
      // We exclude the author themselves from the mentionable list so a
      // self-mention isn't sent — the server still validates.
      const participants = collectParticipants(thread, replies, { self: name });
      const mentions = extractMentions(body, participants);
      // Piggy-back the poster's email prefs so the server can update its
      // store at the same time — covers the case where the user opted in
      // through the popup and we want their first reply to also seed the
      // server-side prefs.
      const localPrefs = (await import('../lib/emailPrefs.js')).getEmailPrefs();
      const r = await postReply({
        year: params.year, slug: params.slug, threadId: thread.id, body, displayName: name,
        replyToId: replyTo ? replyTo.id : null,
        mentions,
        emailPrefs: localPrefs.email ? { email: localPrefs.email, mode: localPrefs.mode, opted: true } : null,
      });
      replies.push(r.reply);
      thread.replyCount = (thread.replyCount || 0) + 1;
      thread.lastAt = r.reply.createdAt;
      // Reset composer: clear text, drop reply-context.
      draftText = '';
      replyTo = null;
      status.textContent = '';
      // Track this thread for "my conversations" notifications.
      followThread({
        year: params.year, slug: params.slug, threadId: thread.id,
        title: thread.title, parshaName: week.parshaName,
      });
      paint();
    } catch (e) {
      sendBtn.disabled = false;
      if (e.status === 409 && /שם תפוס/.test(e.message || '')) {
        const chosen = await promptForDisplayName({ initial: name, error: e.message });
        if (chosen) {
          setDisplayName(chosen);
          return onPostReply(body, ta, sendBtn, status);
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

  // Visiting a thread you follow counts as "seen" — clear its unread badge.
  markSeen(thread.id);
  // Tell the server too, so the cron-queued notification emails are
  // suppressed for any replies the user has already seen on-page. Silent
  // on failure: the email might still go out if the network blip eats
  // the call — minor inconvenience, not a data-loss bug.
  markSeenOnServer({ year: params.year, slug: params.slug, threadId: thread.id }).catch(() => {});

  paint();

  // === Real-time polling ============================================
  // Refresh the thread state every few seconds so a reply someone else
  // posts shows up without forcing the reader to reload. Visibility-aware
  // (no work while the tab is hidden) and backs off to 15s after a few
  // empty polls. Returns a cleanup the router will call on navigation.
  const POLL_BASE_MS = 6000;
  const POLL_BACKOFF_MS = 15000;
  const POLL_BACKOFF_AFTER = 5;
  let pollTimer = null;
  let aborted = false;
  let pollInFlight = false;
  let emptyPolls = 0;

  async function poll() {
    if (aborted || document.visibilityState === 'hidden' || pollInFlight) {
      schedulePoll();
      return;
    }
    pollInFlight = true;
    try {
      const data = await getThread({ year: params.year, slug: params.slug, threadId: params.threadId });
      const newLastAt = data.thread?.lastAt || '';
      const newReplyCount = (data.replies || []).length;
      // Only repaint if something actually changed — avoids stealing focus
      // and disrupting the user when nothing is new.
      if (newLastAt > (thread.lastAt || '') || newReplyCount !== replies.length) {
        Object.assign(thread, data.thread);
        replies = data.replies || [];
        reactions = data.reactions || {};
        emptyPolls = 0;
        // Preserve composer focus + caret across the repaint.
        const ta = app.querySelector('#composer textarea');
        const wasFocused = ta && document.activeElement === ta;
        const caret = ta ? ta.selectionStart : null;
        paint();
        if (wasFocused) {
          const ta2 = app.querySelector('#composer textarea');
          if (ta2) {
            ta2.focus({ preventScroll: true });
            if (caret !== null) ta2.setSelectionRange(caret, caret);
          }
        }
      } else {
        emptyPolls++;
      }
    } catch (_) {
      // Polling errors stay silent — transient network blips shouldn't
      // surface a toast every 6 seconds.
    } finally {
      pollInFlight = false;
      schedulePoll();
    }
  }

  function schedulePoll() {
    if (aborted) return;
    clearTimeout(pollTimer);
    const delay = emptyPolls >= POLL_BACKOFF_AFTER ? POLL_BACKOFF_MS : POLL_BASE_MS;
    pollTimer = setTimeout(poll, delay);
  }

  function onVisibilityChange() {
    if (aborted) return;
    if (document.visibilityState === 'visible' && !pollInFlight) {
      // Wake immediately when the user comes back to the tab.
      clearTimeout(pollTimer);
      poll();
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  schedulePoll();

  return function cleanup() {
    aborted = true;
    clearTimeout(pollTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
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
