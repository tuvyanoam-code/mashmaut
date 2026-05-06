import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, loadBulletin, pdfUrl } from '../lib/store.js';
import { shareButtonsHtml, bindShareButtons } from '../components/shareButtons.js';
import { mountReadingProgress } from '../components/readingProgress.js';
import { track } from '../lib/analytics.js';
import { icon } from '../icons.js';
import { setPageSeo, plainSummary } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';
import { getReadingPosition, clearReadingPosition } from '../lib/readingPosition.js';

export async function renderBulletin({ params }) {
  const app = document.getElementById('app');
  const cancelLoading = delayedLoading(app);

  const [config, week, nav] = await Promise.all([
    loadConfig(),
    loadBulletin(params.year, params.slug),
    navHtml(),
  ]);

  cancelLoading();
  if (!week) {
    app.innerHTML = `
      ${nav}
      <div class="page-not-found">
        <h1>העלון לא נמצא</h1>
        <p>הקישור הזה לא מוביל לעלון קיים.</p>
        <a class="btn" href="/">חזרה לדף הבית</a>
      </div>
    `;
    return;
  }

  // Build per-bulletin CSS variables
  const colors = week.colors || {};
  const styleOverrides = week.styleOverrides || {};
  const inlineStyle = `
    --bulletin-primary: ${colors.primary || '#2d6a4f'};
    --bulletin-secondary: ${colors.secondary || '#52b788'};
    --bulletin-bg-from: ${colors.background || '#faf9f6'};
    --bulletin-bg-to: ${colors.bgEnd || '#faf9f6'};
    --bulletin-text: ${colors.text || '#1a1a1a'};
  `;

  // Per-element overrides as a scoped <style> block
  const overrideCss = buildOverrideCss(styleOverrides);

  const url = window.location.origin + `/y/${week.yearId}/${week.slug}`;
  const pdfHref = `/y/${week.yearId}/${week.slug}/pdf`;
  const readMinutes = estimateReadMinutes(week.plainText, week.textHtml);

  app.innerHTML = `
    <style>${overrideCss}</style>
    <div class="bulletin-page fade-in" style="${inlineStyle}" data-week="${week.yearId}-${week.slug}">
      ${nav}
      <header class="bulletin-header">
        <div class="bulletin-header-eyebrow">פרשת השבוע · ${week.yearDisplay || ''}</div>
        <h1>פרשת <span class="parsha-word">${week.parshaName}</span></h1>
        <p class="bulletin-header-meta">
          ${week.dateLabel ? week.dateLabel : ''}${week.issueNumber ? ' · גליון #' + week.issueNumber : ''}
          ${readMinutes ? `<span class="reading-time">${icon('eye', { size: 14 })} ${readMinutes} דק׳ קריאה</span>` : ''}
        </p>
        ${week.teaser ? `<p class="bulletin-teaser">${week.teaser}</p>` : ''}
        <div class="bulletin-actions-bar">
          <a class="btn" href="${pdfHref}">${icon('pdf', { size: 18 })} פתח כ-PDF</a>
          <a class="btn btn-secondary" href="${pdfUrl(week.yearId, week.slug)}" download>${icon('download', { size: 18 })} הורד PDF</a>
        </div>
        <div class="bulletin-actions-bar">
          ${shareButtonsHtml({ url, parshaName: week.parshaName, year: week.yearDisplay })}
        </div>
      </header>

      ${week.headings && week.headings.length > 1 ? renderToc(week.headings) : ''}
      ${week.headings && week.headings.length > 1 ? renderTocMobile(week.headings) : ''}

      <article class="bulletin-body" data-bulletin-content>
        ${week.textHtml || '<p class="muted center">אין טקסט זמין לעלון זה. נסה ב-PDF.</p>'}
      </article>

      ${footerHtml(config)}
    </div>
  `;

  // Inject heading IDs so the TOC anchors work
  const article = app.querySelector('[data-bulletin-content]');
  if (article && week.headings) {
    const headings = article.querySelectorAll('h1, h2, h3');
    headings.forEach((h, i) => {
      const id = (week.headings[i] && week.headings[i].id) || `h-${i}`;
      h.id = id;
    });
  }

  bindShareButtons(app, { url, parshaName: week.parshaName, year: week.yearDisplay });

  // TOC click + active-section spy
  bindTocAndScrollSpy(app, week.headings);

  // Wire share buttons to track 'share' analytics events
  app.querySelectorAll('.share-btn').forEach((b) => {
    b.addEventListener('click', () => track('share', { slug: week.slug, year: week.yearId }));
  });

  bindNav();

  // SEO: per-bulletin title, description, canonical, og + Article JSON-LD.
  const siteName = config.siteName || 'משמעות';
  const summary = plainSummary(week.teaser || week.plainText || '', 200);
  const pageTitle = `פרשת ${week.parshaName} · ${siteName}${week.yearDisplay ? ' · ' + week.yearDisplay : ''}`;
  const pageDesc = summary || `פרשת ${week.parshaName} — עלון משמעות${week.yearDisplay ? ', ' + week.yearDisplay : ''}.`;
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `פרשת ${week.parshaName}`,
    description: summary,
    inLanguage: 'he',
    datePublished: week.publishedAt || undefined,
    dateModified: week.publishedAt || undefined,
    url: `https://alonmashmaut.org/y/${week.yearId}/${week.slug}`,
    mainEntityOfPage: `https://alonmashmaut.org/y/${week.yearId}/${week.slug}`,
    isPartOf: {
      '@type': 'PublicationIssue',
      issueNumber: week.issueNumber || undefined,
      datePublished: week.publishedAt || undefined,
      isPartOf: {
        '@type': 'Periodical',
        name: 'עלון משמעות',
        url: 'https://alonmashmaut.org/',
      },
    },
    publisher: {
      '@type': 'Organization',
      name: 'עלון משמעות',
      url: 'https://alonmashmaut.org/',
      logo: { '@type': 'ImageObject', url: 'https://alonmashmaut.org/logo.png' },
    },
  };
  setPageSeo({
    title: pageTitle,
    description: pageDesc,
    path: `/y/${week.yearId}/${week.slug}`,
    jsonLd: articleJsonLd,
  });

  track('view', { slug: week.slug, year: week.yearId });

  // Mount reading progress ring (returns a cleanup fn the router can call).
  // The ring's celebration handler also fires the 'finish' event. Pass the
  // bulletin meta so scroll position is persisted for resume-on-return.
  const meta = {
    yearId: week.yearId,
    slug: week.slug,
    parshaName: week.parshaName,
    yearDisplay: week.yearDisplay || null,
  };
  const unmountProgress = mountReadingProgress('[data-bulletin-content]', () => {
    track('finish', { slug: week.slug, year: week.yearId });
  }, meta);

  // Resume affordance — if the user already started this bulletin and didn't
  // finish, offer to jump to where they stopped. Auto-scrolling without
  // permission is jarring, so we ask first.
  const saved = getReadingPosition(week.yearId, week.slug);
  if (saved) maybeShowResumeBanner(app, week, saved);

  return unmountProgress;
}

function maybeShowResumeBanner(app, week, saved) {
  // Skip if the user is already past the saved position (e.g. they linked
  // straight to a heading anchor and Skipped past).
  setTimeout(() => {
    const pctNow = currentReadPct();
    if (pctNow !== null && pctNow >= saved.pct - 0.05) return;

    const banner = document.createElement('aside');
    banner.className = 'resume-banner';
    banner.innerHTML = `
      <div class="resume-banner-text">
        <b>עצרת באמצע פרשת ${week.parshaName}.</b>
        <span class="muted">תרצה להמשיך מאיפה שעצרת? (${Math.round(saved.pct * 100)}%)</span>
      </div>
      <div class="resume-banner-actions">
        <button type="button" class="btn resume-btn-go">המשך</button>
        <button type="button" class="btn-text resume-btn-restart">לא, מההתחלה</button>
      </div>
      <button type="button" class="resume-banner-close" aria-label="סגור">×</button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));

    let dismissed = false;
    const dismiss = (clear = false) => {
      if (dismissed) return;
      dismissed = true;
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 250);
      if (clear) clearReadingPosition(week.yearId, week.slug);
    };

    banner.querySelector('.resume-btn-go').addEventListener('click', () => {
      const article = document.querySelector('[data-bulletin-content]');
      if (article) {
        const target = Math.max(0, Math.round(article.offsetTop + article.offsetHeight * saved.pct - window.innerHeight * 0.3));
        window.scrollTo({ top: target, behavior: 'smooth' });
      }
      dismiss();
    });
    banner.querySelector('.resume-btn-restart').addEventListener('click', () => dismiss(true));
    banner.querySelector('.resume-banner-close').addEventListener('click', () => dismiss());
    // Auto-dismiss after 14 seconds if no action.
    setTimeout(() => dismiss(), 14000);
  }, 350);
}

function currentReadPct() {
  const article = document.querySelector('[data-bulletin-content]');
  if (!article) return null;
  const rect = article.getBoundingClientRect();
  const viewport = window.innerHeight;
  const scrolled = -rect.top + viewport * 0.4;
  const max = article.offsetHeight - viewport * 0.4;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, scrolled / max));
}

function renderToc(headings) {
  const items = headings.filter((h) => h.level <= 3);
  if (items.length < 2) return '';
  return `
    <aside class="bulletin-toc" aria-label="תוכן העניינים">
      <div class="bulletin-toc-title">בעלון הזה</div>
      <ul>
        ${items.map((h) => `
          <li>
            <a class="toc-link toc-h${h.level}" data-target="${h.id}" href="#${h.id}">${h.text}</a>
          </li>
        `).join('')}
      </ul>
    </aside>
  `;
}

function renderTocMobile(headings) {
  const items = headings.filter((h) => h.level <= 3);
  if (items.length < 2) return '';
  return `
    <nav class="bulletin-toc-mobile" aria-label="תוכן העניינים">
      <details>
        <summary><span class="bulletin-toc-mobile-title">פרקים בעלון</span></summary>
        <ul>
          ${items.map((h) => `
            <li>
              <a class="toc-link toc-h${h.level}" data-target="${h.id}" href="#${h.id}">${h.text}</a>
            </li>
          `).join('')}
        </ul>
      </details>
    </nav>
  `;
}

function estimateReadMinutes(plainText, htmlFallback) {
  let text = plainText || '';
  if (!text && htmlFallback) text = htmlFallback.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  const wpm = 220; // average Hebrew silent reading speed
  return Math.max(1, Math.round(words / wpm));
}

function bindTocAndScrollSpy(root, headings) {
  if (!headings || headings.length < 2) return;
  const links = root.querySelectorAll('.toc-link');
  if (!links.length) return;
  // Smooth-scroll on click. Also close the mobile dropdown if open.
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.dataset.target;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top, behavior: 'smooth' });
      const details = a.closest('.bulletin-toc-mobile details');
      if (details) details.open = false;
    });
  });
  // Highlight currently-visible heading using IntersectionObserver
  const headingEls = headings
    .map((h) => document.getElementById(h.id))
    .filter(Boolean);
  if (!headingEls.length) return;
  let activeId = headingEls[0].id;
  const setActive = (id) => {
    if (id === activeId) return;
    activeId = id;
    links.forEach((a) => a.classList.toggle('active', a.dataset.target === id));
  };
  setActive(headingEls[0].id);
  const obs = new IntersectionObserver((entries) => {
    // Find the topmost intersecting heading
    const visible = entries.filter((e) => e.isIntersecting)
      .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
  headingEls.forEach((el) => obs.observe(el));
}

function buildOverrideCss(overrides) {
  const sel = '[data-bulletin-content]';
  const rules = [];
  for (const [tag, props] of Object.entries(overrides || {})) {
    if (!props) continue;
    const decl = [];
    if (props.font) decl.push(`font-family: '${props.font}', var(--font-heading);`);
    if (props.size) decl.push(`font-size: ${props.size};`);
    if (props.color) decl.push(`color: ${props.color};`);
    if (props.weight) decl.push(`font-weight: ${props.weight};`);
    if (decl.length) rules.push(`${sel} ${tag} { ${decl.join(' ')} }`);
  }
  return rules.join('\n');
}
