import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, getLatestWeek } from '../lib/store.js';
import { icon } from '../icons.js';
import { shareButtonsHtml, bindShareButtons } from '../components/shareButtons.js';
import { track } from '../lib/analytics.js';
import { setPageSeo, plainSummary } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';
import { getMostRecentPosition } from '../lib/readingPosition.js';

export async function renderHome() {
  const app = document.getElementById('app');
  const cancelLoading = delayedLoading(app);

  const [config, latest, nav] = await Promise.all([
    loadConfig(),
    getLatestWeek(),
    navHtml(),
  ]);

  // Apply latest bulletin's color palette to the page
  const colors = latest?.colors || {};
  const cssVars = colors.primary ? `style="--bulletin-primary:${colors.primary}; --bulletin-secondary:${colors.secondary || colors.accent || '#52b788'};"` : '';

  cancelLoading();

  const resume = getMostRecentPosition();
  app.innerHTML = `
    <div ${cssVars} class="fade-in">
      ${nav}
      ${resume ? renderResumePill(resume) : ''}
      ${renderSplash(config, !!latest)}
      ${latest ? renderCover(latest, config) : renderCoverEmpty()}

      ${config.heroBlurb ? `
        <section class="about-strip">
          <div class="content">
            <p class="about-blurb">${config.heroBlurb}</p>
          </div>
        </section>
      ` : ''}

      <section class="home-archive-cta">
        <div class="content">
          <a class="btn btn-secondary" href="/years">${icon('archive', { size: 18 })} <span>ארכיון השנים</span></a>
          <a class="btn btn-secondary" href="/search">${icon('search', { size: 18 })} <span>חפש בעלונים</span></a>
          <button class="btn btn-secondary" data-action="subscribe" type="button">${icon('email', { size: 18 })} <span>קבל למייל</span></button>
          <button class="btn btn-secondary" data-action="contact" type="button">${icon('email', { size: 18 })} <span>צור קשר</span></button>
        </div>
      </section>

      ${footerHtml(config)}
    </div>
  `;

  if (latest) {
    const root = app.querySelector('.cover');
    if (root) {
      const url = window.location.origin + `/y/${latest.yearId}/${latest.slug}`;
      bindShareButtons(root, { url, parshaName: latest.parshaName, year: latest.yearDisplay });
    }
  }

  // Smooth-scroll the splash arrow to the cover section.
  const scrollBtn = app.querySelector('[data-scroll-to-cover]');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = app.querySelector('.cover');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  bindNav();

  // SEO: home reflects the latest bulletin's parsha + the publication tagline.
  const siteName = config.siteName || 'משמעות';
  const homeTitle = latest
    ? `${siteName} — פרשת ${latest.parshaName} · עלון פרשת השבוע`
    : `${siteName} — עלון פרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט"א`;
  const homeDesc = latest
    ? `${siteName} — עלון פרשת השבוע. השבוע: פרשת ${latest.parshaName}${latest.issueNumber ? `, גליון ${latest.issueNumber}` : ''}. ${plainSummary(latest.teaser, 140)}`
    : `${siteName} — עלון פרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט"א. שיחות שבועיות בגובה העיניים.`;
  setPageSeo({ title: homeTitle, description: homeDesc, path: '/' });

  track('view', { slug: 'home' });
}

function renderResumePill(r) {
  const pct = Math.round((r.pct || 0) * 100);
  const url = `/y/${r.yearId}/${r.slug}`;
  return `
    <a class="resume-pill" href="${url}" aria-label="המשך לקרוא את פרשת ${r.parshaName}">
      ${icon('book', { size: 16 })}
      <span class="resume-pill-text">
        <span class="muted">המשך מאיפה שעצרת —</span>
        <b>פרשת ${r.parshaName}</b>
        <span class="resume-pill-pct">${pct}%</span>
      </span>
      ${icon('arrowLeft', { size: 14 })}
    </a>
  `;
}

function renderSplash(config, hasLatest) {
  const siteName = config.siteName || 'משמעות';
  const tagline = config.tagline || 'רעיונות לפרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט״א';
  const brand = config.logo
    ? `<img class="splash-logo" src="${config.logo}" alt="${siteName}" />`
    : `<span class="splash-wordmark">${siteName}</span>`;
  const hook = config.heroTitle ? formatHook(config.heroTitle) : '';
  return `
    <section class="splash">
      <div class="splash-decor splash-decor-a" aria-hidden="true"></div>
      <div class="splash-decor splash-decor-b" aria-hidden="true"></div>

      <div class="splash-inner">
        <div class="splash-brand">${brand}</div>
        <p class="splash-tagline">${tagline}</p>

        <div class="splash-divider" aria-hidden="true"><span></span></div>

        ${hook ? `<p class="splash-hook">${hook}</p>` : ''}

        ${hasLatest ? `
          <button type="button" class="splash-scroll" data-scroll-to-cover aria-label="גלול לעלון האחרון">
            <span>העלון האחרון</span>
            ${icon('chevronDown', { size: 22 })}
          </button>
        ` : ''}
      </div>
    </section>
  `;
}

function renderCover(week, config) {
  const url = `/y/${week.yearId}/${week.slug}`;
  const pdfPath = `/y/${week.yearId}/${week.slug}/pdf`;
  const fullUrl = window.location.origin + url;
  // Subtle "this week's edition" metadata (date + issue) — quiet, below the eyebrow.
  const editionMeta = [week.dateLabel, week.yearDisplay, week.issueNumber ? `גליון ${week.issueNumber}` : null]
    .filter(Boolean).join(' · ');
  return `
    <main class="cover">
      <p class="cover-eyebrow">
        <span class="cover-eyebrow-lead">העלון האחרון</span>
        <b class="cover-eyebrow-parsha">פרשת ${week.parshaName}</b>
      </p>
      ${editionMeta ? `<p class="cover-edition">${editionMeta}</p>` : ''}
      ${week.teaser ? `
        <h1 class="cover-headline">
          <span class="cover-quote" aria-hidden="true">״</span>
          ${week.teaser}
          <span class="cover-quote cover-quote-end" aria-hidden="true">״</span>
        </h1>
      ` : `
        <h1 class="cover-headline cover-headline-plain">פרשת ${week.parshaName}</h1>
      `}

      <div class="cover-actions">
        <a class="btn cover-cta" href="${url}">${icon('book', { size: 18 })} <span>קרא את העלון</span></a>
        <a class="btn-text cover-pdf" href="${pdfPath}">${icon('pdf', { size: 16 })} <span>פתח כ-PDF</span></a>
      </div>

      <div class="cover-share">
        ${shareButtonsHtml({ url: fullUrl, parshaName: week.parshaName, year: week.yearDisplay })}
      </div>
    </main>
  `;
}

function renderCoverEmpty() {
  return `
    <main class="cover">
      <h1 class="cover-headline cover-headline-plain">בקרוב</h1>
      <p class="muted" style="font-size:1.05rem;">העלון הראשון יעלה ממש בקרוב.</p>
    </main>
  `;
}

function formatHook(text) {
  // Emphasize the last word with a colored underline — "כן, גם אתה יכול להבין."
  // → underline on "להבין". Strip a trailing period if present so the underline
  // sits flush; we re-add the period after the span.
  const trimmed = String(text).trim();
  const trailingPunct = (trimmed.match(/[.!?״]+$/) || [''])[0];
  const stem = trimmed.slice(0, trimmed.length - trailingPunct.length);
  const words = stem.split(/\s+/);
  if (words.length < 2) return trimmed;
  const last = words.pop();
  return `${words.join(' ')} <span class="cover-hook-accent">${last}</span>${trailingPunct}`;
}
