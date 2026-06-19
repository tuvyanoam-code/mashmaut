// Admin analytics view. Pulls aggregated stats from the Worker /admin/stats
// endpoint. Includes a "היסטוריה" modal listing archived snapshots that can
// be downloaded as CSV.

import { icon } from '../../icons.js';
import { adminCall, adminDownload } from '../../lib/adminApi.js';
import { applyShowMore } from '../../lib/showMore.js';

export async function renderStats(root) {
  // Don't blank up-front — keep previous section visible until data arrives.
  const t = setTimeout(() => {
    root.innerHTML = `<header class="admin-header"><h1>גרף שימוש</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, 250);
  let stats;
  try {
    stats = await adminCall('/admin/stats');
  } catch (e) {
    clearTimeout(t);
    root.innerHTML = `
      <header class="admin-header"><h1>גרף שימוש</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
  clearTimeout(t);

  // Email-open tracking is non-critical — never let it block the dashboard.
  let opens = { bulletins: [], totalOpened: 0 };
  try { opens = await adminCall('/admin/opens'); } catch (_) { /* best-effort */ }

  const days = Object.keys(stats.byDay || {}).sort();
  const totals = stats.byType || {};
  const countries = Object.entries(stats.byCountry || {}).sort((a, b) => b[1] - a[1]);
  const cities = Object.entries(stats.byCity || {}).sort((a, b) => b[1] - a[1]);
  const slugs = Object.entries(stats.bySlug || {}).sort((a, b) => (b[1].view || 0) - (a[1].view || 0));

  // Hero summary: this-week activity at a glance.
  const last7 = days.slice(-7);
  const last7Total = last7.reduce((s, d) => {
    const r = stats.byDay[d] || {};
    return s + (r.view || 0) + (r.pdf || 0);
  }, 0);
  const last7Finishes = last7.reduce((s, d) => s + ((stats.byDay[d] || {}).finish || 0), 0);

  root.innerHTML = `
    <header class="admin-header">
      <h1>גרף שימוש</h1>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn btn-secondary" id="historyBtn">${icon('archive', { size: 18 })} היסטוריה</button>
        <button type="button" class="btn btn-secondary" id="refreshStats">${icon('settings', { size: 18 })} רענן</button>
      </div>
    </header>

    <div class="admin-hero">
      <div class="admin-hero-content">
        <div class="admin-hero-eyebrow">השבוע האחרון</div>
        <h2 class="admin-hero-title">${last7Total.toLocaleString('he-IL')} ${last7Total === 1 ? 'צפייה' : 'צפיות'} ב-7 הימים האחרונים${last7Finishes ? ` · ${last7Finishes} השלימו קריאה` : ''}</h2>
        <p class="admin-hero-sub">סה״כ ${(stats.unique || 0).toLocaleString('he-IL')} דפדפנים ייחודיים מאז האיפוס האחרון. לפירוט מלא ראה למטה.</p>
      </div>
      <div class="admin-hero-meta">
        <div class="admin-hero-stat">
          <div class="admin-hero-stat-value">${(stats.returning || 0).toLocaleString('he-IL')}</div>
          <div class="admin-hero-stat-label">חוזרים</div>
        </div>
      </div>
    </div>

    <h2 class="admin-section-eyebrow">פירוט</h2>

    <div class="stats-grid">
      ${statCard('סה״כ צפיות', totals.view || 0, 'view')}
      ${statCard('צפיות ב-PDF', totals.pdf || 0, 'pdf')}
      ${statCard('סיומי קריאה', totals.finish || 0, 'finish')}
      ${statCard('שיתופים', totals.share || 0, 'share')}
      ${statCard('פתיחות מייל', opens.totalOpened || 0, 'open')}
      ${statCard('דפדפנים ייחודיים', stats.unique || 0, 'unique')}
      ${statCard('דפדפנים חוזרים', stats.returning || 0, 'returning')}
    </div>

    <div class="admin-card">
      <h3>פעילות יומית</h3>
      ${renderDailyChart(days, stats.byDay)}
    </div>

    <div class="admin-card">
      <h3>פירוט לפי עלון</h3>
      ${slugs.length ? `
        <table class="admin-table" id="slugTable">
          <thead><tr><th>עלון</th><th>צפיות</th><th>PDF</th><th>סיומי קריאה</th><th>שיתופים</th></tr></thead>
          <tbody data-show-more-target="slugs">
            ${slugs.map(([slug, vals]) => `
              <tr>
                <td data-label="עלון"><b>${escapeHtml(slug)}</b></td>
                <td data-label="צפיות">${vals.view || 0}</td>
                <td data-label="PDF">${vals.pdf || 0}</td>
                <td data-label="סיומי קריאה">${vals.finish || 0}</td>
                <td data-label="שיתופים">${vals.share || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<p class="muted">עוד אין נתונים.</p>'}
    </div>

    <div class="admin-card">
      <h3>פתיחות מייל — מי קרא את העלון</h3>
      ${renderOpens(opens.bulletins || [])}
      <p class="muted" style="font-size:.82rem; margin: 14px 0 0; line-height:1.5;">
        <b>חשוב לדעת:</b> מעקב פתיחות הוא <b>כיווני, לא מדויק</b> (כך בכל מערכת דיוור).
        אפל מייל (Mail Privacy Protection) טוען את פיקסל המעקב אוטומטית כשהמייל מגיע — גם בלי פתיחה אמיתית — ולכן <b>מנפח</b> את המספר;
        ג׳ימייל טוען דרך פרוקסי שמקשש את התמונה, אז פתיחה חוזרת של אותו אדם לרוב לא נספרת;
        ומי שקורא בלי תמונות לא נספר כלל. קרא את המספרים כ״בערך כמה / אילו כתובות התעניינו״.
      </p>
    </div>

    <p class="muted" style="font-size:.85rem; margin: -6px 0 14px; line-height:1.5;">
      <b>הערה על מדינה/עיר:</b> משתמשים שמפעילים iCloud Private Relay של אפל (אייפון/מק) או VPN
      יוצגו לפי שרת המעבר של ספק הפרטיות, לא לפי מיקומם האמיתי. המספרים הכלליים אמינים, רק
      ההצגה הגיאוגרפית מטעה במכשירים האלה.
    </p>

    <div class="form-row">
      <div class="admin-card">
        <h3>לפי מדינה</h3>
        ${countries.length ? `
          <table class="admin-table">
            <tbody data-show-more-target="countries">
              ${countries.map(([c, n]) => `<tr><td data-label="מדינה">${escapeHtml(c)}</td><td data-label="מספר">${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
      <div class="admin-card">
        <h3>ערים מובילות</h3>
        ${cities.length ? `
          <table class="admin-table">
            <tbody data-show-more-target="cities">
              ${cities.map(([c, n]) => `<tr><td data-label="עיר">${escapeHtml(c)}</td><td data-label="מספר">${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
    </div>

    <div class="admin-card" style="border-color: #f3d9d9;">
      <h3 style="color: #b91c1c;">איפוס נתוני שימוש</h3>
      <p class="muted" style="margin-top:0;">מוחק את כל מוני הצפיות, סיומי הקריאה, השיתופים, וזיהויי הדפדפנים. הפעולה <b>אינה הפיכה</b>. ההתראות, רשימת המנויים, התזמון, וההגדרות נשמרים. אם הוגדר ארכוב אוטומטי בהגדרות, הנתונים נשמרים בארכיון לפני האיפוס האוטומטי.</p>
      <button type="button" class="btn btn-secondary" id="resetStats">${icon('trash', { size: 18 })} אפס נתוני שימוש</button>
      <div id="resetStatus" style="margin-top:14px;"></div>
    </div>
  `;

  // Apply "הצג עוד" — first 4, button to expand.
  for (const sel of ['slugs', 'countries', 'cities']) {
    const tbody = root.querySelector(`[data-show-more-target="${sel}"]`);
    if (tbody) applyShowMore(tbody, { initial: 4, after: tbody.parentElement });
  }

  document.getElementById('refreshStats').addEventListener('click', () => renderStats(root));
  document.getElementById('historyBtn').addEventListener('click', () => openHistoryModal());

  document.getElementById('resetStats').addEventListener('click', async () => {
    const status = document.getElementById('resetStatus');
    const ack = prompt('כדי לאפס את כל נתוני השימוש (לא ניתן לבטל), הקלד "אפס" ולחץ אישור.');
    if (ack === null) return;
    if ((ack || '').trim() !== 'אפס') {
      status.innerHTML = '<div class="admin-status error">בוטל — לא הוקלד "אפס".</div>';
      return;
    }
    status.innerHTML = '<div class="admin-status info">מאפס…</div>';
    try {
      const data = await adminCall('/admin/stats/reset', { method: 'POST', body: {} });
      status.innerHTML = `<div class="admin-status success">נמחקו ${data.deleted} רשומות. הגרף יתאפס מיד.</div>`;
      setTimeout(() => renderStats(root), 1200);
    } catch (e) {
      status.innerHTML = `<div class="admin-status error">${e.message}</div>`;
    }
  });
}

async function openHistoryModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay history-overlay';
  overlay.innerHTML = `
    <div class="modal history-modal" role="dialog" aria-modal="true" aria-label="היסטוריית ארכיון נתוני שימוש">
      <button type="button" class="modal-close" aria-label="סגור">${icon('close', { size: 20 })}</button>
      <h3 style="margin: 0 0 6px;">היסטוריית נתוני שימוש</h3>
      <p class="muted" style="margin: 0 0 18px;">בכל סוף תקופה (כברירת מחדל: שבוע) הנתונים מתאפסים אוטומטית, ונשמר ארכיון CSV הניתן להורדה.</p>
      <div data-history-content><div class="loading"><div class="spinner"></div></div></div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-close').addEventListener('click', close);

  const content = overlay.querySelector('[data-history-content]');
  let archives;
  try {
    const data = await adminCall('/admin/stats/archives');
    archives = data.archives || [];
  } catch (e) {
    content.innerHTML = `<p class="admin-status error">${e.message}</p>`;
    return;
  }
  if (archives.length === 0) {
    content.innerHTML = `<p class="muted" style="text-align:center; padding: 16px 8px;">עוד אין ארכיונים. הראשון יווצר בסוף התקופה.</p>`;
    return;
  }
  content.innerHTML = `
    <ul class="history-list" id="historyList">
      ${archives.map((a) => `
        <li class="history-item">
          <div class="history-meta">
            <div class="history-range"><b>${formatRange(a.periodStart, a.periodEnd)}</b></div>
            <div class="history-size muted">${(a.sizeBytes / 1024).toFixed(1)} KB</div>
          </div>
          <div class="history-actions">
            <button type="button" class="btn btn-secondary" data-download data-id="${escapeAttr(a.id)}">${icon('download', { size: 16 })} הורד CSV</button>
            <button type="button" class="btn-text" data-del data-id="${escapeAttr(a.id)}">${icon('trash', { size: 14 })} מחק</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
  const historyList = content.querySelector('#historyList');
  if (historyList) applyShowMore(historyList, { initial: 4, after: historyList });
  content.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        // Pre-derive a meaningful filename from the archive id (an ISO
        // timestamp). Used only if the server's Content-Disposition header
        // isn't visible to JS — which happens if Access-Control-Expose-
        // Headers wasn't sent or got cached. This way the user always
        // gets `mashmaut-stats-<date>.csv`, never `download.bin`.
        const id = btn.dataset.id;
        const fallbackName = `mashmaut-stats-${(id || '').slice(0, 10)}.csv`;
        await adminDownload('/admin/stats/archives/' + encodeURIComponent(id), fallbackName);
      } catch (e) {
        alert(e.message || 'שגיאה');
      } finally {
        btn.disabled = false;
      }
    });
  });
  content.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('למחוק את הארכיון?')) return;
      btn.disabled = true;
      try {
        await adminCall('/admin/stats/archives/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
        // Re-render the modal content.
        close();
        openHistoryModal();
      } catch (e) {
        btn.disabled = false;
        alert(e.message || 'שגיאה');
      }
    });
  });
}

function formatRange(start, end) {
  const s = (start || '').slice(0, 10);
  const e = (end || '').slice(0, 10);
  if (!s && !e) return '';
  return s + ' → ' + e;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('he-IL', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// One collapsible row per bulletin: summary shows open count (and open-rate
// vs. how many were sent), expanding to the list of addresses that opened.
function renderOpens(bulletins) {
  if (!bulletins.length) {
    return '<p class="muted">עדיין אין פתיחות שנרשמו. פתיחות יתחילו להופיע אחרי השליחה הבאה של העלון.</p>';
  }
  return bulletins.map((b) => {
    const title = `פרשת ${escapeHtml(b.parshaName)} · ${escapeHtml(b.yearDisplay || b.year)}`;
    const rate = b.openRate != null ? ` (${b.openRate}%)` : '';
    const summary = b.sent
      ? `נפתח ע״י ${b.opened.toLocaleString('he-IL')} מתוך ${b.sent.toLocaleString('he-IL')} שנשלחו${rate}`
      : `נפתח ע״י ${b.opened.toLocaleString('he-IL')}`;
    return `
      <details class="open-bulletin" style="border:1px solid var(--line,#ece6d8); border-radius:12px; padding:10px 14px; margin-bottom:10px;">
        <summary style="cursor:pointer; display:flex; justify-content:space-between; gap:12px; align-items:center; font-weight:600;">
          <span>${title}</span>
          <span class="muted" style="font-weight:500; font-size:.9rem;">${summary}</span>
        </summary>
        <div style="max-height:320px; overflow:auto; margin-top:10px;">
          <table class="admin-table">
            <thead><tr><th>כתובת</th><th>פתיחה אחרונה</th><th>פעמים</th></tr></thead>
            <tbody>
              ${b.openers.map((o) => `
                <tr>
                  <td data-label="כתובת">${escapeHtml(o.email)}</td>
                  <td data-label="פתיחה אחרונה">${fmtDateTime(o.lastOpen)}</td>
                  <td data-label="פעמים">${(o.count || 1).toLocaleString('he-IL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }).join('');
}

function statCard(label, value, type) {
  return `
    <div class="stat-card">
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-value">${value.toLocaleString('he-IL')}</div>
    </div>
  `;
}

function renderDailyChart(days, byDay) {
  if (!days.length) return '<p class="muted">עוד אין נתונים.</p>';
  return `
    <div class="chart-mobile">${renderSparkline(days, byDay)}</div>
    <div class="chart-desktop">${renderBarChart(days, byDay)}</div>
  `;
}

function renderBarChart(days, byDay) {
  const recent = days.slice(-30);
  const series = ['view', 'pdf', 'finish', 'share'];
  const colors = { view: '#2d6a4f', pdf: '#52b788', finish: '#ff8b5a', share: '#ff7ab6' };
  const max = Math.max(1, ...recent.map((d) => Math.max(...series.map((s) => byDay[d]?.[s] || 0))));
  const seriesNames = { view: 'צפיות', pdf: 'PDF', finish: 'סיומים', share: 'שיתופים' };
  return `
    <div class="chart">
      <div class="chart-bars">
        ${recent.map((d) => `
          <div class="chart-day" title="${d}">
            <div class="chart-stack">
              ${series.map((s) => {
                const v = byDay[d]?.[s] || 0;
                const h = Math.round((v / max) * 100);
                return v ? `<div class="chart-bar" style="height:${h}%;background:${colors[s]};" title="${seriesNames[s]}: ${v}"></div>` : '';
              }).join('')}
            </div>
            <div class="chart-label">${d.slice(5)}</div>
          </div>
        `).join('')}
      </div>
      <div class="chart-legend">
        ${series.map((s) => `<span><i style="background:${colors[s]}"></i> ${seriesNames[s]}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderSparkline(days, byDay) {
  const recent = days.slice(-30);
  const totals = recent.map((d) => {
    const r = byDay[d] || {};
    return (r.view || 0) + (r.pdf || 0) + (r.finish || 0) + (r.share || 0);
  });
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const total30 = sum(totals);
  const total7 = sum(totals.slice(-7));
  const totalToday = totals[totals.length - 1] || 0;

  const W = 320;
  const H = 70;
  const max = Math.max(1, ...totals);
  const stepX = recent.length > 1 ? W / (recent.length - 1) : W;
  const points = totals.map((v, i) => {
    const x = i * stepX;
    const y = H - 4 - (v / max) * (H - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = recent.length
    ? `M 0,${H} L ${points.join(' L ')} L ${W},${H} Z`
    : '';

  return `
    <div class="spark-wrap">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="פעילות 30 יום">
        <path d="${areaPath}" fill="color-mix(in srgb, var(--accent) 14%, transparent)"></path>
        <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      <div class="spark-kpis">
        <div class="spark-kpi"><div class="spark-kpi-label">היום</div><div class="spark-kpi-value">${totalToday.toLocaleString('he-IL')}</div></div>
        <div class="spark-kpi"><div class="spark-kpi-label">7 ימים</div><div class="spark-kpi-value">${total7.toLocaleString('he-IL')}</div></div>
        <div class="spark-kpi"><div class="spark-kpi-label">30 יום</div><div class="spark-kpi-value">${total30.toLocaleString('he-IL')}</div></div>
      </div>
    </div>
  `;
}
