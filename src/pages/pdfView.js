import { loadBulletin, pdfUrl } from '../lib/store.js';
import { track } from '../lib/analytics.js';
import { icon } from '../icons.js';
import { setPageSeo } from '../lib/seo.js';

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
  track('pdf', { slug: week.slug, year: week.yearId });

  if (isIosLike()) {
    // Render a thin landing screen with two clear actions so the user controls
    // navigation instead of being thrown straight into the PDF viewer.
    app.innerHTML = `
      <div class="pdf-page-ios fade-in">
        <header class="pdf-toolbar">
          <a class="btn-icon" href="/y/${week.yearId}/${week.slug}" aria-label="חזרה לטקסט">${icon('chevronRight', { size: 20 })}</a>
          <h1>פרשת ${week.parshaName}${week.yearDisplay ? ' · ' + week.yearDisplay : ''}</h1>
          <span class="btn-icon" aria-hidden="true" style="visibility:hidden"></span>
        </header>
        <div class="pdf-ios-body">
          <div class="pdf-ios-card">
            <div class="pdf-ios-icon">${icon('pdf', { size: 36 })}</div>
            <h2>עלון פרשת ${week.parshaName}</h2>
            <p class="muted">תצוגת ה-PDF באייפון/אייפד עובדת הכי טוב בכרטיסיה חדשה של Safari, עם זום מתאים אוטומטי.</p>
            <div class="pdf-ios-actions">
              <a class="btn" href="${src}" target="_blank" rel="noopener">${icon('pdf', { size: 18 })} <span>פתח את ה-PDF</span></a>
              <a class="btn btn-secondary" href="${src}" download>${icon('download', { size: 18 })} <span>הורד למכשיר</span></a>
            </div>
            <p class="muted" style="margin-top:16px;">מעדיף לקרוא בטקסט מעוצב? <a href="/y/${week.yearId}/${week.slug}">לחץ כאן</a>.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="pdf-page fade-in">
      <header class="pdf-toolbar">
        <a class="btn-icon" href="/y/${week.yearId}/${week.slug}" aria-label="חזרה לטקסט">${icon('chevronRight', { size: 20 })}</a>
        <h1>פרשת ${week.parshaName} · ${week.yearDisplay || ''}</h1>
        <a class="btn-icon" href="${src}" download aria-label="הורד">${icon('download', { size: 20 })}</a>
      </header>
      <div class="pdf-frame-wrap">
        <iframe class="pdf-frame" src="${src}#view=FitH" title="עלון פרשת ${week.parshaName}"></iframe>
      </div>
    </div>
  `;
}
