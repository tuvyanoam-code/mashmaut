import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, loadBulletin, pdfUrl } from '../lib/store.js';
import { shareButtonsHtml, bindShareButtons } from '../components/shareButtons.js';
import { mountReadingProgress } from '../components/readingProgress.js';
import { track } from '../lib/analytics.js';
import { icon } from '../icons.js';
import { setPageSeo, plainSummary } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';
import { getReadingPosition, clearReadingPosition, markVisited } from '../lib/readingPosition.js';
import { getLikeState, toggleLike } from '../lib/likes.js';
import { mountThreadList } from '../components/threadList.js';

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
        <div class="bulletin-header-eyebrow">פרשת השבוע${week.yearDisplay ? ' · ' + week.yearDisplay : ''}</div>
        <h1>פרשת <span class="parsha-word">${week.parshaName}</span></h1>
        ${week.teaser ? `<p class="bulletin-teaser">${week.teaser}</p>` : ''}
        <div class="bulletin-actions-bar">
          <div class="bh-meta">
            ${week.dateLabel ? `<span>${week.dateLabel}</span>` : ''}
            ${week.issueNumber ? `<span class="meta-dot" aria-hidden="true">·</span><span><span class="meta-md">גליון </span><span class="meta-sm">#</span>${week.issueNumber}</span>` : ''}
            ${readMinutes ? `<span class="meta-dot" aria-hidden="true">·</span><span class="reading-time">${icon('eye', { size: 13 })} ${readMinutes} דק׳<span class="meta-lg"> קריאה</span></span>` : ''}
            <span class="meta-dot meta-likes-dot" aria-hidden="true" data-likes-dot hidden>·</span>
            <span class="likes-bubble" data-likes-bubble hidden>
              <span class="likes-bubble-icon" aria-hidden="true">${icon('heartFilled', { size: 13 })}</span>
              <b data-likes-count>0</b>
            </span>
            ${config.commentsEnabled === false ? '' : `
              <span class="meta-dot meta-discuss-dot" aria-hidden="true" data-discuss-dot hidden>·</span>
              <a class="bh-discuss" href="#threadList" data-discuss-jump hidden>
                ${icon('dialog', { size: 14 })}
                <span class="meta-md">שיחות</span>
                <b data-discuss-count></b>
              </a>
            `}
          </div>
          <a class="bh-action bh-action--pdf" href="${pdfHref}" aria-label="פתח כ-PDF">${icon('fileBlank', { size: 16 })} <span class="meta-sm-up">PDF</span></a>
        </div>
      </header>

      ${week.headings && week.headings.length > 1 ? renderToc(week.headings) : ''}
      ${week.headings && week.headings.length > 1 ? renderTocMobile(week.headings) : ''}

      <article class="bulletin-body" data-bulletin-content>
        ${week.textHtml || '<p class="muted center">אין טקסט זמין לעלון זה. נסה ב-PDF.</p>'}
      </article>

      <section class="bulletin-end" aria-label="סוף העלון">
        <button type="button" class="like-btn" data-like-btn aria-pressed="false">
          <span class="like-btn-heart" data-like-icon>${icon('heart', { size: 22 })}</span>
          <span class="like-btn-label">אהבתי</span>
          <span class="like-btn-count" data-likes-count-bottom></span>
        </button>
        <div class="share-cta">
          <p class="share-cta-line">נהנת מהקריאה? שתף עם חבר —</p>
          ${shareButtonsHtml({ url, parshaName: week.parshaName, year: week.yearDisplay })}
        </div>
      </section>

      ${config.commentsEnabled === false ? '' : `<div id="threadList" class="bulletin-threadlist-mount"></div>`}

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
  // Mark this bulletin as the most recently visited — the home pill uses
  // this to decide which bulletin's resume to offer (so jumping into a PDF-
  // only bulletin doesn't leave the home pill stuck on an older one).
  markVisited(meta);
  const unmountProgress = mountReadingProgress('[data-bulletin-content]', () => {
    track('finish', { slug: week.slug, year: week.yearId });
  }, meta);

  // Resume affordance — if the user already started this bulletin and didn't
  // finish, offer to jump to where they stopped. Auto-scrolling without
  // permission is jarring, so we ask first.
  const saved = getReadingPosition(week.yearId, week.slug);
  if (saved) maybeShowResumeBanner(app, week, saved);

  // Likes — fetch state in the background, hydrate the top bubble + bottom
  // button. Click toggles with optimistic UI.
  bindLikes(app, week);

  // Thread list — small, minimalist preview of existing discussions + a
  // "התחל שיחה" link. Full conversation lives on its own page (/discuss/...).
  // The mount also feeds back the thread count to the action-row "שיחות" item.
  let unmountThreadList = () => {};
  if (config.commentsEnabled !== false) {
    bindDiscussJump(app);
    const mount = app.querySelector('#threadList');
    if (mount) {
      unmountThreadList = mountThreadList(mount, {
        yearId: week.yearId, slug: week.slug, parshaName: week.parshaName,
        onCount: (n) => updateDiscussCount(app, n),
      });
    }
  }

  return () => {
    try { unmountProgress && unmountProgress(); } catch (_) {}
    try { unmountThreadList && unmountThreadList(); } catch (_) {}
  };
}

function bindLikes(app, week) {
  const bubble = app.querySelector('[data-likes-bubble]');
  const likesDot = app.querySelector('[data-likes-dot]');
  const countTop = app.querySelector('[data-likes-count]');
  const button = app.querySelector('[data-like-btn]');
  const iconHost = app.querySelector('[data-like-icon]');
  const countBottom = app.querySelector('[data-likes-count-bottom]');
  if (!button) return;

  const renderState = (count, liked) => {
    button.classList.toggle('liked', liked);
    button.setAttribute('aria-pressed', liked ? 'true' : 'false');
    if (iconHost) iconHost.innerHTML = icon(liked ? 'heartFilled' : 'heart', { size: 22 });
    if (countBottom) countBottom.textContent = count > 0 ? String(count) : '';
    if (countTop) countTop.textContent = String(count);
    if (bubble) bubble.hidden = count === 0;
    if (likesDot) likesDot.hidden = count === 0;
  };

  // Fetch initial state (non-blocking).
  getLikeState(week.yearId, week.slug).then(({ count, liked }) => {
    renderState(count, liked);
  });

  let inFlight = false;
  button.addEventListener('click', async () => {
    if (inFlight) return;
    inFlight = true;
    // Optimistic update.
    const wasLiked = button.classList.contains('liked');
    const currentText = (countBottom && countBottom.textContent) || '0';
    const currentCount = parseInt(currentText, 10) || 0;
    const optimisticCount = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
    renderState(optimisticCount, !wasLiked);
    button.classList.add('like-btn--pulse');
    setTimeout(() => button.classList.remove('like-btn--pulse'), 400);
    // Server roundtrip.
    const result = await toggleLike(week.yearId, week.slug);
    if (result) renderState(result.count, result.liked);
    else renderState(currentCount, wasLiked); // rollback
    inFlight = false;
  });
}

function bindDiscussJump(app) {
  const link = app.querySelector('[data-discuss-jump]');
  if (!link) return;
  link.addEventListener('click', (e) => {
    const target = document.getElementById('threadList');
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top, behavior: 'smooth' });
  });
}

function updateDiscussCount(app, n) {
  const link = app.querySelector('[data-discuss-jump]');
  const count = app.querySelector('[data-discuss-count]');
  const dot = app.querySelector('[data-discuss-dot]');
  if (!link) return;
  if (count) count.textContent = n > 0 ? String(n) : '';
  if (dot) dot.hidden = false;
  link.hidden = false;
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
        <b>עצרת באמצע פרשת ${week.parshaName}</b>
        <span class="muted">תרצה להמשיך מ-${Math.round(saved.pct * 100)}%?</span>
      </div>
      <div class="resume-banner-actions">
        <button type="button" class="btn resume-btn-go">המשך</button>
        <button type="button" class="btn-text resume-btn-restart">מההתחלה</button>
      </div>
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
  // Order matters: close the <details> FIRST so its open panel doesn't
  // distort the document length, then measure and scroll on the next
  // frame. Otherwise the dropdown's open height shifts every heading
  // below it down by ~200–300px; we scroll to the pre-close position
  // and land past the target heading.
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.dataset.target;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const details = a.closest('.bulletin-toc-mobile details');
      if (details) details.open = false;
      requestAnimationFrame(() => {
        const top = target.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top, behavior: 'smooth' });
      });
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
