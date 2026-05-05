// Cloud-only admin panel. Talks to the Cloudflare Worker (alonmashmaut.org/admin)
// using an API key stored in localStorage. No local server required.

import { icon } from '../icons.js';
import { PARSHIOT, slugForHebrew, hebrewYearToNumber, numberToHebrewYear, cycleOrderForSlug } from '../lib/parshiot.js';
import { loadIndex, loadConfig, loadBulletin } from '../lib/store.js';
import { showToast } from '../components/shareButtons.js';
import { mountRichEditor } from '../components/richEditor.js';
import { renderStats } from './admin/stats.js';
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
  app.innerHTML = `
    <div class="admin-shell fade-in">
      ${renderSidebar(section)}
      <main class="admin-main" id="adminMain"></main>
      ${renderTabbar(section)}
    </div>
  `;
  bindSidebar();
  const main = document.getElementById('adminMain');
  switch (section) {
    case 'upload': await renderUpload(main); break;
    case 'bulletins': await renderBulletinList(main); break;
    case 'years': await renderYearsAdmin(main); break;
    case 'stats': await renderStats(main); break;
    case 'subscribers': await renderSubscribers(main); break;
    case 'settings': await renderSettings(main); break;
    case 'edit': await renderEditor(main); break;
    default: await renderDashboard(main);
  }
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
        </a>
      `).join('')}
      <div style="flex:1"></div>
      <a class="admin-nav-item" href="/" target="_blank">${icon('eye', { size: 18 })} <span>צפה באתר</span></a>
      <button type="button" class="admin-nav-item" id="logoutBtn" style="background:transparent;border:none;width:100%;text-align:right;cursor:pointer;">${icon('close', { size: 18 })} <span>התנתק</span></button>
    </aside>
  `;
}

function renderTabbar(active) {
  // 4 primary destinations on mobile. Less-frequent ones stay reachable from
  // the dashboard ("more") card or via the sidebar on tablet+ widths.
  const tabs = [
    { id: 'dashboard', label: 'ראשי', icon: 'home' },
    { id: 'upload', label: 'העלאה', icon: 'upload' },
    { id: 'bulletins', label: 'עלונים', icon: 'book' },
    { id: 'stats', label: 'שימוש', icon: 'eye' },
  ];
  return `
    <nav class="admin-tabbar" aria-label="ניווט מהיר">
      ${tabs.map((t) => `
        <a class="admin-tab ${active === t.id ? 'active' : ''}" href="/admin/${t.id === 'dashboard' ? '' : t.id}">
          ${icon(t.icon, { size: 22 })}
          <span>${t.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
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
  root.innerHTML = `
    <header class="admin-header"><h1>סקירה כללית</h1></header>
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
  root.innerHTML = `<header class="admin-header"><h1>מנויים</h1></header><div class="loading"><div class="spinner"></div></div>`;
  try {
    const data = await adminApi('/admin/subscribers');
    const subs = data.subscribers || [];
    root.innerHTML = `
      <header class="admin-header"><h1>מנויים (${subs.length})</h1></header>
      <div class="admin-card">
        ${subs.length === 0 ? '<p class="muted">עוד אין מנויים.</p>' : `
          <table class="admin-table">
            <thead><tr><th>מייל</th><th>נרשם ב-</th><th>מיקום</th></tr></thead>
            <tbody>
              ${subs.map((s) => `<tr><td data-label="מייל">${escapeHtml(s.email)}</td><td data-label="נרשם ב-">${(s.addedAt || '').slice(0, 10)}</td><td data-label="מיקום">${[s.city, s.country].filter(Boolean).join(' / ') || '—'}</td></tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<header class="admin-header"><h1>מנויים</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
  }
}

async function renderSettings(root) {
  const config = await loadConfig();
  root.innerHTML = `
    <header class="admin-header"><h1>הגדרות אתר</h1></header>
    <div class="admin-card">
      <form id="settingsForm">
        <div class="form-group">
          <label>כותרת ראשית בדף הבית</label>
          <input type="text" name="heroTitle" value="${escapeHtml(config.heroTitle)}" />
        </div>
        <div class="form-group">
          <label>תת-כותרת</label>
          <input type="text" name="heroSubtitle" value="${escapeHtml(config.heroSubtitle || '')}" />
        </div>
        <div class="form-group">
          <label>טקסט מתחת (אופציונלי)</label>
          <textarea name="heroBlurb" rows="3">${escapeHtml(config.heroBlurb || '')}</textarea>
        </div>
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
  root.querySelector('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = {};
    fd.forEach((v, k) => obj[k] = v);
    try {
      await adminApi('/admin/config', { method: 'POST', body: obj });
      showToast('נשמר');
    } catch (err) { alert(err.message); }
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
