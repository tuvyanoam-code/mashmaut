// Admin analytics view. Pulls aggregated stats from the Worker /admin/stats
// endpoint using the configured admin API key.

import { icon } from '../../icons.js';
import { loadConfig } from '../../lib/store.js';

export async function renderStats(root) {
  const cfg = await loadConfig();
  const apiBase = (cfg.apiBase || '').replace(/\/$/, '');
  const apiKey = cfg.adminApiKey || '';

  if (!apiBase || !apiKey) {
    root.innerHTML = `
      <header class="admin-header"><h1>גרף שימוש</h1></header>
      <div class="admin-card">
        <p>שירות האנליטיקס עוד לא מוגדר.</p>
        <p>היכנס ל-<a href="/admin/settings">הגדרות</a>, מלא את הכתובת של ה-API ואת מפתח האדמין, ואז חזור לכאן.</p>
      </div>`;
    return;
  }

  // Don't blank up-front — keep previous section visible until data arrives.
  const t = setTimeout(() => {
    root.innerHTML = `<header class="admin-header"><h1>גרף שימוש</h1></header><div class="loading"><div class="spinner"></div></div>`;
  }, 250);
  let stats;
  try {
    const r = await fetch(apiBase + '/admin/stats', {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
    if (!r.ok) throw new Error('שגיאת חיבור ל-API');
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'שגיאה');
    stats = data;
  } catch (e) {
    clearTimeout(t);
    root.innerHTML = `
      <header class="admin-header"><h1>גרף שימוש</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }
  clearTimeout(t);

  const days = Object.keys(stats.byDay || {}).sort();
  const totals = stats.byType || {};
  const countries = Object.entries(stats.byCountry || {}).sort((a, b) => b[1] - a[1]);
  const cities = Object.entries(stats.byCity || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const slugs = Object.entries(stats.bySlug || {}).sort((a, b) => (b[1].view || 0) - (a[1].view || 0));

  root.innerHTML = `
    <header class="admin-header">
      <h1>גרף שימוש</h1>
      <button type="button" class="btn btn-secondary" id="refreshStats">${icon('settings', { size: 18 })} רענן</button>
    </header>

    <div class="stats-grid">
      ${statCard('סה״כ צפיות', totals.view || 0, 'view')}
      ${statCard('צפיות ב-PDF', totals.pdf || 0, 'pdf')}
      ${statCard('סיומי קריאה', totals.finish || 0, 'finish')}
      ${statCard('שיתופים', totals.share || 0, 'share')}
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
        <table class="admin-table">
          <thead><tr><th>עלון</th><th>צפיות</th><th>PDF</th><th>סיומי קריאה</th><th>שיתופים</th></tr></thead>
          <tbody>
            ${slugs.map(([slug, vals]) => `
              <tr>
                <td data-label="עלון"><b>${slug}</b></td>
                <td data-label="צפיות">${vals.view || 0}</td>
                <td data-label="PDF">${vals.pdf || 0}</td>
                <td data-label="סיומי קריאה">${vals.finish || 0}</td>
                <td data-label="שיתופים">${vals.share || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<p class="muted">עוד אין נתונים.</p>'}
    </div>

    <p class="muted" style="font-size:.85rem; margin: -6px 0 14px; line-height:1.5;">
      <b>הערה על מדינה/עיר:</b> משתמשים שמפעילים iCloud Private Relay של אפל (אייפון/מק) או VPN
      יוצגו לפי שרת המעבר של ספק הפרטיות, לא לפי מיקומם האמיתי — לכן כניסות מאייפון לעיתים מופיעות
      כ"ארה״ב / ניו-יורק" או "Cloudflare". המספרים הכלליים (צפיות, סיומים, שיתופים) אמינים, רק
      ההצגה הגיאוגרפית מטעה במכשירים האלה.
    </p>

    <div class="form-row">
      <div class="admin-card">
        <h3>לפי מדינה</h3>
        ${countries.length ? `
          <table class="admin-table">
            <tbody>
              ${countries.map(([c, n]) => `<tr><td data-label="מדינה">${c}</td><td data-label="מספר">${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
      <div class="admin-card">
        <h3>ערים מובילות</h3>
        ${cities.length ? `
          <table class="admin-table">
            <tbody>
              ${cities.map(([c, n]) => `<tr><td data-label="עיר">${c}</td><td data-label="מספר">${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
    </div>

    <div class="admin-card" style="border-color: #f3d9d9;">
      <h3 style="color: #b91c1c;">איפוס נתוני שימוש</h3>
      <p class="muted" style="margin-top:0;">מוחק את כל מוני הצפיות, סיומי הקריאה, השיתופים, וזיהויי הדפדפנים. הפעולה <b>אינה הפיכה</b>. ההתראות, רשימת המנויים, התזמון, וההגדרות נשמרים.</p>
      <button type="button" class="btn btn-secondary" id="resetStats">${icon('trash', { size: 18 })} אפס נתוני שימוש</button>
      <div id="resetStatus" style="margin-top:14px;"></div>
    </div>
  `;

  document.getElementById('refreshStats').addEventListener('click', () => renderStats(root));
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
      const r = await fetch(apiBase + '/admin/stats/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'שגיאה');
      status.innerHTML = `<div class="admin-status success">נמחקו ${data.deleted} רשומות. הגרף יתאפס מיד.</div>`;
      setTimeout(() => renderStats(root), 1200);
    } catch (e) {
      status.innerHTML = `<div class="admin-status error">${e.message}</div>`;
    }
  });
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
  // Show last 30 days
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
  // Last 30 days, summed per day, as an SVG sparkline.
  const recent = days.slice(-30);
  const totals = recent.map((d) => {
    const r = byDay[d] || {};
    return (r.view || 0) + (r.pdf || 0) + (r.finish || 0) + (r.share || 0);
  });
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const total30 = sum(totals);
  const total7 = sum(totals.slice(-7));
  const totalToday = totals[totals.length - 1] || 0;

  const W = 320; // viewBox width — scales to container
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
