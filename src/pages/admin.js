import { icon } from '../icons.js';
import { PARSHIOT, slugForHebrew, hebrewYearToNumber, numberToHebrewYear, cycleOrderForSlug } from '../lib/parshiot.js';
import { loadIndex, loadConfig, loadBulletin } from '../lib/store.js';
import { showToast } from '../components/shareButtons.js';
import { mountRichEditor } from '../components/richEditor.js';
import { renderStats } from './admin/stats.js';

const API = (path) => `http://localhost:5175${path}`;

export async function renderAdmin({ params }) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  // Check API availability — if running locally, the admin server should be up.
  const apiOk = await checkApi();

  if (!apiOk) {
    app.innerHTML = renderRemoteNotice();
    return;
  }

  const section = params?.section || 'dashboard';
  app.innerHTML = `
    <div class="admin-shell fade-in">
      ${renderSidebar(section)}
      <main class="admin-main" id="adminMain"></main>
    </div>
  `;
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

async function renderSubscribers(root) {
  const cfg = await loadConfig();
  const apiBase = (cfg.apiBase || '').replace(/\/$/, '');
  const apiKey = cfg.adminApiKey || '';
  if (!apiBase || !apiKey) {
    root.innerHTML = `<header class="admin-header"><h1>מנויים</h1></header>
      <div class="admin-card"><p>שירות האנליטיקס עוד לא מוגדר. לך ל"הגדרות" וגלה את כתובת ה-API ואת המפתח.</p></div>`;
    return;
  }
  root.innerHTML = `<header class="admin-header"><h1>מנויים</h1></header><div class="loading"><div class="spinner"></div></div>`;
  try {
    const r = await fetch(apiBase + '/admin/subscribers', { headers: { Authorization: 'Bearer ' + apiKey } });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    const subs = data.subscribers || [];
    root.innerHTML = `
      <header class="admin-header"><h1>מנויים (${subs.length})</h1></header>
      <div class="admin-card">
        ${subs.length === 0 ? '<p class="muted">עוד אין מנויים.</p>' : `
          <table class="admin-table">
            <thead><tr><th>מייל</th><th>נרשם ב-</th><th>מיקום</th></tr></thead>
            <tbody>
              ${subs.map((s) => `<tr><td>${escapeHtml(s.email)}</td><td>${(s.addedAt || '').slice(0, 10)}</td><td>${[s.city, s.country].filter(Boolean).join(' / ') || '—'}</td></tr>`).join('')}
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

async function checkApi() {
  try {
    const r = await fetch(API('/api/ping'), { method: 'GET' });
    return r.ok;
  } catch (_) {
    return false;
  }
}

function renderRemoteNotice() {
  return `
    <div class="admin-login">
      <div class="admin-login-card">
        <h2>פאנל ניהול</h2>
        <p class="muted">פאנל הניהול פועל רק כשהשרת המקומי דולק.</p>
        <ol style="text-align: right; margin: 24px 0; line-height: 1.9;">
          <li>פתח טרמינל בתיקיית הפרויקט</li>
          <li>הרץ <code>npm run admin</code></li>
          <li>הדפדפן ייפתח אוטומטית עם פאנל הניהול</li>
        </ol>
        <a class="btn btn-secondary" href="/">חזרה לאתר</a>
      </div>
    </div>
  `;
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
    </aside>
  `;
}

async function renderDashboard(root) {
  const idx = await loadIndex(true);
  const total = (idx.weeks || []).length;
  const yearsCount = (idx.years || []).length;
  root.innerHTML = `
    <header class="admin-header"><h1>סקירה כללית</h1></header>
    <div class="admin-card">
      <h2>${total} עלונים · ${yearsCount} שנים</h2>
      <p class="muted">העלאה של עלון חדש לוקחת פחות מדקה. לחץ "העלאת עלון" בצד.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top: 18px;">
        <a class="btn" href="/admin/upload">${icon('upload', { size: 18 })} העלאה חדשה</a>
        <a class="btn btn-secondary" href="/admin/bulletins">${icon('book', { size: 18 })} ניהול עלונים</a>
        <button class="btn btn-secondary" id="publishBtn">${icon('arrowLeft', { size: 18 })} פרסם עדכונים (push ל-GitHub)</button>
      </div>
      <div id="publishStatus" style="margin-top:14px;"></div>
    </div>
    <div class="admin-card">
      <h3>זרימת עבודה</h3>
      <ol class="muted" style="line-height: 1.9;">
        <li>"העלאת עלון" — גרור Word + PDF, ערוך צבעים, פרסם.</li>
        <li>בדוק את העלון באתר (טאב חדש, "צפה באתר").</li>
        <li>"פרסם עדכונים" — מעלה את השינויים לגיטהאב, האתר מתעדכן תוך כדקה.</li>
      </ol>
    </div>
  `;
  document.getElementById('publishBtn').addEventListener('click', async () => {
    const status = document.getElementById('publishStatus');
    status.innerHTML = `<div class="admin-status info">מעלה לגיטהאב…</div>`;
    try {
      const r = await fetch(API('/api/publish'), { method: 'POST' });
      const data = await r.json();
      if (data.ok) status.innerHTML = `<div class="admin-status success">פורסם בהצלחה. האתר יתעדכן תוך כדקה.</div>`;
      else status.innerHTML = `<div class="admin-status error">${data.error || 'שגיאה'}</div>`;
    } catch (e) {
      status.innerHTML = `<div class="admin-status error">${e.message}</div>`;
    }
  });
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
            <label>שנה חדשה (עברית, למשל תשפ״ו)</label>
            <input type="text" name="newYearHe" placeholder="תשפ״ו" />
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
              <div class="dropzone-hint">מקובלים .docx</div>
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
        <button class="btn" type="submit">${icon('upload', { size: 18 })} העלה ועבד</button>
      </form>
    </div>
    <div class="admin-card" id="previewCard" style="display:none;">
      <h2>תצוגה מקדימה</h2>
      <div id="previewContent"></div>
    </div>
  `;

  // Year toggle
  root.querySelector('select[name="yearId"]').addEventListener('change', (e) => {
    const newGroup = root.querySelector('#newYearGroup');
    newGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
  });

  // Setup dropzones
  setupDropzone(root.querySelector('#wordDrop'), 'docx');
  setupDropzone(root.querySelector('#pdfDrop'), 'pdf');

  // Mount the rich teaser editor
  const teaserEditor = mountRichEditor(root.querySelector('#teaserEditor'), '');

  // Auto-fill teaser from headings is in preview later
  root.querySelector('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = root.querySelector('#uploadStatus');
    const fd = new FormData(e.target);
    const yearId = fd.get('yearId') === '__new__' ? hebrewYearToNumber(fd.get('newYearHe')) : fd.get('yearId');
    const yearDisplay = fd.get('yearId') === '__new__' ? fd.get('newYearHe') : (idx.years.find((y) => y.id === yearId)?.displayName || numberToHebrewYear(yearId));
    if (!yearId) { status.innerHTML = `<div class="admin-status error">חובה לבחור שנה</div>`; return; }
    if (!fd.get('parsha')) { status.innerHTML = `<div class="admin-status error">חובה לבחור פרשה</div>`; return; }
    fd.set('yearId', yearId);
    fd.set('yearDisplay', yearDisplay);
    fd.set('teaser', teaserEditor.value);

    status.innerHTML = `<div class="admin-status info">מעבד…</div>`;
    try {
      const r = await fetch(API('/api/upload'), { method: 'POST', body: fd });
      const data = await r.json();
      if (!data.ok) {
        status.innerHTML = `<div class="admin-status error">${data.error || 'שגיאה'}</div>`;
        return;
      }
      status.innerHTML = `<div class="admin-status success">הועלה בהצלחה. עברית קבל שם slug: <b>${data.week.slug}</b></div>`;
      const card = root.querySelector('#previewCard');
      card.style.display = 'block';
      renderPreview(root.querySelector('#previewContent'), data.week);
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
      ? `<div class="dropzone-label">גרור קובץ Word או לחץ לבחירה</div><div class="dropzone-hint">מקובלים .docx</div>`
      : `<div class="dropzone-label">גרור קובץ PDF או לחץ לבחירה</div><div class="dropzone-hint">PDF של העלון להצגה ולהורדה</div>`;
    zone.appendChild(input);
  };
  zone.addEventListener('click', () => input.click());
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

function renderPreview(container, week) {
  const colors = week.colors || {};
  container.innerHTML = `
    <div class="form-row">
      <div>
        <h3>פרטים</h3>
        <p><b>פרשה:</b> ${week.parshaName}</p>
        <p><b>שנה:</b> ${week.yearDisplay}</p>
        <p><b>קישור:</b> <a href="/y/${week.yearId}/${week.slug}" target="_blank">/y/${week.yearId}/${week.slug}</a></p>
        <p><b>PDF:</b> <a href="/y/${week.yearId}/${week.slug}/pdf" target="_blank">פתח PDF</a></p>
      </div>
      <div>
        <h3>צבעים שזוהו</h3>
        ${['primary', 'secondary', 'accent', 'background', 'text'].map((k) => `
          <div class="color-row">
            <label>${k}</label>
            <div class="color-swatch" style="background:${colors[k] || '#ccc'}"></div>
            <code>${colors[k] || '—'}</code>
          </div>
        `).join('')}
      </div>
    </div>
    <p style="margin-top: 16px;"><a class="btn btn-secondary" href="/admin/edit?year=${week.yearId}&slug=${week.slug}">${icon('edit', { size: 18 })} ערוך עיצוב</a></p>
  `;
}

async function renderBulletinList(root) {
  const idx = await loadIndex(true);
  // Display by manual order if set, else parsha cycle order
  const weeks = [...(idx.weeks || [])].sort((a, b) => {
    const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 1000 + cycleOrderForSlug(a.slug);
    const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 1000 + cycleOrderForSlug(b.slug);
    return ao - bo;
  });
  // The week with the lowest displayOrder is "this week" (the one shown on home)
  const currentKey = weeks[0] ? `${weeks[0].yearId}/${weeks[0].slug}` : null;

  root.innerHTML = `
    <header class="admin-header">
      <h1>עלונים (${weeks.length})</h1>
      <a class="btn" href="/admin/upload">${icon('plus', { size: 18 })} עלון חדש</a>
    </header>
    <div class="admin-card">
      <p class="muted" style="margin-top:0;">גרור את הידית כדי לסדר. הכוכב מסמן את "העלון של השבוע" שמוצג בדף הבית. <b>בארכיון</b> הסדר תמיד נקבע לפי סדר הפרשיות הטבעי.</p>
      ${weeks.length === 0 ? '<p class="muted">עוד אין עלונים. לחץ "עלון חדש" להעלאה ראשונה.</p>' : `
        <table class="admin-table" id="bulletinTable">
          <thead><tr><th>פרשה</th><th>שנה</th><th>גליון</th><th>תאריך</th><th></th></tr></thead>
          <tbody>
            ${weeks.map((w) => {
              const key = `${w.yearId}/${w.slug}`;
              const isCurrent = key === currentKey;
              return `
              <tr data-key="${key}">
                <td>
                  <span class="parsha-cell">
                    <span class="grip" data-drag-handle title="גרור לסדר" draggable="true">${icon('grip', { size: 16 })}</span>
                    ${isCurrent ? `<span class="star-current" title="העלון של השבוע">${icon('starFilled', { size: 16 })}</span>` : ''}
                    <b>${w.parshaName}</b>
                  </span>
                </td>
                <td>${w.yearDisplay || w.yearId}</td>
                <td>${w.issueNumber || ''}</td>
                <td>${w.dateLabel || ''}</td>
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
      const r = await fetch(API('/api/bulletin'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearId: year, slug }),
      });
      const data = await r.json();
      if (data.ok) {
        showToast('נמחק');
        renderBulletinList(root);
      } else {
        alert(data.error || 'שגיאה');
      }
    });
  });
  root.querySelectorAll('[data-make-current]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.makeCurrent;
      // Move this row to the top, save order
      const newOrder = [key, ...weeks.filter((w) => `${w.yearId}/${w.slug}` !== key).map((w) => `${w.yearId}/${w.slug}`)];
      await saveOrder(newOrder);
      showToast('סומן כשבוע נוכחי');
      renderBulletinList(root);
    });
  });
  bindRowDragAndDrop(root.querySelector('#bulletinTable'), async (newOrder) => {
    await saveOrder(newOrder);
    showToast('הסדר נשמר');
    renderBulletinList(root);
  });
}

function bindRowDragAndDrop(table, onChange) {
  if (!table) return;
  let draggedRow = null;
  // Drag is initiated only on the grip handle; the rest of the row remains
  // a normal interactive surface (so action buttons receive their clicks).
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

async function saveOrder(orderKeys) {
  const r = await fetch(API('/api/reorder'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: orderKeys }),
  });
  const data = await r.json();
  if (!data.ok) alert(data.error || 'שגיאה בשמירת הסדר');
  return data.ok;
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
          <label>שם בעברית (למשל תשפ״ו)</label>
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
              <td><b>${y.displayName}</b></td>
              <td>${y.id}</td>
              <td>${(idx.weeks || []).filter((w) => w.yearId === y.id).length}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.querySelector('#addYearForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const he = fd.get('he').trim();
    const id = hebrewYearToNumber(he);
    const r = await fetch(API('/api/year'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, displayName: he }),
    });
    const data = await r.json();
    if (data.ok) renderYearsAdmin(root);
    else alert(data.error);
  });
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
          <label>מייל ליצירת קשר (מופיע בכפתור "צור קשר")</label>
          <input type="text" name="adminEmail" value="${escapeHtml(config.adminEmail || '')}" placeholder="gjlevitt@gmail.com" />
        </div>
        <div class="form-group">
          <label>כתובת ה-API (Cloudflare Worker)</label>
          <input type="text" name="apiBase" value="${escapeHtml(config.apiBase || '')}" placeholder="https://mashmaut-api.<your-subdomain>.workers.dev" />
        </div>
        <div class="form-group">
          <label>מפתח אדמין (לפאנל הניהול בלבד — לא לפרסום)</label>
          <input type="text" name="adminApiKey" value="${escapeHtml(config.adminApiKey || '')}" placeholder="sk_..." />
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
    const r = await fetch(API('/api/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
    const data = await r.json();
    if (data.ok) showToast('נשמר');
    else alert(data.error);
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
  const fonts = ['Assistant', 'Heebo', 'Frank Ruhl Libre', 'David', 'Tinos'];

  root.innerHTML = `
    <header class="admin-header">
      <h1>עריכה: פרשת ${week.parshaName}</h1>
      <div>
        <a class="btn btn-secondary" href="/y/${week.yearId}/${week.slug}" target="_blank">${icon('eye', { size: 18 })} צפה</a>
      </div>
    </header>

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
  `;

  const teaserEditor = mountRichEditor(root.querySelector('#editTeaser'), week.teaser || '');

  // Sync color picker with text input
  root.querySelectorAll('input[data-color]').forEach((picker) => {
    const k = picker.dataset.color;
    const txt = root.querySelector(`input[data-color-text="${k}"]`);
    picker.addEventListener('input', () => { txt.value = picker.value; });
    txt.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(txt.value)) picker.value = txt.value;
    });
  });

  root.querySelector('#saveEdit').addEventListener('click', async () => {
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
    // Remove empty override blocks
    Object.keys(newOverrides).forEach((k) => { if (!Object.keys(newOverrides[k]).length) delete newOverrides[k]; });
    const meta = {};
    root.querySelectorAll('[data-meta]').forEach((el) => {
      const v = el.value.trim();
      meta[el.dataset.meta] = v || null;
    });
    meta.teaser = teaserEditor.value || null;
    const r = await fetch(API('/api/bulletin'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId: week.yearId, slug: week.slug, colors: newColors, styleOverrides: newOverrides, meta }),
    });
    const data = await r.json();
    if (data.ok) showToast('נשמר');
    else alert(data.error);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildParshaOptions() {
  // Build dropdown ordered by cycle, with combined options listed under their pair.
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

export { slugForHebrew };
