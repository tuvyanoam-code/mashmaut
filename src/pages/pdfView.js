import { loadBulletin, pdfUrl } from '../lib/store.js';
import { track } from '../lib/analytics.js';
import { setPageSeo } from '../lib/seo.js';
import { markVisited } from '../lib/readingPosition.js';

// iOS / iPadOS Safari can't render PDFs inside <iframe> at the right scale —
// the document shows up zoomed-out and unreadable. Detect those devices and
// hand the file off to the browser's native PDF viewer instead.
function isIosLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPhone / iPod / iPad (legacy UA) + modern iPad-as-Mac case (Macintosh + touch).
  return /iPad|iPhone|iPod/.test(ua)
    || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

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
  setPageSeo({
    title: `פרשת ${week.parshaName} · עלון משמעות (PDF)`,
    description: `העלון של פרשת ${week.parshaName} בפורמט PDF — עלון משמעות${week.yearDisplay ? ', ' + week.yearDisplay : ''}.`,
    path: `/y/${week.yearId}/${week.slug}/pdf`,
  });
  // Mark this bulletin as the most recently visited so the home pill
  // doesn't keep offering to resume an older bulletin instead.
  markVisited({
    yearId: week.yearId,
    slug: week.slug,
    parshaName: week.parshaName,
    yearDisplay: week.yearDisplay || null,
  });
  track('pdf', { slug: week.slug, year: week.yearId });

  if (isIosLike()) {
    // iOS/iPadOS Safari can't render PDFs inline in <iframe> at the right
    // scale, so hand off to the native PDF viewer by replacing the current
    // history entry with the PDF URL. `replace` instead of `assign` keeps
    // the back button pointing at the bulletin, not at this transition page.
    location.replace(src);
    return;
  }

  // Fullscreen PDF — no custom toolbar, no top nav, no body padding.
  // The browser's native PDF UI (zoom / page / download pill) already
  // covers every action we'd put in a custom toolbar, so adding one only
  // ate viewport height and pushed the native controls below the screen.
  // To leave the bulletin page, the user hits the browser back button.
  app.innerHTML = `
    <div class="pdf-page fade-in">
      <iframe class="pdf-frame" src="${src}#view=FitH" title="עלון פרשת ${week.parshaName}"></iframe>
    </div>
  `;
  document.body.classList.add('is-pdf');
  return () => {
    document.body.classList.remove('is-pdf');
  };
}
