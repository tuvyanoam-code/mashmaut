import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, getYears, loadIndex } from '../lib/store.js';
import { numberToHebrewYear } from '../lib/parshiot.js';
import { setPageSeo } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';

export async function renderYears() {
  const app = document.getElementById('app');
  const cancelLoading = delayedLoading(app);

  const [config, years, idx, nav] = await Promise.all([
    loadConfig(),
    getYears(),
    loadIndex(),
    navHtml(),
  ]);

  const counts = (idx.weeks || []).reduce((acc, w) => {
    acc[w.yearId] = (acc[w.yearId] || 0) + 1;
    return acc;
  }, {});

  const sorted = [...years].sort((a, b) =>
    (b.id || '').localeCompare(a.id || '')
  );

  cancelLoading();
  app.innerHTML = `
    <div class="fade-in">
      ${nav}
      <main class="years-page">
        <h1>ארכיון השנים</h1>
        <p class="muted">${sorted.length} שנים בארכיון</p>
        ${sorted.length === 0 ? `
          <div class="empty-state">
            <h2>עוד אין עלונים בארכיון</h2>
            <p>ברגע שעלון ראשון יעלה, הוא יופיע כאן.</p>
          </div>
        ` : `
          <div class="year-list">
            ${sorted.map((y) => `
              <a class="year-tile" href="/y/${y.id}">
                <div class="year-tile-name">${y.displayName || numberToHebrewYear(y.id)}</div>
                <div class="year-tile-count">${counts[y.id] || 0} עלונים</div>
              </a>
            `).join('')}
          </div>
        `}
      </main>
      ${footerHtml(config)}
    </div>
  `;
  bindNav();

  const totalWeeks = (idx.weeks || []).length;
  setPageSeo({
    title: 'ארכיון שנים · עלון משמעות',
    description: `הארכיון המלא של עלון משמעות — ${totalWeeks} עלוני פרשת השבוע על פני ${sorted.length} שנים.`,
    path: '/years',
  });
}
