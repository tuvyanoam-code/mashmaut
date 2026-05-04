import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, getLatestWeek } from '../lib/store.js';
import { icon } from '../icons.js';
import { shareButtonsHtml, bindShareButtons } from '../components/shareButtons.js';
import { track } from '../lib/analytics.js';

export async function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const [config, latest, nav] = await Promise.all([
    loadConfig(),
    getLatestWeek(),
    navHtml(),
  ]);

  // Apply latest bulletin's color palette to the page
  const colors = latest?.colors || {};
  const cssVars = colors.primary ? `style="--bulletin-primary:${colors.primary}; --bulletin-secondary:${colors.secondary || colors.accent || '#52b788'};"` : '';

  app.innerHTML = `
    <div ${cssVars} class="fade-in">
      ${nav}
      <header class="hero">
        <div class="hero-blob b1"></div>
        <div class="hero-blob b2"></div>
        <div class="hero-blob b3"></div>
        <div class="hero-inner">
          <div class="hero-eyebrow">${config.siteName || 'משמעות'} · עלון פרשת השבוע</div>
          <h1>${formatHeroTitle(config.heroTitle || 'כן, גם אני יכול להבין')}</h1>
          <p class="hero-subtitle">${config.heroSubtitle || ''}</p>
          ${config.heroBlurb ? `<p class="hero-blurb">${config.heroBlurb}</p>` : ''}
        </div>
      </header>

      ${latest ? renderShowcase(latest, config) : renderEmpty()}

      <section class="year-section" id="recent" style="${latest ? '' : 'display:none;'}">
        <div class="content" style="text-align:center;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a class="btn btn-secondary" href="/years">${icon('archive', { size: 18 })} ארכיון מלא</a>
          <button class="btn btn-secondary" data-action="contact" type="button">${icon('email', { size: 18 })} צור קשר</button>
        </div>
      </section>

      ${footerHtml(config)}
    </div>
  `;

  if (latest) {
    const root = app.querySelector('.showcase-card');
    if (root) {
      const url = window.location.origin + `/y/${latest.yearId}/${latest.slug}`;
      bindShareButtons(root, { url, parshaName: latest.parshaName, year: latest.yearDisplay });
    }
  }
  bindNav();
  track('view', { slug: 'home' });
}

function renderShowcase(week, config) {
  const url = `/y/${week.yearId}/${week.slug}`;
  const pdfPath = `/y/${week.yearId}/${week.slug}/pdf`;
  const fullUrl = window.location.origin + url;
  return `
    <section class="showcase">
      <div class="showcase-card">
        <div class="showcase-content">
          <div class="showcase-eyebrow">${icon('book', { size: 14 })} העלון של השבוע</div>
          <h2 class="showcase-title">פרשת ${week.parshaName}</h2>
          <p class="showcase-meta">${week.yearDisplay || ''}${week.dateLabel ? ' · ' + week.dateLabel : ''}${week.issueNumber ? ' · גליון #' + week.issueNumber : ''}</p>
          ${week.teaser ? `<p style="font-size:1.1rem;color:var(--text);max-width:560px;line-height:1.6;">${week.teaser}</p>` : ''}
          <div class="showcase-actions">
            <a class="btn" href="${url}">${icon('book', { size: 18 })} קרא עכשיו</a>
            <a class="btn btn-secondary" href="${pdfPath}">${icon('pdf', { size: 18 })} פתח כ-PDF</a>
            ${shareButtonsHtml({ url: fullUrl, parshaName: week.parshaName, year: week.yearDisplay })}
          </div>
        </div>
      </div>
    </section>
  `;
}

function formatHeroTitle(title) {
  // Highlight the LAST word for visual rhythm — "כן, גם אני יכול להבין" → emphasize "להבין"
  const words = title.split(/\s+/);
  if (words.length < 2) return title;
  const last = words.pop();
  return words.join(' ') + ' <span class="accent-word">' + last + '</span>';
}

function renderEmpty() {
  return `
    <section class="showcase">
      <div class="showcase-card center">
        <h2 class="showcase-title">בקרוב</h2>
        <p class="muted">העלון הראשון יעלה בקרוב.</p>
      </div>
    </section>
  `;
}
