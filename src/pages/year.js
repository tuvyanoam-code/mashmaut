import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, getYearWeeks, getYears } from '../lib/store.js';
import { bulletinCardHtml } from '../components/bulletinCard.js';
import { numberToHebrewYear, cycleOrderForSlug } from '../lib/parshiot.js';
import { icon } from '../icons.js';
import { setPageSeo } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';

export async function renderYear({ params }) {
  const app = document.getElementById('app');
  const cancelLoading = delayedLoading(app);

  const [config, weeks, years, nav] = await Promise.all([
    loadConfig(),
    getYearWeeks(params.year),
    getYears(),
    navHtml(),
  ]);

  const yearMeta = years.find((y) => y.id === params.year) || { id: params.year, displayName: numberToHebrewYear(params.year) };
  // Archive is always sorted by parsha cycle order (not upload time)
  const sorted = [...weeks].sort((a, b) =>
    cycleOrderForSlug(a.slug) - cycleOrderForSlug(b.slug)
  );

  cancelLoading();
  app.innerHTML = `
    <div class="fade-in">
      ${nav}
      <main class="years-page">
        <a class="btn btn-ghost" href="/years" style="margin-bottom:16px;">${icon('chevronRight', { size: 18 })} כל השנים</a>
        <h1>${yearMeta.displayName}</h1>
        <p class="muted">${sorted.length} עלונים</p>
        ${sorted.length === 0 ? `
          <div class="empty-state">
            <h2>עדיין אין עלונים בשנה זו</h2>
          </div>
        ` : `
          <div class="bulletin-grid">
            ${sorted.map(bulletinCardHtml).join('')}
          </div>
        `}
      </main>
      ${footerHtml(config)}
    </div>
  `;
  bindNav();

  setPageSeo({
    title: `ארכיון ${yearMeta.displayName} · עלון משמעות`,
    description: `כל עלוני משמעות לשנת ${yearMeta.displayName} — ${sorted.length} עלוני פרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט"א.`,
    path: `/y/${params.year}`,
  });
}
