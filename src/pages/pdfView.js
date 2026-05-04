import { loadBulletin, pdfUrl } from '../lib/store.js';
import { track } from '../lib/analytics.js';
import { icon } from '../icons.js';

export async function renderPdf({ params }) {
  const app = document.getElementById('app');
  const week = await loadBulletin(params.year, params.slug);
  if (!week) {
    app.innerHTML = `
      <div class="page-not-found">
        <h1>העלון לא נמצא</h1>
        <a class="btn" href="/">חזרה לדף הבית</a>
      </div>
    `;
    return;
  }

  // Always resolve via the absolute helper — the stored `pdfUrl` is relative and
  // would be interpreted against the current page path otherwise.
  const src = pdfUrl(week.yearId, week.slug);
  document.title = `משמעות · פרשת ${week.parshaName} (PDF)`;

  app.innerHTML = `
    <div class="pdf-page fade-in">
      <header class="pdf-toolbar">
        <a class="btn-icon" href="/y/${week.yearId}/${week.slug}" aria-label="חזרה לטקסט">${icon('chevronRight', { size: 20 })}</a>
        <h1>פרשת ${week.parshaName} · ${week.yearDisplay || ''}</h1>
        <a class="btn-icon" href="${src}" download aria-label="הורד">${icon('download', { size: 20 })}</a>
      </header>
      <iframe class="pdf-frame" src="${src}#view=FitH" title="עלון פרשת ${week.parshaName}"></iframe>
    </div>
  `;
  track('pdf', { slug: week.slug, year: week.yearId });
}
