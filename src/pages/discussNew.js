// "Open a new conversation" page. Title: "שיחה על עלון <parshaName>".
// Two fields (title + body) + display-name prompt on first post.

import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, loadBulletin } from '../lib/store.js';
import { setPageSeo } from '../lib/seo.js';
import { getDisplayName, setDisplayName, promptForDisplayName } from '../lib/displayName.js';
import { createThread } from '../lib/threads.js';
import { withBase, navigate } from '../router.js';
import { follow as followThread } from '../lib/myDiscussions.js';

export async function renderDiscussNew({ params }) {
  const app = document.getElementById('app');
  const [config, week, nav] = await Promise.all([
    loadConfig(),
    loadBulletin(params.year, params.slug),
    navHtml(),
  ]);
  if (!week) {
    app.innerHTML = `${nav}<div class="page-not-found"><h1>העלון לא נמצא</h1></div>`;
    return;
  }
  if (config.commentsEnabled === false) {
    app.innerHTML = `${nav}<div class="page-not-found"><h1>השיחות כבויות</h1></div>`;
    return;
  }

  const backHref = withBase(`/y/${params.year}/${params.slug}`);
  app.innerHTML = `
    ${nav}
    <div class="discuss-page fade-in">
      <a class="discuss-back" href="${backHref}">→ חזרה לעלון</a>
      <h1 class="discuss-page-title">שיחה על עלון ${escapeHtml(week.parshaName || '')}</h1>
      <form class="discuss-form" id="newThreadForm">
        <label class="discuss-label">
          <span>כותרת</span>
          <input type="text" name="title" required maxlength="120" placeholder="במה תרצה לעסוק?" />
        </label>
        <label class="discuss-label">
          <span>תוכן</span>
          <textarea name="body" rows="6" required maxlength="4000" placeholder="כתוב את ההודעה הראשונה של השיחה…"></textarea>
        </label>
        <div class="discuss-form-actions">
          <a class="discuss-cancel" href="${backHref}">בטל</a>
          <button type="submit" class="discuss-submit">פרסם</button>
        </div>
        <p class="discuss-status" data-status></p>
      </form>
      ${footerHtml(config)}
    </div>
  `;
  bindNav();
  setPageSeo({
    title: `שיחה חדשה — פרשת ${week.parshaName} · ${config.siteName || 'משמעות'}`,
    description: `פתיחת שיחה חדשה על עלון פרשת ${week.parshaName}.`,
    path: `/y/${params.year}/${params.slug}/discuss/new`,
  });

  const form = app.querySelector('#newThreadForm');
  const status = form.querySelector('[data-status]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = (fd.get('title') || '').toString().trim();
    const body = (fd.get('body') || '').toString().trim();
    if (!title || !body) return;
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
        if (chosen === null) return;
        if (chosen && chosen !== name) {
          setDisplayName(chosen);
          name = chosen;
        }
      }
    }
    status.textContent = 'מפרסם…';
    status.className = 'discuss-status info';
    try {
      // First post — this is the most likely path for the email-prefs opt-in,
      // since the popup runs before the modal closes. Pass the prefs along so
      // the server can record them at the same instant.
      const { getEmailPrefs } = await import('../lib/emailPrefs.js');
      const localPrefs = getEmailPrefs();
      const r = await createThread({
        year: params.year, slug: params.slug, title, body, displayName: name,
        emailPrefs: localPrefs.email ? { email: localPrefs.email, mode: localPrefs.mode, opted: true } : null,
      });
      // Track this thread so the user gets notified when others reply.
      followThread({
        year: params.year, slug: params.slug, threadId: r.thread.id,
        title: r.thread.title, parshaName: week.parshaName,
      });
      navigate(`/y/${params.year}/${params.slug}/discuss/${r.thread.id}`);
    } catch (err) {
      if (err.status === 409 && /שם תפוס/.test(err.message || '')) {
        const chosen = await promptForDisplayName({ initial: name, error: err.message });
        if (chosen) {
          setDisplayName(chosen);
          form.dispatchEvent(new Event('submit'));
          return;
        }
        status.textContent = '';
        return;
      }
      status.textContent = err.message || 'שגיאה';
      status.className = 'discuss-status error';
    }
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
