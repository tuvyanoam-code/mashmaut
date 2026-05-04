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

  root.innerHTML = `<header class="admin-header"><h1>גרף שימוש</h1></header><div class="loading"><div class="spinner"></div></div>`;
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
    root.innerHTML = `
      <header class="admin-header"><h1>גרף שימוש</h1></header>
      <div class="admin-card"><p class="admin-status error">${e.message}</p></div>`;
    return;
  }

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
                <td><b>${slug}</b></td>
                <td>${vals.view || 0}</td>
                <td>${vals.pdf || 0}</td>
                <td>${vals.finish || 0}</td>
                <td>${vals.share || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<p class="muted">עוד אין נתונים.</p>'}
    </div>

    <div class="form-row">
      <div class="admin-card">
        <h3>לפי מדינה</h3>
        ${countries.length ? `
          <table class="admin-table">
            <tbody>
              ${countries.map(([c, n]) => `<tr><td>${c}</td><td>${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
      <div class="admin-card">
        <h3>ערים מובילות</h3>
        ${cities.length ? `
          <table class="admin-table">
            <tbody>
              ${cities.map(([c, n]) => `<tr><td>${c}</td><td>${n}</td></tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">עוד אין נתונים.</p>'}
      </div>
    </div>

    <div class="admin-card">
      <h3>פעולות</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn" id="sendNow">${icon('email', { size: 18 })} שלח עלון עכשיו לכל המנויים</button>
        <button type="button" class="btn btn-secondary" id="testEmail">${icon('check', { size: 18 })} שלח מייל בדיקה לעצמך</button>
      </div>
      <div id="actionStatus" style="margin-top:14px;"></div>
    </div>
  `;

  document.getElementById('refreshStats').addEventListener('click', () => renderStats(root));
  document.getElementById('sendNow').addEventListener('click', async () => {
    if (!confirm('לשלוח את העלון של השבוע לכל המנויים?')) return;
    await runAction(apiBase, apiKey, '/admin/send-now', { method: 'POST' }, 'sent');
  });
  document.getElementById('testEmail').addEventListener('click', async () => {
    await runAction(apiBase, apiKey, '/admin/test-email', { method: 'POST', body: {} }, 'בדיקה נשלחה');
  });
}

async function runAction(base, key, path, opts, successText) {
  const status = document.getElementById('actionStatus');
  status.innerHTML = `<div class="admin-status info">פועל…</div>`;
  try {
    const r = await fetch(base + path, {
      method: opts.method,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'שגיאה');
    let detail = successText;
    if (typeof data.sent === 'number') detail = `נשלחו ${data.sent} מיילים${data.failed ? `, ${data.failed} נכשלו` : ''}`;
    status.innerHTML = `<div class="admin-status success">${detail}</div>`;
  } catch (e) {
    status.innerHTML = `<div class="admin-status error">${e.message}</div>`;
  }
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
