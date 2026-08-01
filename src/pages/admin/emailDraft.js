// Admin "weekly email" page: compose the optional per-bulletin intro text +
// article description, see a live preview of the real email, and send a test
// to yourself before blasting the whole list. Everything is saved per-bulletin
// (KV `email-draft:<year>/<slug>`) and merged into the email at send time.

import { icon } from '../../icons.js';
import { adminCall, adminFetch } from '../../lib/adminApi.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export async function renderEmailDraft(root) {
  root.innerHTML = `<header class="admin-header"><h1>המייל השבועי</h1></header>
    <div class="loading"><div class="spinner"></div></div>`;

  let d;
  try {
    d = await adminCall('/admin/email-draft');
  } catch (e) {
    root.innerHTML = `<header class="admin-header"><h1>המייל השבועי</h1></header>
      <div class="admin-card"><p class="admin-status error">${escapeHtml(e.message)}</p></div>`;
    return;
  }

  root.innerHTML = `
    <header class="admin-header"><h1>המייל השבועי</h1></header>
    <p class="muted" style="margin:0 0 16px;">התאמות למייל של <b>פרשת ${escapeHtml(d.parshaName || d.slug || '')}</b>. הכול אופציונלי, ונשמר לעלון הזה בלבד. שאר המייל (פנייה אישית, קלף, כפתורים) נבנה אוטומטית.</p>
    <div class="email-draft-grid">
      <div class="admin-card">
        <div class="form-group">
          <label>טקסט פתיחה</label>
          <div class="muted" style="font-weight:400;margin:2px 0 6px;font-size:.88rem;">משפט או שניים שיופיעו מתחת לפנייה האישית ("ערב שבת שלום, ___!").</div>
          <textarea name="intro" rows="4" style="width:100%;box-sizing:border-box;" placeholder="למשל: השבוע נעסוק בנחמה שאחרי החורבן — ובשאלה איך דווקא הדאגה יכולה להפוך לכוח.">${escapeHtml(d.intro || '')}</textarea>
        </div>
        <div class="form-group">
          <label>תיאור המאמר</label>
          <div class="muted" style="font-weight:400;margin:2px 0 6px;font-size:.88rem;">פסקה קצרה שתופיע תחת הכותרת "על המאמר", בנוסף לקלף.</div>
          <textarea name="description" rows="4" style="width:100%;box-sizing:border-box;" placeholder="תקציר קצר של רעיון המאמר…">${escapeHtml(d.description || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" type="button" id="saveDraft">${icon('check', { size: 18 })} שמור ורענן תצוגה</button>
          <button class="btn btn-secondary" type="button" id="testEmail">${icon('email', { size: 18 })} שלח בדיקה אליי</button>
        </div>
        <div id="draftStatus" style="margin-top:12px;min-height:20px;"></div>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden;">
        <div style="padding:11px 16px;border-bottom:1px solid var(--a-edge, #ece4d0);font-size:.85rem;color:var(--a-ink-soft, #6f675b);display:flex;justify-content:space-between;align-items:center;">
          <span>תצוגה מקדימה — מנוי עם שם</span>
          <button class="btn-plain" type="button" id="toggleNoName" style="background:none;border:0;color:var(--a-accent, #2d6a4f);cursor:pointer;font:inherit;font-size:.82rem;text-decoration:underline;">הצג גרסת "אין שם"</button>
        </div>
        <iframe id="emailPreview" title="תצוגה מקדימה של המייל" style="width:100%;height:640px;border:0;background:#efe9dd;display:block;"></iframe>
      </div>
    </div>
  `;

  const status = root.querySelector('#draftStatus');
  const iframe = root.querySelector('#emailPreview');
  let showNoName = false;

  const refreshPreview = async () => {
    try {
      // name= (empty) previews the no-name variant; omitting it previews a named
      // subscriber. The endpoint renders the *real* email template.
      const path = showNoName ? '/admin/email-preview?name=' : '/admin/email-preview';
      const r = await adminFetch(path);
      iframe.srcdoc = await r.text();
    } catch (_) { /* keep the last good preview */ }
  };
  refreshPreview();

  root.querySelector('#toggleNoName').addEventListener('click', (e) => {
    showNoName = !showNoName;
    e.currentTarget.textContent = showNoName ? 'הצג גרסה עם שם' : 'הצג גרסת "אין שם"';
    e.currentTarget.closest('div').querySelector('span').textContent =
      showNoName ? 'תצוגה מקדימה — מנוי בלי שם' : 'תצוגה מקדימה — מנוי עם שם';
    refreshPreview();
  });

  root.querySelector('#saveDraft').addEventListener('click', async () => {
    const intro = root.querySelector('textarea[name=intro]').value;
    const description = root.querySelector('textarea[name=description]').value;
    status.innerHTML = `<span class="muted">שומר…</span>`;
    try {
      await adminCall('/admin/email-draft', { method: 'POST', body: { yearId: d.yearId, slug: d.slug, intro, description } });
      d.intro = intro; d.description = description;
      status.innerHTML = `<span class="admin-status success">נשמר. התצוגה עודכנה.</span>`;
      refreshPreview();
    } catch (e) {
      status.innerHTML = `<span class="admin-status error">${escapeHtml(e.message)}</span>`;
    }
  });

  root.querySelector('#testEmail').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!confirm('לשלוח אליך מייל-בדיקה של העלון (עם ההתאמות שנשמרו)?')) return;
    btn.disabled = true;
    status.innerHTML = `<span class="muted">שולח בדיקה…</span>`;
    try {
      const res = await adminCall('/admin/email-test', { method: 'POST', body: {} });
      status.innerHTML = `<span class="admin-status success">נשלח אליך (${escapeHtml(res.sent || '')}). בדוק את תיבת הדואר.</span>`;
    } catch (e) {
      status.innerHTML = `<span class="admin-status error">${escapeHtml(e.message)}</span>`;
    }
    btn.disabled = false;
  });
}
