import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig, getLatestWeek } from '../lib/store.js';
import { icon } from '../icons.js';
import { shareButtonsHtml, bindShareButtons } from '../components/shareButtons.js';
import { track } from '../lib/analytics.js';
import { setPageSeo, plainSummary } from '../lib/seo.js';
import { delayedLoading } from '../lib/loadingState.js';
import { getLastVisited } from '../lib/readingPosition.js';

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

  // Collected teardown callbacks (typewriter timers / observers), run on route exit.
  const cleanups = [];

  // The home pill points back to whichever bulletin the user last visited —
  // text or PDF, scrolled or not. The pill's copy varies: if there's an
  // actual scroll position, we offer to continue from there; otherwise we
  // just offer to return to the page.
  const resume = getLastVisited();
  app.innerHTML = `
    <div ${cssVars} class="fade-in">
      ${nav}
      ${resume ? renderResumePill(resume) : ''}
      ${renderSplash(config, !!latest)}

      <div class="home-latest">
        ${latest ? renderCover(latest, config) : renderCoverEmpty()}

        ${config.heroBlurb ? `
          <section class="about-strip">
            <div class="content">
              <p class="about-blurb">${config.heroBlurb}</p>
            </div>
          </section>
        ` : ''}

        ${latest ? renderReadersInvite(latest) : ''}
      </div>

      ${footerHtml(config)}
    </div>
  `;

  if (latest) {
    const root = app.querySelector('.cover');
    if (root) {
      const url = window.location.origin + `/y/${latest.yearId}/${latest.slug}`;
      bindShareButtons(root, { url, parshaName: latest.parshaName, year: latest.yearDisplay });
    }
    // Reveal the cover in a staggered sequence (and type the weekly headline)
    // when it scrolls into view — echoing the splash entrance. The readers'
    // invite lower down gets the same treatment on its own scroll-in.
    const cover = app.querySelector('.cover');
    const invite = app.querySelector('.readers-invite');
    if (cover) initCoverReveal(cover, invite, cleanups);

    // The single share button reveals the channel buttons on tap, so they stay
    // out of the way until wanted.
    const shareTrigger = app.querySelector('[data-share-trigger]');
    const sharePanel = app.querySelector('#coverSharePanel');
    if (shareTrigger && sharePanel) {
      shareTrigger.addEventListener('click', () => {
        const open = sharePanel.hidden;
        sharePanel.hidden = !open;
        shareTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  // Auto-fade the resume pill after 5 seconds so it doesn't linger forever.
  if (resume) {
    const pillEl = app.querySelector('.resume-pill');
    if (pillEl) {
      setTimeout(() => {
        pillEl.classList.add('resume-pill--fading');
        setTimeout(() => pillEl.remove(), 350);
      }, 5000);
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

  // Mark the body as "home" — drops body padding-top so the splash is
  // full-bleed (the fixed nav floats above without reserving flow space).
  document.body.classList.add('is-home');

  // Hide the nav while the visitor is on the splash; reveal it once they've
  // scrolled past ~40vh so it's available for navigation deeper into the page.
  // The listener is cleaned up when the router navigates away.
  const navEl = document.querySelector('.nav');
  let onScroll = null;
  if (navEl) {
    navEl.classList.add('nav--hidden');
    const showThreshold = () => Math.max(280, window.innerHeight * 0.4);
    onScroll = () => {
      if (window.scrollY > showThreshold()) navEl.classList.remove('nav--hidden');
      else navEl.classList.add('nav--hidden');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // SEO: the home page title is intentionally evergreen — it does NOT
  // reference the current parsha. Otherwise Google indexes the homepage as if
  // it were a single-parsha page, and searches for other parshiot don't lead
  // back here. The description may mention the current bulletin (it changes
  // weekly anyway), but the <title> stays stable across the year.
  const homeTitle = 'עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג';
  const siteName = config.siteName || 'משמעות';
  const homeDesc = latest
    ? `עלון ${siteName} — פרשת השבוע מתורת הרב יצחק גינזבורג. השבוע: פרשת ${latest.parshaName}${latest.issueNumber ? `, גליון ${latest.issueNumber}` : ''}. ${plainSummary(latest.teaser, 140)}`
    : 'עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג. שיחות שבועיות בגובה העיניים, ארכיון מלא, חיפוש, והרשמה למייל.';
  setPageSeo({ title: homeTitle, description: homeDesc, path: '/' });

  track('view', { slug: 'home' });

  // Discussion count badge on the CTA. Shows how many active threads
  // exist on the latest bulletin so the reader knows there's activity
  // to join. Hidden entirely when there are zero threads, so the CTA
  // stays clean for new bulletins with no conversation yet.
  const badge = app.querySelector('[data-mentions-badge]');
  if (badge && latest) {
    import('../lib/threads.js').then(({ listThreads }) =>
      listThreads({ year: latest.yearId, slug: latest.slug })
    ).then((res) => {
      const threads = (res && res.threads) || [];
      const active = threads.filter((t) => !t.deleted);
      const n = active.length;
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.setAttribute('aria-label', `${n} שיחות פעילות`);
        badge.hidden = false;
      }
    }).catch(() => { /* worker may be down — fall through silently */ });
  }

  // Cleanup: when the router navigates away, remove the scroll listener,
  // restore the nav, and drop the body's home flag so padding-top kicks in.
  return () => {
    if (onScroll) window.removeEventListener('scroll', onScroll);
    if (navEl) navEl.classList.remove('nav--hidden');
    document.body.classList.remove('is-home');
    cleanups.forEach((fn) => { try { fn(); } catch (_) {} });
  };
}

// Build a typewriter for the weekly headline. `clear()` blanks it (so it can
// fade in empty), `run()` types it back one character at a time — walking the
// real text nodes so the inline <strong>/<mark> emphasis survives, reserving the
// final height to avoid a reflow jump, and blinking a caret at the cursor.
function prepareTypewriter(h1) {
  if (!h1) return null;
  const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement && n.parentElement.closest('.cover-quote')
        ? NodeFilter.FILTER_REJECT   // keep the decorative quotation marks static
        : NodeFilter.FILTER_ACCEPT,
  });
  const parts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push({ node: n, text: n.nodeValue });
  if (parts.reduce((s, p) => s + p.text.length, 0) < 2) return null;
  const endQuote = h1.querySelector('.cover-quote-end');
  let timer = null;

  return {
    clear() {
      h1.style.minHeight = h1.getBoundingClientRect().height + 'px';
      // Mark it typing from the moment it's blanked, so the empty <mark> doesn't
      // flash its highlight in the gap before typing actually starts.
      h1.classList.add('is-typing');
      parts.forEach((p) => { p.node.nodeValue = ''; });
      if (endQuote) endQuote.style.opacity = '0';
    },
    run() {
      const caret = document.createElement('span');
      caret.className = 'type-caret';
      caret.setAttribute('aria-hidden', 'true');
      h1.classList.add('is-typing');
      let pi = 0, ci = 0;
      const step = () => {
        if (pi >= parts.length) {
          caret.remove();
          h1.classList.remove('is-typing');
          h1.style.minHeight = '';
          if (endQuote) { endQuote.style.transition = 'opacity .35s ease'; endQuote.style.opacity = ''; }
          return;
        }
        const cur = parts[pi];
        cur.node.nodeValue = cur.text.slice(0, ci + 1);
        // Light up a <mark> only once its own text begins to appear, so the
        // highlight is drawn in with the words rather than ahead of them.
        const markEl = cur.node.parentElement && cur.node.parentElement.closest('mark');
        if (markEl) markEl.classList.add('is-active');
        cur.node.parentNode.insertBefore(caret, cur.node.nextSibling);
        const ch = cur.text[ci];
        ci += 1;
        if (ci >= cur.text.length) { pi += 1; ci = 0; }
        timer = setTimeout(step, /[.,!?״׃;:]/.test(ch) ? 240 : 30 + Math.random() * 34);
      };
      step();
    },
    stop() { if (timer) clearTimeout(timer); },
  };
}

// Staggered reveal of the cover when it scrolls into view: the elements rise +
// fade and the divider rules draw across (CSS, via the .reveal class), while the
// headline fades in blank and then types itself. The readers' invite lower down
// reveals last of all, after the action buttons. Static for reduced-motion.
function initCoverReveal(cover, invite, cleanups) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cover.classList.add('cover--anim');
  if (invite) invite.classList.add('is-anim'); // pre-hide it too
  const typer = prepareTypewriter(cover.querySelector('.cover-headline:not(.cover-headline-plain)'));
  let done = false;
  const timers = [];
  const io = new IntersectionObserver((entries) => {
    if (done || !entries.some((e) => e.isIntersecting)) return;
    done = true;
    io.disconnect();
    if (typer) typer.clear();            // blank it before it fades in
    cover.classList.add('reveal');
    if (typer) timers.push(setTimeout(() => typer.run(), 1450)); // type once it's faded in
    // The discussion invite comes last — only after the action buttons land.
    if (invite) timers.push(setTimeout(() => invite.classList.add('reveal'), 2050));
  }, { threshold: 0.15 });
  io.observe(cover);
  cleanups.push(() => { io.disconnect(); timers.forEach(clearTimeout); if (typer) typer.stop(); });
}

function renderResumePill(r) {
  // The home pill never shows reading progress — that belongs inside the
  // bulletin (the resume banner offers the exact-spot jump there). Here the
  // pill is a simple "back to where you were" affordance. It only appears at
  // all when the bulletin is unfinished (`markFinished` clears the
  // last-visited key, so getLastVisited() already returns null in that case).
  const url = `/y/${r.yearId}/${r.slug}`;
  const aria = `חזרה לפרשת ${r.parshaName}`;
  return `
    <a class="resume-pill" href="${url}" aria-label="${aria}">
      ${icon('book', { size: 16 })}
      <span class="resume-pill-text">
        <span class="muted">חזרה ל-</span>
        <b>פרשת ${r.parshaName}</b>
      </span>
      ${icon('arrowLeft', { size: 14 })}
    </a>
  `;
}

function renderSplash(config, hasLatest) {
  const siteName = config.siteName || 'משמעות';
  const tagline = config.tagline || 'רעיונות לפרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט״א';
  // Emphasise the rabbi's name — heavier weight + the (per-bulletin) site colour.
  const taglineHtml = tagline.replace('הרב יצחק גינזבורג', '<span class="splash-tagline-name">הרב יצחק גינזבורג</span>');
  // The splash wordmark is tinted with the changing bulletin colour: the logo
  // PNG is used as a mask over a fill of --bulletin-primary (the hidden <img>
  // just reserves the correct size/aspect), so it takes the site's weekly colour
  // instead of cycling through hues.
  const brand = config.logo
    ? `<span class="splash-logo" role="img" aria-label="${siteName}">
         <img class="splash-logo-size" src="${config.logo}" alt="" aria-hidden="true" />
         <span class="splash-logo-tint" aria-hidden="true" style="-webkit-mask-image:url('${config.logo}');mask-image:url('${config.logo}')"></span>
       </span>`
    : `<span class="splash-wordmark">${siteName}</span>`;
  const hook = config.heroTitle ? formatHook(config.heroTitle) : '';
  return `
    <section class="splash">
      <div class="splash-decor splash-decor-a" aria-hidden="true"></div>
      <div class="splash-decor splash-decor-b" aria-hidden="true"></div>

      <div class="splash-inner">
        <div class="splash-brand">${brand}</div>

        <div class="splash-rule from-right splash-rule--under-logo" style="--rd:.85s" aria-hidden="true"></div>

        <p class="splash-tagline">${taglineHtml}</p>

        <div class="splash-rule from-left splash-rule--under-tagline" style="--rd:1.5s" aria-hidden="true"></div>

        ${hook ? `<p class="splash-hook">${hook}</p>` : ''}

        ${hasLatest ? `
          <div class="splash-rule from-right splash-rule--pre-scroll" style="--rd:2.15s" aria-hidden="true"></div>
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
      <p class="cover-eyebrow" style="--d:.10s">
        <span class="cover-eyebrow-lead">העלון האחרון</span>
        <b class="cover-eyebrow-parsha">פרשת ${week.parshaName}</b>
      </p>
      ${editionMeta ? `<p class="cover-edition" style="--d:.26s">${editionMeta}</p>` : ''}

      <div class="cover-rule from-right" style="--d:.50s" aria-hidden="true"></div>

      ${week.teaser ? `
        <h1 class="cover-headline" style="--d:.72s">
          <span class="cover-quote" aria-hidden="true">״</span>
          ${week.teaser}
          <span class="cover-quote cover-quote-end" aria-hidden="true">״</span>
        </h1>
      ` : `
        <h1 class="cover-headline cover-headline-plain" style="--d:.72s">פרשת ${week.parshaName}</h1>
      `}

      <div class="cover-rule from-left" style="--d:1.35s" aria-hidden="true"></div>

      <div class="cover-actions" style="--d:1.55s">
        <a class="btn cover-cta" href="${url}">${icon('book', { size: 18 })} <span>קרא את העלון</span></a>
        <a class="cover-pill" href="${pdfPath}">${icon('fileBlank', { size: 16 })} <span>פתח PDF</span></a>
        <button type="button" class="cover-pill" data-share-trigger aria-expanded="false" aria-controls="coverSharePanel">
          ${icon('share', { size: 16 })}
          <span>שתף עם חבר</span>
        </button>
        <div class="cover-share-panel" id="coverSharePanel" hidden>
          ${shareButtonsHtml({ url: fullUrl, parshaName: week.parshaName, year: week.yearDisplay })}
        </div>
      </div>
    </main>
  `;
}

// The readers' discussion invite — its own quiet section low on the page (not
// in the cover), so the centre stays calm. A mentions badge appears beside the
// label when the reader has unread @mentions waiting.
function renderReadersInvite(week) {
  const url = `/y/${week.yearId}/${week.slug}`;
  return `
    <section class="readers-invite">
      <div class="cover-rule from-right" style="--d:.05s" aria-hidden="true"></div>
      <div class="content">
        <p class="readers-invite-prompt" style="--d:.18s">המאמר הותיר אצלך מחשבה? שאלה? נקודה שדורשת בירור?</p>
        <a class="cover-discuss-btn" style="--d:.30s" href="${url}#threadList">
          ${icon('dialog', { size: 18 })}
          <span>לשיחה בין הקוראים</span>
          <span class="cover-discuss-badge" data-mentions-badge hidden></span>
        </a>
      </div>
    </section>
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
