// Cloud-only admin panel. Talks to the Cloudflare Worker (alonmashmaut.org/admin)
// using an API key stored in localStorage. No local server required.

import { icon } from '../icons.js';
import { PARSHIOT, slugForHebrew, hebrewYearToNumber, numberToHebrewYear, cycleOrderForSlug } from '../lib/parshiot.js';
import { loadIndex, loadConfig, loadBulletin, patchConfig } from '../lib/store.js';
import { showToast } from '../components/shareButtons.js';
import { mountRichEditor } from '../components/richEditor.js';
import { renderStats } from './admin/stats.js';
import { renderNotifications, getUnreadNotifCount } from './admin/notifications.js';
import { convertWordToHtml, extractPdfPalette, fileToBase64 } from '../lib/fileProcess.js';

const KEY_STORAGE = 'mashmaut.adminKey';

function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
}
function setKey(v) {
  try { localStorage.setItem(KEY_STORAGE, v); } catch (_) {}
}
function clearKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch (_) {}
}

async function adminApi(path, opts = {}) {
  const cfg = await loadConfig();
  const base = (cfg.apiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('API לא מוגדר');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getKey(),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401) {
    clearKey();
    throw new Error('סיסמה שגויה — התחבר מחדש');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

export async function renderAdmin({ params }) {
  const app = document.getElementById('app');

  if (!getKey()) {
    return renderLogin(app);
  }

  // Verify the saved key still works
  try {
    await adminApi('/admin/auth', { method: 'POST', body: {} });
  } catch (e) {
    return renderLogin(app, e.message);
  }

  const section = params?.section || 'dashboard';
  // Keep the admin chrome (sidebar + bottom tabbar + bottom sheet) mounted
  // across section changes — re-rendering the whole shell on every navigation
  // produces a visible flash. We only re-render when the shell is missing
  // (first entry into admin or after coming back from public pages).
  // tabbar/sheet/backdrop must live OUTSIDE .admin-shell because .fade-in
  // leaves a transform on the shell, which would pin position:fixed
  // descendants to the shell instead of the viewport.
  let shell = app.querySelector('.admin-shell');
  if (!shell) {
    app.innerHTML = `
      <div class="admin-shell fade-in">
        ${renderSidebar(section)}
        ${renderMobileBack(section)}
        <main class="admin-main" id="adminMain"></main>
      </div>
      ${renderTabbar(section)}
      ${renderMoreSheet(section)}
    `;
    bindSidebar();
    bindMoreSheet();
  } else {
    // Update active states in-place + swap the mobile-back chevron.
    app.querySelectorAll('.admin-nav-item').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const targetId = href.replace(/^\/admin\/?/, '') || 'dashboard';
      el.classList.toggle('active', targetId === section);
    });
    app.querySelectorAll('.admin-tab').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const targetId = href.replace(/^\/admin\/?/, '') || 'dashboard';
      const moreSections = ['years', 'subscribers', 'settings', 'edit', 'notifications'];
      const moreActive = moreSections.includes(section);
      if (el.id === 'adminMoreBtn') el.classList.toggle('active', moreActive);
      else el.classList.toggle('active', targetId === section);
    });
    // Mobile back pill: only on non-dashboard pages.
    const existingBack = app.querySelector('.admin-back');
    if (section === 'dashboard') { existingBack && existingBack.remove(); }
    else if (!existingBack) {
      shell.querySelector('.admin-main')?.insertAdjacentHTML('beforebegin', renderMobileBack(section));
    }
  }
  const main = document.getElementById('adminMain');
  switch (section) {
    case 'upload': await renderUpload(main); break;
    case 'bulletins': await renderBulletinList(main); break;
    case 'years': await renderYearsAdmin(main); break;
    case 'stats': await renderStats(main); break;
    case 'subscribers': await renderSubscribers(main); break;
    case 'notifications': await renderNotifications(main); break;
    case 'settings': await renderSettings(main); break;
    case 'edit': await renderEditor(main); break;
    default: await renderDashboard(main);
  }

  // Refresh the unread-notification badge in the chrome.
  refreshNotifBadge();
}

async function refreshNotifBadge() {
  try {
    const count = await getUnreadNotifCount();
    document.querySelectorAll('[data-notif-badge]').forEach((el) => {
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  } catch { /* best-effort */ }
}

function renderLogin(app, errorMsg = '') {
  app.innerHTML = `
    <div class="admin-login">
      <div class="admin-login-card">
        <div class="modal-icon" style="margin: 0 auto 16px;">${icon('settings', { size: 36 })}</div>
        <h2 style="margin-bottom: 8px;">פאנל ניהול</h2>
        <p class="muted" style="margin-bottom: 24px;">משמעות · עלון פרשת השבוע</p>
        ${errorMsg ? `<div class="admin-status error" style="margin-bottom: 14px;">${errorMsg}</div>` : ''}
        <form id="loginForm">
          <div class="form-group">
            <input type="password" name="key" placeholder="סיסמת מנהל" autofocus required style="width:100%;padding:12px 18px;border:1px solid var(--border);border-radius:999px;font:inherit;text-align:center;letter-spacing:0.05em;" />
          </div>
          <button class="btn" type="submit" style="width:100%;justify-content:center;padding:12px;">${icon('check', { size: 18 })} כניסה</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const key = (fd.get('key') || '').trim();
    if (!key) return;
    setKey(key);
    try {
      await adminApi('/admin/auth', { method: 'POST', body: {} });
      // Re-render
      renderAdmin({ params: { section: 'dashboard' } });
    } catch (err) {
      clearKey();
      renderLogin(app, err.message);
    }
  });
}

function renderSidebar(active) {
  const items = [
    { id: 'dashboard', label: 'ראשי', icon: 'home' },
    { id: 'notifications', label: 'התראות', icon: 'email', badge: true },
    { id: 'upload', label: 'העלאת עלון', icon: 'upload' },
    { id: 'bulletins', label: 'עלונים', icon: 'book' },
    { id: 'years', label: 'שנים', icon: 'calendar' },
    { id: 'stats', label: 'גרף שימוש', icon: 'eye' },
    { id: 'subscribers', label: 'מנויים', icon: 'email' },
    { id: 'settings', label: 'הגדרות', icon: 'settings' },
  ];
  return `
    <aside class="admin-sidebar">
      <div class="admin-sidebar-brand">משמעות · ניהול</div>
      ${items.map((it) => `
        <a class="admin-nav-item ${active === it.id ? 'active' : ''}" href="/admin/${it.id === 'dashboard' ? '' : it.id}">
          ${icon(it.icon, { size: 18 })} <span>${it.label}</span>
          ${it.badge ? '<span class="notif-badge" data-notif-badge hidden></span>' : ''}
        </a>
      `).join('')}
      <div style="flex:1"></div>
      <a class="admin-nav-item" href="/" target="_blank">${icon('eye', { size: 18 })} <span>צפה באתר</span></a>
      <button type="button" class="admin-nav-item" id="logoutBtn" style="background:transparent;border:none;width:100%;text-align:right;cursor:pointer;">${icon('close', { size: 18 })} <span>התנתק</span></button>
    </aside>
  `;
}

/**
 * Set up a delayed loading state. The caller MUST invoke the returned cancel
 * fn once it has rendered. If it cancels before `delay` elapses, no spinner
 * ever appears — the previous section's content stays visible the whole time.
 */
function delayedLoading(root, headerText, delay = 250) {
  const t = setTimeout(() => {
    root.innerHTML = `<header class="admin-header"><h1>${headerText}</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, delay);
  return () => clearTimeout(t);
}

function renderTabbar(active) {
  // 4 primary destinations on mobile + a "More" sheet for the rest.
  // Sidebar handles full nav on tablet+ widths.
  const tabs = [
    { id: 'dashboard', label: 'ראשי', icon: 'home' },
    { id: 'upload', label: 'העלאה', icon: 'upload' },
    { id: 'bulletins', label: 'עלונים', icon: 'book' },
    { id: 'stats', label: 'שימוש', icon: 'eye' },
  ];
  const moreSections = ['years', 'subscribers', 'settings', 'edit', 'notifications'];
  const moreActive = moreSections.includes(active);
  return `
    <nav class="admin-tabbar" aria-label="ניווט מהיר">
      ${tabs.map((t) => `
        <a class="admin-tab ${active === t.id ? 'active' : ''}" href="/admin/${t.id === 'dashboard' ? '' : t.id}">
          ${icon(t.icon, { size: 22 })}
          <span>${t.label}</span>
        </a>
      `).join('')}
      <button type="button" class="admin-tab ${moreActive ? 'active' : ''}" id="adminMoreBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="adminMoreSheet">
        ${icon('menu', { size: 22 })}
        <span>עוד</span>
        <span class="notif-badge notif-badge--tab" data-notif-badge hidden></span>
      </button>
    </nav>
  `;
}

function renderMobileBack(section) {
  // Quick "back to dashboard" affordance on mobile, shown on every page
  // except the dashboard itself.
  if (section === 'dashboard') return '';
  return `
    <a class="admin-back" href="/admin/" aria-label="חזרה לתפריט הראשי">
      ${icon('chevronRight', { size: 20 })}
      <span>ראשי</span>
    </a>
  `;
}

function renderMoreSheet(active) {
  const items = [
    { id: 'notifications', label: 'התראות', icon: 'email', href: '/admin/notifications', badge: true },
    { id: 'subscribers', label: 'מנויים', icon: 'email', href: '/admin/subscribers' },
    { id: 'years', label: 'שנים', icon: 'calendar', href: '/admin/years' },
    { id: 'settings', label: 'הגדרות', icon: 'settings', href: '/admin/settings' },
    { id: 'view', label: 'צפה באתר', icon: 'eye', href: '/', external: true },
    { id: 'logout', label: 'התנתק', icon: 'close', action: 'logout' },
  ];
  return `
    <div class="admin-sheet-backdrop" id="adminMoreBackdrop" hidden></div>
    <div class="admin-sheet" id="adminMoreSheet" role="menu" aria-label="עוד" hidden>
      <div class="admin-sheet-grip"></div>
      <h3 class="admin-sheet-title">עוד אפשרויות</h3>
      <div class="admin-sheet-list">
        ${items.map((it) => {
          const isActive = active === it.id;
          if (it.action === 'logout') {
            return `<button type="button" class="admin-sheet-item" data-action="logout">${icon(it.icon, { size: 18 })}<span>${it.label}</span></button>`;
          }
          const badge = it.badge ? '<span class="notif-badge" data-notif-badge hidden style="margin-inline-start:auto;"></span>' : '';
          return `<a class="admin-sheet-item ${isActive ? 'active' : ''}" href="${it.href}"${it.external ? ' target="_blank"' : ''}>${icon(it.icon, { size: 18 })}<span>${it.label}</span>${badge}</a>`;
        }).join('')}
      </div>
    </div>
  `;
}

function bindMoreSheet() {
  const btn = document.getElementById('adminMoreBtn');
  const sheet = document.getElementById('adminMoreSheet');
  const backdrop = document.getElementById('adminMoreBackdrop');
  if (!btn || !sheet || !backdrop) return;
  const close = () => {
    sheet.hidden = true;
    backdrop.hidden = true;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    sheet.hidden = false;
    backdrop.hidden = false;
    // Allow the browser to apply hidden→visible before transitioning.
    requestAnimationFrame(() => {
      sheet.classList.add('open');
      backdrop.classList.add('open');
    });
    btn.setAttribute('aria-expanded', 'true');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sheet.hidden) open(); else close();
  });
  backdrop.addEventListener('click', close);
  sheet.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  sheet.querySelectorAll('[data-action="logout"]').forEach((b) => {
    b.addEventListener('click', () => {
      clearKey();
      location.href = '/admin';
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) close();
  });
}

function bindSidebar() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', () => {
    clearKey();
    location.href = '/admin';
  });
}

async function renderDashboard(root) {
  const idx = await loadIndex(true);
  const total = (idx.weeks || []).length;
  const yearsCount = (idx.years || []).length;

  // Pull pending dispatch (if any) so we can show an approval banner on top.
  let pending = null;
  try {
    const data = await adminApi('/admin/pending-dispatch');
    pending = data.pending || null;
  } catch { /* not fatal */ }

  root.innerHTML = `
    <header class="admin-header"><h1>סקירה כללית</h1></header>

    ${pending ? `
      <div class="admin-card pending-dispatch-banner">
        <div class="pending-dispatch-icon">${icon('email', { size: 28 })}</div>
        <div class="pending-dispatch-body">
          <h3 style="margin: 0 0 4px;">העלון של פרשת ${escapeHtml(pending.parshaName || pending.slug || '')} ממתין לאישורך</h3>
          <p class="muted" style="margin: 0 0 12px;">המערכת זיהתה שהגיע המועד שקבעת לשליחה. לחץ "שלח עכשיו" כדי לשגר לכל המנויים, או "דחה" כדי לדלג על השבוע הזה.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn" type="button" id="approvePending">${icon('check', { size: 18 })} שלח עכשיו</button>
            <button class="btn btn-secondary" type="button" id="cancelPending">${icon('close', { size: 18 })} דחה לשבוע הבא</button>
          </div>
          <div id="pendingStatus" style="margin-top:12px;"></div>
        </div>
      </div>
    ` : ''}

    <div class="admin-card">
      <h2>${total} עלונים · ${yearsCount} שנים</h2>
      <p class="muted">העלאה של עלון חדש לוקחת פחות מדקה. כל שמירה נשמרת ישירות לאתר ומתפרסמת תוך כדקה.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top: 18px;">
        <a class="btn" href="/admin/upload">${icon('upload', { size: 18 })} העלאה חדשה</a>
        <a class="btn btn-secondary" href="/admin/bulletins">${icon('book', { size: 18 })} ניהול עלונים</a>
      </div>
    </div>
    <div class="admin-card">
      <h3>זרימת עבודה</h3>
      <ol class="muted" style="line-height: 1.9;">
        <li>"העלאת עלון" — גרור Word + PDF, ערוך צבעים, שמור.</li>
        <li>בדוק את העלון באתר (כפתור "צפה").</li>
        <li>השינוי נדחף אוטומטית לאתר ומופיע תוך כדקה.</li>
      </ol>
    </div>
  `;

  if (pending) {
    const approveBtn = root.querySelector('#approvePending');
    const cancelBtn = root.querySelector('#cancelPending');
    const status = root.querySelector('#pendingStatus');
    approveBtn?.addEventListener('click', async () => {
      if (!confirm(`לשלוח עכשיו את העלון של פרשת ${pending.parshaName} לכל המנויים?`)) return;
      approveBtn.disabled = true; cancelBtn.disabled = true;
      status.innerHTML = '<div class="admin-status info">שולח…</div>';
      try {
        const r = await adminApi('/admin/pending-dispatch/approve', { method: 'POST', body: {} });
        status.innerHTML = `<div class="admin-status success">נשלחו ${r.sent || 0} מיילים${r.failed ? ` · ${r.failed} נכשלו` : ''}</div>`;
        setTimeout(() => renderDashboard(root), 1500);
      } catch (e) {
        approveBtn.disabled = false; cancelBtn.disabled = false;
        status.innerHTML = `<div class="admin-status error">${e.message}</div>`;
      }
    });
    cancelBtn?.addEventListener('click', async () => {
      if (!confirm('לדחות את שליחת העלון לשבוע הבא? המערכת לא תשלח אותו השבוע.')) return;
      try {
        await adminApi('/admin/pending-dispatch/cancel', { method: 'POST', body: {} });
        showToast('נדחה');
        renderDashboard(root);
      } catch (e) { alert(e.message); }
    });
  }
}

async function renderUpload(root) {
  const idx = await loadIndex(true);
  const yearOptions = (idx.years || []).map((y) => `<option value="${y.id}">${y.displayName} (${y.id})</option>`).join('');
  const parshaOptions = buildParshaOptions();
  root.innerHTML = `
    <header class="admin-header"><h1>העלאת עלון</h1></header>
    <div class="admin-card">
      <form id="uploadForm">
        <div class="form-row">
          <div class="form-group">
            <label>שנה</label>
            <select name="yearId" required>
              <option value="">— בחר שנה —</option>
              ${yearOptions}
              <option value="__new__">+ הוסף שנה חדשה</option>
            </select>
          </div>
          <div class="form-group" id="newYearGroup" style="display:none;">
            <label>שנה חדשה (עברית, למשל תשפ״ז)</label>
            <input type="text" name="newYearHe" placeholder="תשפ״ז" />
          </div>
          <div class="form-group">
            <label>פרשה</label>
            <select name="parsha" required>
              <option value="">— בחר פרשה —</option>
              ${parshaOptions}
            </select>
          </div>
          <div class="form-group">
            <label>גליון # (אופציונלי)</label>
            <input type="number" name="issueNumber" />
          </div>
          <div class="form-group">
            <label>תאריך לתצוגה (אופציונלי)</label>
            <input type="text" name="dateLabel" placeholder="כ׳ אייר תשפ״ו" />
          </div>
        </div>
        <div class="form-group">
          <label>תיאור קצר לקלף (אופציונלי) — אפשר להדגיש מילים</label>
          <div id="teaserEditor"></div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>קובץ Word (.docx)</label>
            <div class="dropzone" id="wordDrop">
              <div class="dropzone-label">גרור קובץ Word או לחץ לבחירה</div>
              <div class="dropzone-hint">לא חובה — אם אין, רק PDF יוצג</div>
              <input type="file" name="word" accept=".docx" hidden />
            </div>
          </div>
          <div class="form-group">
            <label>קובץ PDF</label>
            <div class="dropzone" id="pdfDrop">
              <div class="dropzone-label">גרור קובץ PDF או לחץ לבחירה</div>
              <div class="dropzone-hint">PDF של העלון להצגה ולהורדה</div>
              <input type="file" name="pdf" accept=".pdf" hidden />
            </div>
          </div>
        </div>

        <div id="uploadStatus"></div>
        <button class="btn" type="submit">${icon('upload', { size: 18 })} העלה ופרסם</button>
      </form>
    </div>
  `;

  root.querySelector('select[name="yearId"]').addEventListener('change', (e) => {
    const newGroup = root.querySelector('#newYearGroup');
    newGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
  });
  setupDropzone(root.querySelector('#wordDrop'), 'docx');
  setupDropzone(root.querySelector('#pdfDrop'), 'pdf');
  const teaserEditor = mountRichEditor(root.querySelector('#teaserEditor'), '');

  root.querySelector('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = root.querySelector('#uploadStatus');
    const fd = new FormData(e.target);
    let yearId = fd.get('yearId');
    let yearDisplay;
    if (yearId === '__new__') {
      const he = (fd.get('newYearHe') || '').trim();
      if (!he) { status.innerHTML = `<div class="admin-status error">חובה למלא שם שנה חדשה</div>`; return; }
      yearId = hebrewYearToNumber(he);
      yearDisplay = he;
      // Persist the new year
      await adminApi('/admin/year', { method: 'POST', body: { id: yearId, displayName: yearDisplay } });
    } else {
      yearDisplay = idx.years.find((y) => y.id === yearId)?.displayName || numberToHebrewYear(yearId);
    }
    if (!yearId) { status.innerHTML = `<div class="admin-status error">חובה לבחור שנה</div>`; return; }
    const slug = fd.get('parsha');
    if (!slug) { status.innerHTML = `<div class="admin-status error">חובה לבחור פרשה</div>`; return; }
    const pdfFile = root.querySelector('#pdfDrop input[type=file]').files[0];
    if (!pdfFile) { status.innerHTML = `<div class="admin-status error">חסר קובץ PDF</div>`; return; }
    const wordFile = root.querySelector('#wordDrop input[type=file]').files[0] || null;

    status.innerHTML = `<div class="admin-status info">מעבד קבצים…</div>`;
    let pdfBase64, wordBase64, textHtml = '', plainText = '', headings = [], colors;
    try {
      pdfBase64 = await fileToBase64(pdfFile);
      const pdfBuf = await pdfFile.arrayBuffer();
      colors = await extractPdfPalette(pdfBuf);
      if (wordFile) {
        wordBase64 = await fileToBase64(wordFile);
        const wordBuf = await wordFile.arrayBuffer();
        const r = await convertWordToHtml(wordBuf);
        textHtml = r.html; plainText = r.plainText; headings = r.headings;
      }
    } catch (err) {
      status.innerHTML = `<div class="admin-status error">שגיאה בעיבוד הקבצים: ${err.message}</div>`;
      return;
    }

    const parshaName = PARSHIOT.find((p) => p.slug === slug)?.he || slug;
    const week = {
      yearId, yearDisplay, slug, parshaName,
      issueNumber: fd.get('issueNumber') ? parseInt(fd.get('issueNumber'), 10) : null,
      dateLabel: fd.get('dateLabel') || null,
      teaser: teaserEditor.value || null,
      publishedAt: new Date().toISOString(),
      pdfUrl: `data/bulletins/${yearId}/${slug}.pdf`,
      textHtml, plainText, headings, colors,
      styleOverrides: {},
      displayOrder: 0, // new bulletins float to top by default
    };

    status.innerHTML = `<div class="admin-status info">מעלה לאתר (כדקה)…</div>`;
    try {
      await adminApi('/admin/bulletin', { method: 'POST', body: { week, pdfBase64, wordBase64 } });
      status.innerHTML = `<div class="admin-status success">פורסם. האתר יתעדכן תוך כדקה.</div>`;
      setTimeout(() => location.href = '/admin/bulletins', 1500);
    } catch (err) {
      status.innerHTML = `<div class="admin-status error">${err.message}</div>`;
    }
  });
}

function setupDropzone(zone, type) {
  const input = zone.querySelector('input[type=file]');
  const reset = () => {
    zone.classList.remove('has-file');
    zone.innerHTML = type === 'docx'
      ? `<div class="dropzone-label">גרור קובץ Word או לחץ לבחירה</div><div class="dropzone-hint">לא חובה — אם אין, רק PDF יוצג</div>`
      : `<div class="dropzone-label">גרור קובץ PDF או לחץ לבחירה</div><div class="dropzone-hint">PDF של העלון להצגה ולהורדה</div>`;
    zone.appendChild(input);
  };
  zone.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') input.click(); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
  input.addEventListener('change', () => {
    if (!input.files.length) return reset();
    const f = input.files[0];
    zone.classList.add('has-file');
    zone.innerHTML = '';
    zone.append(input);
    const label = document.createElement('div');
    label.className = 'dropzone-filename';
    label.textContent = f.name;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'dropzone-clear';
    clear.textContent = '✕';
    clear.addEventListener('click', (ev) => {
      ev.stopPropagation();
      input.value = '';
      reset();
    });
    zone.append(label, clear);
  });
}

async function renderBulletinList(root) {
  const idx = await loadIndex(true);
  const weeks = [...(idx.weeks || [])].sort((a, b) => {
    const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 1000 + cycleOrderForSlug(a.slug);
    const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 1000 + cycleOrderForSlug(b.slug);
    return ao - bo;
  });
  const currentKey = weeks[0] ? `${weeks[0].yearId}/${weeks[0].slug}` : null;

  root.innerHTML = `
    <header class="admin-header">
      <h1>עלונים (${weeks.length})</h1>
      <a class="btn" href="/admin/upload">${icon('plus', { size: 18 })} עלון חדש</a>
    </header>
    <div class="admin-card">
      <p class="muted" style="margin-top:0;">גרור את הידית כדי לסדר. הכוכב מסמן את "העלון של השבוע" שמוצג בדף הבית. <b>בארכיון</b> הסדר נקבע תמיד לפי סדר הפרשיות הטבעי.</p>
      ${weeks.length === 0 ? '<p class="muted">עוד אין עלונים.</p>' : `
        <table class="admin-table" id="bulletinTable">
          <thead><tr><th>פרשה</th><th>שנה</th><th>גליון</th><th>תאריך</th><th></th></tr></thead>
          <tbody>
            ${weeks.map((w) => {
              const key = `${w.yearId}/${w.slug}`;
              const isCurrent = key === currentKey;
              return `
              <tr data-key="${key}">
                <td data-label="פרשה">
                  <span class="parsha-cell">
                    <span class="grip" data-drag-handle title="גרור לסדר" draggable="true">${icon('grip', { size: 16 })}</span>
                    ${isCurrent ? `<span class="star-current" title="העלון של השבוע">${icon('starFilled', { size: 16 })}</span>` : ''}
                    <b>${w.parshaName}</b>
                  </span>
                </td>
                <td data-label="שנה">${w.yearDisplay || w.yearId}</td>
                <td data-label="גליון">${w.issueNumber || ''}</td>
                <td data-label="תאריך">${w.dateLabel || ''}</td>
                <td class="row-actions">
                  ${!isCurrent ? `<button type="button" class="btn-icon star-toggle" data-make-current="${key}" title="סמן כעלון של השבוע">${icon('star', { size: 16 })}</button>` : ''}
                  <a class="btn-icon" href="/y/${w.yearId}/${w.slug}" target="_blank" title="צפה">${icon('eye', { size: 16 })}</a>
                  <a class="btn-icon" href="/admin/edit?year=${w.yearId}&slug=${w.slug}" title="ערוך">${icon('edit', { size: 16 })}</a>
                  <button type="button" class="btn-icon" data-delete="${key}" title="מחק">${icon('trash', { size: 16 })}</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
  root.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [year, slug] = btn.dataset.delete.split('/');
      if (!confirm(`למחוק את "${slug}"? לא ניתן לבטל.`)) return;
      try {
        await adminApi('/admin/bulletin', { method: 'DELETE', body: { yearId: year, slug } });
        showToast('נמחק');
        renderBulletinList(root);
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('[data-make-current]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.makeCurrent;
      const newOrder = [key, ...weeks.filter((w) => `${w.yearId}/${w.slug}` !== key).map((w) => `${w.yearId}/${w.slug}`)];
      try {
        await adminApi('/admin/reorder', { method: 'POST', body: { order: newOrder } });
        showToast('סומן כשבוע נוכחי');
        renderBulletinList(root);
      } catch (e) { alert(e.message); }
    });
  });
  bindRowDragAndDrop(root.querySelector('#bulletinTable'), async (newOrder) => {
    try {
      await adminApi('/admin/reorder', { method: 'POST', body: { order: newOrder } });
      showToast('הסדר נשמר');
      renderBulletinList(root);
    } catch (e) { alert(e.message); }
  });
}

function bindRowDragAndDrop(table, onChange) {
  if (!table) return;
  let draggedRow = null;
  table.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) { e.preventDefault(); return; }
    const tr = handle.closest('tr');
    if (!tr) return;
    draggedRow = tr;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.key || '');
  });
  table.addEventListener('dragend', () => {
    if (draggedRow) draggedRow.classList.remove('dragging');
    table.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
    draggedRow = null;
  });
  table.addEventListener('dragover', (e) => {
    if (!draggedRow) return;
    e.preventDefault();
    const tr = e.target.closest('tbody tr');
    if (!tr || tr === draggedRow) return;
    table.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
    tr.classList.add('drop-target');
    const rect = tr.getBoundingClientRect();
    const after = (e.clientY - rect.top) / rect.height > 0.5;
    if (after) tr.parentNode.insertBefore(draggedRow, tr.nextSibling);
    else tr.parentNode.insertBefore(draggedRow, tr);
  });
  table.addEventListener('drop', (e) => {
    e.preventDefault();
    table.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
    const order = [...table.querySelectorAll('tbody tr')].map((r) => r.dataset.key).filter(Boolean);
    onChange(order);
  });
}

async function renderYearsAdmin(root) {
  const idx = await loadIndex(true);
  const years = [...(idx.years || [])].sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  root.innerHTML = `
    <header class="admin-header"><h1>שנים</h1></header>
    <div class="admin-card">
      <h3>הוסף שנה</h3>
      <form id="addYearForm" class="form-row" style="align-items:end;">
        <div class="form-group">
          <label>שם בעברית (למשל תשפ״ז)</label>
          <input type="text" name="he" required />
        </div>
        <div class="form-group">
          <button class="btn" type="submit">${icon('plus', { size: 18 })} הוסף</button>
        </div>
      </form>
    </div>
    <div class="admin-card">
      <table class="admin-table">
        <thead><tr><th>שנה</th><th>מס׳</th><th>עלונים</th></tr></thead>
        <tbody>
          ${years.map((y) => `
            <tr>
              <td data-label="שנה"><b>${y.displayName}</b></td>
              <td data-label="מס׳">${y.id}</td>
              <td data-label="עלונים">${(idx.weeks || []).filter((w) => w.yearId === y.id).length}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelector('#addYearForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const he = (fd.get('he') || '').trim();
    if (!he) return;
    const id = hebrewYearToNumber(he);
    try {
      await adminApi('/admin/year', { method: 'POST', body: { id, displayName: he } });
      showToast('נוספה שנה');
      renderYearsAdmin(root);
    } catch (err) { alert(err.message); }
  });
}

async function renderSubscribers(root) {
  const cancelLoading = delayedLoading(root, 'מנויים');
  let allSubs = [];
  try {
    const data = await adminApi('/admin/subscribers');
    allSubs = data.subscribers || [];
  } catch (e) {
    cancelLoading();
    root.innerHTML = `<header class="admin-header"><h1>מנויים</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
  cancelLoading();

  // Newest first.
  allSubs.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));

  // Local UI state — rebuilt in-place via repaint().
  let state = { selectMode: false, selected: new Set(), query: '' };
  const cfg = await loadConfig();
  const apiBase = (cfg.apiBase || '').replace(/\/$/, '');

  function visible() {
    const q = state.query.trim().toLowerCase();
    if (!q) return allSubs;
    return allSubs.filter((s) => (s.email || '').toLowerCase().includes(q));
  }

  function paint() {
    const subs = visible();
    root.innerHTML = `
      <header class="admin-header">
        <h1>מנויים <span class="muted" style="font-size:1rem; font-weight:400;">(${allSubs.length})</span></h1>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${state.selectMode
            ? `<button class="btn" type="button" id="confirmRemove" ${state.selected.size === 0 ? 'disabled' : ''}>${icon('trash', { size: 18 })} הסר נבחרים (${state.selected.size})</button>
               <button class="btn btn-secondary" type="button" id="cancelSelect">ביטול</button>`
            : `<button class="btn btn-secondary" type="button" id="enterSelect">${icon('trash', { size: 18 })} הסר מנויים</button>
               <button class="btn btn-secondary" type="button" id="exportCsv">${icon('download', { size: 18 })} ייצוא CSV</button>`}
        </div>
      </header>

      <div class="admin-card">
        <h3 style="margin-top:0;">הוספת מנויים</h3>
        <p class="muted" style="margin-top:0;">הדבק כתובות מייל — מופרדות בפסיק / רווח / שורה / נקודה-פסיק. המערכת תזהה את הכתובות התקינות ותתעלם מכפילויות. בלי הגבלה.</p>
        <form id="bulkAddForm">
          <div class="form-group">
            <textarea name="emails" rows="4" placeholder="alice@example.com, bob@example.com&#10;carol@example.com" style="font-family:inherit;"></textarea>
          </div>
          <div class="form-group" style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" id="sendWelcome" name="sendWelcome" />
            <label for="sendWelcome" style="margin:0;">שלח מייל "ברוך הבא" למנויים החדשים</label>
          </div>
          <button class="btn" type="submit">${icon('plus', { size: 18 })} הוסף</button>
          <span id="addStatus" style="margin-right:14px;"></span>
        </form>
      </div>

      <div class="admin-card">
        <div class="form-group" style="margin-bottom: 14px;">
          <input type="text" id="searchInput" placeholder="חפש לפי כתובת מייל" value="${escapeHtml(state.query)}" autocomplete="off" />
        </div>
        ${allSubs.length === 0 ? '<p class="muted">עוד אין מנויים.</p>' : (subs.length === 0 ? `<p class="muted">לא נמצאו מנויים תואמים ל-"${escapeHtml(state.query)}".</p>` : `
          <table class="admin-table" id="subsTable">
            <thead>
              <tr>
                ${state.selectMode ? '<th style="width:36px;"></th>' : ''}
                <th>מייל</th><th>נרשם ב-</th><th>מקור</th><th>מיקום</th>
              </tr>
            </thead>
            <tbody>
              ${subs.map((s) => {
                const isSel = state.selected.has(s.email);
                const checkbox = state.selectMode
                  ? `<td data-label=""><input type="checkbox" class="sub-check" data-email="${escapeHtml(s.email)}" ${isSel ? 'checked' : ''} /></td>`
                  : '';
                const sourceBadge = s.source === 'admin' ? '<span class="muted">ידני</span>' : (s.source === 'public' ? 'אתר' : '—');
                return `<tr ${isSel ? 'class="row-selected"' : ''}>
                  ${checkbox}
                  <td data-label="מייל">${escapeHtml(s.email)}</td>
                  <td data-label="נרשם ב-">${(s.addedAt || '').slice(0, 10)}</td>
                  <td data-label="מקור">${sourceBadge}</td>
                  <td data-label="מיקום">${[s.city, s.country].filter(Boolean).join(' / ') || '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `)}
      </div>
    `;

    // Bind handlers.
    const enterSel = root.querySelector('#enterSelect');
    if (enterSel) enterSel.addEventListener('click', () => { state.selectMode = true; state.selected.clear(); paint(); });
    const cancelSel = root.querySelector('#cancelSelect');
    if (cancelSel) cancelSel.addEventListener('click', () => { state.selectMode = false; state.selected.clear(); paint(); });

    const exportBtn = root.querySelector('#exportCsv');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        try {
          const r = await fetch(apiBase + '/admin/subscribers/export.csv', {
            headers: { Authorization: 'Bearer ' + getKey() },
          });
          if (!r.ok) throw new Error('שגיאה בייצוא');
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `mashmaut-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } catch (e) { alert(e.message); }
        exportBtn.disabled = false;
      });
    }

    root.querySelectorAll('.sub-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const email = cb.dataset.email;
        if (cb.checked) state.selected.add(email); else state.selected.delete(email);
        paint();
      });
    });

    const confirmRm = root.querySelector('#confirmRemove');
    if (confirmRm) {
      confirmRm.addEventListener('click', async () => {
        const list = [...state.selected];
        if (!list.length) return;
        if (!confirm(`להסיר ${list.length} מנויים מהרשימה? לא יישלח עליהם מייל. הפעולה אינה הפיכה.`)) return;
        confirmRm.disabled = true;
        try {
          await adminApi('/admin/subscribers/remove', { method: 'POST', body: { emails: list } });
          showToast(`הוסרו ${list.length} מנויים`);
          // Drop from local list and reset.
          allSubs = allSubs.filter((s) => !state.selected.has(s.email));
          state.selectMode = false;
          state.selected.clear();
          paint();
        } catch (err) { alert(err.message); confirmRm.disabled = false; }
      });
    }

    const search = root.querySelector('#searchInput');
    if (search) {
      search.addEventListener('input', () => { state.query = search.value; paintTableOnly(); });
    }

    const form = root.querySelector('#bulkAddForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = root.querySelector('#addStatus');
        const fd = new FormData(e.target);
        const emails = (fd.get('emails') || '').toString();
        const sendWelcome = !!fd.get('sendWelcome');
        if (!emails.trim()) { status.innerHTML = '<span class="muted">הדבק כתובות תחילה</span>'; return; }
        status.innerHTML = '<span class="muted">מוסיף…</span>';
        try {
          const r = await adminApi('/admin/subscribers/bulk-add', { method: 'POST', body: { emails, sendWelcome } });
          const parts = [];
          if (r.added) parts.push(`נוספו ${r.added}`);
          if (r.skipped) parts.push(`${r.skipped} כבר קיימים`);
          if (r.totalCandidates && r.totalCandidates > (r.added + r.skipped)) parts.push(`${r.totalCandidates - r.added - r.skipped} כתובות לא תקינות`);
          if (sendWelcome && r.sentWelcome) parts.push(`נשלחו ${r.sentWelcome} מייליי ברוך הבא`);
          if (sendWelcome && r.welcomeFailed) parts.push(`${r.welcomeFailed} נכשלו`);
          status.innerHTML = `<span class="admin-status success" style="display:inline-block; padding:4px 10px;">${parts.join(' · ') || 'אין כתובות חדשות'}</span>`;
          // Refresh list.
          renderSubscribers(root);
        } catch (err) {
          status.innerHTML = `<span class="admin-status error" style="display:inline-block; padding:4px 10px;">${err.message}</span>`;
        }
      });
    }
  }

  // Live search re-renders only the table card (keeps focus in the input).
  function paintTableOnly() {
    const subs = visible();
    const card = root.querySelectorAll('.admin-card')[1];
    if (!card) return;
    const tableHost = card;
    const beforeInput = tableHost.querySelector('#searchInput');
    const inputValue = beforeInput ? beforeInput.value : state.query;
    const tableMarkup = allSubs.length === 0
      ? '<p class="muted">עוד אין מנויים.</p>'
      : (subs.length === 0
        ? `<p class="muted">לא נמצאו מנויים תואמים ל-"${escapeHtml(state.query)}".</p>`
        : `<table class="admin-table" id="subsTable">
            <thead>
              <tr>
                ${state.selectMode ? '<th style="width:36px;"></th>' : ''}
                <th>מייל</th><th>נרשם ב-</th><th>מקור</th><th>מיקום</th>
              </tr>
            </thead>
            <tbody>
              ${subs.map((s) => {
                const isSel = state.selected.has(s.email);
                const checkbox = state.selectMode
                  ? `<td data-label=""><input type="checkbox" class="sub-check" data-email="${escapeHtml(s.email)}" ${isSel ? 'checked' : ''} /></td>`
                  : '';
                const sourceBadge = s.source === 'admin' ? '<span class="muted">ידני</span>' : (s.source === 'public' ? 'אתר' : '—');
                return `<tr ${isSel ? 'class="row-selected"' : ''}>
                  ${checkbox}
                  <td data-label="מייל">${escapeHtml(s.email)}</td>
                  <td data-label="נרשם ב-">${(s.addedAt || '').slice(0, 10)}</td>
                  <td data-label="מקור">${sourceBadge}</td>
                  <td data-label="מיקום">${[s.city, s.country].filter(Boolean).join(' / ') || '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`);
    // Replace just the table region (everything after the search input).
    const fg = tableHost.querySelector('.form-group');
    while (fg && fg.nextElementSibling) fg.nextElementSibling.remove();
    fg.insertAdjacentHTML('afterend', tableMarkup);
    // Re-bind row checkboxes.
    root.querySelectorAll('.sub-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const email = cb.dataset.email;
        if (cb.checked) state.selected.add(email); else state.selected.delete(email);
        paint();
      });
    });
  }

  paint();
}

async function renderSettings(root) {
  const config = await loadConfig();
  const sched = config.dispatchSchedule || { enabled: true, dayOfWeek: 4, hour: 19, requireApproval: false };
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  root.innerHTML = `
    <header class="admin-header"><h1>הגדרות אתר</h1></header>

    <div class="admin-card">
      <h3 style="margin-top:0;">תזמון שליחת העלון</h3>
      <p class="muted" style="margin-top:0;">קובע מתי המערכת שולחת את העלון השבועי האחרון לכל המנויים. השעות הן בשעון ישראל. כל לחיצת "שמור" מעדכנת את לוח הזמנים מיד.</p>
      <form id="scheduleForm">
        <div class="form-group" style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" id="schedEnabled" ${sched.enabled ? 'checked' : ''} />
          <label for="schedEnabled" style="margin:0;"><b>שליחה אוטומטית מופעלת</b></label>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>יום בשבוע</label>
            <select id="schedDay">
              ${dayNames.map((n, i) => `<option value="${i}" ${sched.dayOfWeek === i ? 'selected' : ''}>יום ${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>שעה (שעון ישראל)</label>
            <select id="schedHour">
              ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${sched.hour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="display:flex; align-items:flex-start; gap:10px;">
          <input type="checkbox" id="schedApproval" ${sched.requireApproval ? 'checked' : ''} style="margin-top: 4px;" />
          <label for="schedApproval" style="margin:0;">
            <b>דרוש אישור ידני לפני השליחה</b>
            <div class="muted" style="font-weight:400; margin-top:4px;">אם מסומן, האתר יקבע את העלון לשליחה בזמן שנקבע ויחכה לאישורך בעמוד הראשי או בלשונית "התראות". בלי לחיצה על "אשר" — המייל לא יישלח.</div>
          </label>
        </div>
        <button class="btn" type="submit">${icon('check', { size: 18 })} שמור תזמון</button>
        <span id="scheduleStatus" style="margin-right:14px;"></span>
      </form>
    </div>

    <div class="admin-card">
      <h3 style="margin-top:0;">לוגו</h3>
      <p class="muted" style="margin-top:0;">תמונה (PNG / JPG / SVG) שתופיע בפינה הימנית-עליונה במקום האות "${escapeHtml((config.siteName || 'משמעות').charAt(0))}". מומלץ ריבועי, לפחות 128×128.</p>
      <div class="logo-editor">
        <div class="logo-preview" id="logoPreview">
          ${config.logo
            ? `<img src="${config.logo}" alt="לוגו נוכחי" />`
            : `<span class="logo-placeholder">${escapeHtml((config.siteName || 'משמעות').charAt(0))}</span>`}
        </div>
        <div class="logo-actions">
          <label class="btn btn-secondary" for="logoInput">${icon('upload', { size: 16 })} בחר תמונה</label>
          <input type="file" id="logoInput" accept="image/*" hidden />
          <button type="button" class="btn btn-secondary" id="logoRemove" ${config.logo ? '' : 'disabled'}>${icon('trash', { size: 16 })} הסר לוגו</button>
        </div>
        <p class="muted" id="logoStatus" style="margin: 8px 0 0; font-size: .85rem;"></p>
      </div>
    </div>

    <div class="admin-card">
      <form id="settingsForm">
        <div class="form-group">
          <label>שם האתר</label>
          <input type="text" name="siteName" value="${escapeHtml(config.siteName || 'משמעות')}" />
        </div>
        <div class="form-group">
          <label>כותרת מזמינה לקורא <span class="muted" style="font-weight:400;">(מופיעה במסך הבית מתחת ללוגו, מדגישה את המילה האחרונה)</span></label>
          <input type="text" name="heroTitle" value="${escapeHtml(config.heroTitle || '')}" placeholder="כן, גם אתה יכול להבין." />
        </div>
        <div class="form-group">
          <label>תת-כותרת מתחת לכותרת <span class="muted" style="font-weight:400;">(מקור / שם הרב)</span></label>
          <input type="text" name="tagline" value="${escapeHtml(config.tagline || '')}" placeholder="רעיונות לפרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט&quot;א" />
        </div>
        <div class="form-group">
          <label>פסקת תיאור <span class="muted" style="font-weight:400;">(מתחת לעלון השבועי, אופציונלי)</span></label>
          <textarea name="heroBlurb" rows="3" placeholder="עלון שבועי שמראה איך התורה מדברת אלינו, היום, בלי מבטא ובלי מחיצות.">${escapeHtml(config.heroBlurb || '')}</textarea>
        </div>
        <input type="hidden" name="heroSubtitle" value="${escapeHtml(config.heroSubtitle || '')}" />
        <div class="form-group">
          <label>פוטר</label>
          <input type="text" name="footer" value="${escapeHtml(config.footer || '')}" />
        </div>
        <div class="form-group">
          <label>מייל ליצירת קשר</label>
          <input type="text" name="adminEmail" value="${escapeHtml(config.adminEmail || '')}" />
        </div>
        <button class="btn" type="submit">${icon('check', { size: 18 })} שמור</button>
      </form>
    </div>
  `;

  const logoInput = root.querySelector('#logoInput');
  const logoPreview = root.querySelector('#logoPreview');
  const logoStatus = root.querySelector('#logoStatus');
  const logoRemove = root.querySelector('#logoRemove');

  logoInput.addEventListener('change', async () => {
    const f = logoInput.files[0];
    if (!f) return;
    if (f.size > 250_000) {
      logoStatus.textContent = `הקובץ גדול מדי (${Math.round(f.size / 1024)} KB). הגבלה: 250 KB.`;
      logoStatus.style.color = '#b91c1c';
      logoInput.value = '';
      return;
    }
    logoStatus.style.color = '';
    logoStatus.textContent = 'טוען…';
    try {
      const dataUrl = await fileToDataUrl(f);
      await adminApi('/admin/config', { method: 'POST', body: { logo: dataUrl } });
      patchConfig({ logo: dataUrl });
      logoPreview.innerHTML = `<img src="${dataUrl}" alt="לוגו חדש" />`;
      logoRemove.disabled = false;
      logoStatus.textContent = 'הלוגו עודכן. רענן את האתר לראות את השינוי.';
      showToast('הלוגו עודכן');
    } catch (err) {
      logoStatus.style.color = '#b91c1c';
      logoStatus.textContent = err.message || 'שגיאה';
    }
    logoInput.value = '';
  });

  logoRemove.addEventListener('click', async () => {
    if (!confirm('להסיר את הלוגו ולחזור לאות הברירת מחדל?')) return;
    logoStatus.style.color = '';
    logoStatus.textContent = 'מסיר…';
    try {
      await adminApi('/admin/config', { method: 'POST', body: { logo: null } });
      patchConfig({ logo: null });
      logoPreview.innerHTML = `<span class="logo-placeholder">${escapeHtml((config.siteName || 'משמעות').charAt(0))}</span>`;
      logoRemove.disabled = true;
      logoStatus.textContent = 'הלוגו הוסר.';
      showToast('הוסר');
    } catch (err) {
      logoStatus.style.color = '#b91c1c';
      logoStatus.textContent = err.message || 'שגיאה';
    }
  });

  root.querySelector('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = {};
    fd.forEach((v, k) => obj[k] = v);
    try {
      await adminApi('/admin/config', { method: 'POST', body: obj });
      patchConfig(obj);
      showToast('נשמר');
    } catch (err) { alert(err.message); }
  });

  root.querySelector('#scheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = root.querySelector('#scheduleStatus');
    const next = {
      enabled: root.querySelector('#schedEnabled').checked,
      dayOfWeek: parseInt(root.querySelector('#schedDay').value, 10),
      hour: parseInt(root.querySelector('#schedHour').value, 10),
      requireApproval: root.querySelector('#schedApproval').checked,
    };
    status.innerHTML = '<span class="muted">שומר…</span>';
    try {
      await adminApi('/admin/config', { method: 'POST', body: { dispatchSchedule: next } });
      // Reflect the saved values immediately on next navigation, without
      // waiting for GitHub Pages to rebuild the static config.json.
      patchConfig({ dispatchSchedule: next });
      const dayName = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][next.dayOfWeek];
      const summary = next.enabled
        ? `נקבע: יום ${dayName} ב-${String(next.hour).padStart(2, '0')}:00${next.requireApproval ? ' (עם אישור)' : ' (אוטומטי)'}`
        : 'שליחה אוטומטית כבויה';
      status.innerHTML = `<span class="admin-status success" style="display:inline-block; padding:4px 10px;">${summary}</span>`;
      showToast('התזמון עודכן');
    } catch (err) {
      status.innerHTML = `<span class="admin-status error" style="display:inline-block; padding:4px 10px;">${err.message}</span>`;
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function renderEditor(root) {
  const params = new URLSearchParams(window.location.search);
  const yearId = params.get('year');
  const slug = params.get('slug');
  if (!yearId || !slug) {
    root.innerHTML = `<p class="muted">בחר עלון לעריכה מתפריט "עלונים".</p>`;
    return;
  }
  const week = await loadBulletin(yearId, slug);
  if (!week) {
    root.innerHTML = `<p class="muted">העלון לא נמצא.</p>`;
    return;
  }
  const colors = week.colors || {};
  const styleOverrides = week.styleOverrides || {};
  const fonts = ['Assistant', 'Heebo', 'Rubik'];

  root.innerHTML = `
    <header class="admin-header">
      <h1>עריכה: פרשת ${week.parshaName}</h1>
      <div>
        <a class="btn btn-secondary" href="/y/${week.yearId}/${week.slug}" target="_blank">${icon('eye', { size: 18 })} צפה</a>
      </div>
    </header>

    <div class="admin-card">
      <h3>החלפת קבצים</h3>
      <p class="muted" style="margin-top:0;">העלאת קובץ חדש תחליף את הקיים. רענן את הדף אחרי השמירה כדי לראות את התוצאה באתר (כדקה).</p>
      <div class="form-row">
        <div class="form-group">
          <label>קובץ Word (.docx) — לטקסט מוצג</label>
          <div class="dropzone" id="newWordDrop">
            <div class="dropzone-label">${week.wordPath ? 'החלף קובץ Word' : 'הוסף קובץ Word'}</div>
            <div class="dropzone-hint">${week.wordPath ? 'יש כבר קובץ — העלאה תחליף אותו' : 'לעלון הזה אין עדיין Word'}</div>
            <input type="file" name="word" accept=".docx" hidden />
          </div>
        </div>
        <div class="form-group">
          <label>קובץ PDF</label>
          <div class="dropzone" id="newPdfDrop">
            <div class="dropzone-label">החלף PDF</div>
            <div class="dropzone-hint">העלאה תחליף את ה-PDF הנוכחי</div>
            <input type="file" name="pdf" accept=".pdf" hidden />
          </div>
        </div>
      </div>
      <div id="filesStatus"></div>
    </div>

    <div class="admin-card">
      <h3>צבעי העלון</h3>
      ${['primary', 'secondary', 'accent', 'background', 'bgEnd', 'text'].map((k) => `
        <div class="color-row">
          <label>${k}</label>
          <input type="color" class="color-swatch" data-color="${k}" value="${colors[k] || '#cccccc'}" />
          <input type="text" data-color-text="${k}" value="${colors[k] || ''}" />
        </div>
      `).join('')}
    </div>

    <div class="admin-card">
      <h3>סגנון לפי רמת כותרת</h3>
      ${['h1', 'h2', 'h3', 'p', 'blockquote'].map((tag) => {
        const o = styleOverrides[tag] || {};
        return `
          <div class="style-controls">
            <span class="style-label">${tag}</span>
            <select data-style="${tag}" data-prop="font">
              <option value="">— גופן ברירת מחדל —</option>
              ${fonts.map((f) => `<option value="${f}" ${o.font === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
            <input type="text" data-style="${tag}" data-prop="size" placeholder="גודל (1.4rem)" value="${o.size || ''}" />
            <input type="color" data-style="${tag}" data-prop="color" value="${o.color || '#1a1a1a'}" />
          </div>
        `;
      }).join('')}
    </div>

    <div class="admin-card">
      <h3>פרטי העלון</h3>
      <div class="form-row">
        <div class="form-group">
          <label>גליון #</label>
          <input type="number" data-meta="issueNumber" value="${week.issueNumber || ''}" />
        </div>
        <div class="form-group">
          <label>תאריך לתצוגה</label>
          <input type="text" data-meta="dateLabel" value="${week.dateLabel || ''}" />
        </div>
      </div>
      <div class="form-group">
        <label>תיאור קצר — אפשר להדגיש מילים</label>
        <div id="editTeaser"></div>
      </div>
    </div>

    <button class="btn" id="saveEdit">${icon('check', { size: 18 })} שמור שינויים</button>
    <span id="saveStatus" style="margin-right:14px;"></span>
  `;

  setupDropzone(root.querySelector('#newWordDrop'), 'docx');
  setupDropzone(root.querySelector('#newPdfDrop'), 'pdf');

  const teaserEditor = mountRichEditor(root.querySelector('#editTeaser'), week.teaser || '');

  root.querySelectorAll('input[data-color]').forEach((picker) => {
    const k = picker.dataset.color;
    const txt = root.querySelector(`input[data-color-text="${k}"]`);
    picker.addEventListener('input', () => { txt.value = picker.value; });
    txt.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(txt.value)) picker.value = txt.value;
    });
  });

  root.querySelector('#saveEdit').addEventListener('click', async () => {
    const status = document.getElementById('saveStatus');
    const newColors = {};
    root.querySelectorAll('input[data-color]').forEach((picker) => {
      const k = picker.dataset.color;
      const txt = root.querySelector(`input[data-color-text="${k}"]`);
      const v = (txt.value || picker.value).trim();
      if (v) newColors[k] = v;
    });
    const newOverrides = {};
    root.querySelectorAll('[data-style]').forEach((el) => {
      const tag = el.dataset.style;
      const prop = el.dataset.prop;
      newOverrides[tag] = newOverrides[tag] || {};
      const v = el.value.trim();
      if (v && !(prop === 'color' && v === '#1a1a1a' && !el.dataset.touched)) newOverrides[tag][prop] = v;
    });
    Object.keys(newOverrides).forEach((k) => { if (!Object.keys(newOverrides[k]).length) delete newOverrides[k]; });
    const meta = {};
    root.querySelectorAll('[data-meta]').forEach((el) => {
      const v = el.value.trim();
      meta[el.dataset.meta] = v || null;
    });

    const newPdf = root.querySelector('#newPdfDrop input[type=file]').files[0] || null;
    const newWord = root.querySelector('#newWordDrop input[type=file]').files[0] || null;

    status.innerHTML = '<span class="muted">שומר…</span>';
    try {
      let pdfBase64, wordBase64;
      let week2 = { ...week, ...meta, teaser: teaserEditor.value || null, colors: newColors, styleOverrides: newOverrides };
      if (newPdf) {
        pdfBase64 = await fileToBase64(newPdf);
        week2.colors = await extractPdfPalette(await newPdf.arrayBuffer());
        // Honor any user overrides over fresh extraction
        Object.assign(week2.colors, newColors);
      }
      if (newWord) {
        wordBase64 = await fileToBase64(newWord);
        const r = await convertWordToHtml(await newWord.arrayBuffer());
        week2.textHtml = r.html;
        week2.plainText = r.plainText;
        week2.headings = r.headings;
        week2.wordPath = `public/data/bulletins/${week.yearId}/${week.slug}.docx`;
      }
      await adminApi('/admin/bulletin', { method: 'POST', body: { week: week2, pdfBase64, wordBase64 } });
      status.innerHTML = '<span class="muted">נשמר. האתר יתעדכן תוך כדקה.</span>';
      showToast('נשמר');
    } catch (e) {
      status.innerHTML = `<span style="color:#b91c1c;">${e.message}</span>`;
    }
  });
}

function buildParshaOptions() {
  const ordered = [...PARSHIOT].sort((a, b) => a.cycleOrder - b.cycleOrder);
  const out = [];
  for (const p of ordered) {
    if (p.combined) {
      out.push(`<option value="${p.slug}" class="parsha-group">↳ ${p.he} (פרשיות מחוברות)</option>`);
    } else {
      out.push(`<option value="${p.slug}">${p.he}</option>`);
    }
  }
  return out.join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export { slugForHebrew };
