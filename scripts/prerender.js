// Post-build prerender: emit a static HTML file for each route, with route-
// specific <title>, meta description, og/twitter tags, canonical, and JSON-LD
// baked into the HTML. The runtime SPA still takes over once the JS loads —
// pre-rendering only changes what crawlers and link-preview scrapers see.
//
// Output (relative to dist/):
//   /                      -> dist/index.html (built by Vite, head rewritten)
//   /years                 -> dist/years/index.html
//   /search                -> dist/search/index.html
//   /y/<year>              -> dist/y/<year>/index.html
//   /y/<year>/<slug>       -> dist/y/<year>/<slug>/index.html
//   /y/<year>/<slug>/pdf   -> dist/y/<year>/<slug>/pdf/index.html
//
// The SPA router still handles client-side navigation as before; the static
// HTML is a per-route snapshot whose <head> is correct so Googlebot doesn't
// have to execute JS to know what each URL is about.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'public', 'data');
const SITE = 'https://alonmashmaut.org';

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function plainSummary(text, maxLen = 200) {
  if (!text) return '';
  const s = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Apply route-specific SEO fields to the built HTML template.
// Replaces title / canonical / description / og:* / twitter:* / JSON-LD only.
// Everything else (script tags, fonts, body shell) stays exactly as Vite built it.
function rewriteHead(html, { title, description, path: routePath, jsonLd, image }) {
  const url = SITE + routePath;
  const img = image || `${SITE}/og-image.png`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${d}" />`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`
  );
  out = out.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${t}" />`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${d}" />`
  );
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`
  );
  out = out.replace(
    /<meta property="og:image" content="[^"]*"\s*\/>/,
    `<meta property="og:image" content="${img}" />`
  );
  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${t}" />`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${d}" />`
  );
  out = out.replace(
    /<meta name="twitter:image" content="[^"]*"\s*\/>/,
    `<meta name="twitter:image" content="${img}" />`
  );

  if (jsonLd) {
    // Append a per-page JSON-LD script (the WebSite one already in the head
    // stays). Crawlers happily consume multiple ld+json blocks.
    const json = JSON.stringify(jsonLd, null, 2);
    out = out.replace(
      '</head>',
      `<script type="application/ld+json" data-seo="page">\n${json}\n</script>\n</head>`
    );
  }
  return out;
}

// ---- Prerendered body ------------------------------------------------------
// The SPA mounts into an empty <div id="app">, so a crawler that doesn't run
// JavaScript sees a blank page. Googlebot executes JS and therefore indexes the
// site fine — but most AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) only
// read raw HTML, which is why the site was invisible to AI assistants while
// ranking first on Google. So we bake a readable version of each page into #app.
//
// Every page renderer assigns `app.innerHTML`, which wipes this the moment the
// router runs — so it's a real no-JS fallback, not crawler-only content, and
// readers with JS never keep it. Keep it plain: it exists to be read, not styled.
const FALLBACK_STYLE = `
    <style>
      #app > .pf { max-width: 720px; margin: 0 auto; padding: 32px 20px 56px;
        font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
        line-height: 1.7; color: #2a2620; }
      #app > .pf a { color: #2d6a4f; }
      #app > .pf .pf-brand { font-size: 14px; color: #8a8172; margin-bottom: 24px; }
      #app > .pf h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 12px; }
      #app > .pf h2 { font-size: 1.25rem; margin: 28px 0 8px; }
      #app > .pf .pf-lead { font-size: 1.06rem; color: #4a443a; }
      #app > .pf .pf-links { margin-top: 36px; padding-top: 16px;
        border-top: 1px solid #e7dfce; font-size: 14px; }
      #app > .pf .pf-links a { margin-inline-end: 14px; display: inline-block; }
    </style>`;

const SITE_TAGLINE = 'רעיונות לפרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט״א';

// Site-wide links, so a crawler reading raw HTML can actually discover the rest
// of the site: the SPA renders its nav in JS, leaving no <a href> to follow.
function fallbackLinks(extra = []) {
  const base = [
    ['/', 'עמוד הבית'],
    ['/years', 'ארכיון העלונים'],
    ['/search', 'חיפוש'],
    ['/about', 'אודות עלון משמעות'],
  ];
  return [...base, ...extra]
    .map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`)
    .join('\n        ');
}

function fallbackBody({ h1, lead, bodyHtml, links }) {
  return `<div class="pf">
      <div class="pf-brand"><a href="/"><b>עלון משמעות</b></a> — ${escapeHtml(SITE_TAGLINE)}</div>
      <h1>${escapeHtml(h1)}</h1>
      ${lead ? `<p class="pf-lead">${escapeHtml(lead)}</p>` : ''}
      ${bodyHtml || ''}
      <nav class="pf-links" aria-label="ניווט">
        ${links || fallbackLinks()}
      </nav>
    </div>`;
}

// Put the fallback inside #app, and its styles in the head.
function injectBody(html, inner) {
  return html
    .replace('</head>', `${FALLBACK_STYLE}\n</head>`)
    .replace('<div id="app"></div>', `<div id="app">${inner}</div>`);
}

function writeRoute(routePath, html) {
  const target = routePath === '/'
    ? path.join(DIST, 'index.html')
    : path.join(DIST, routePath.replace(/^\//, ''), 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, 'utf8');
}

// ---- Machine-readable surfaces ---------------------------------------------
// Everything an AI assistant (or any script) needs to ingest the bulletins
// without scraping HTML or running the SPA:
//   /llms.txt                  — index: what this site is + where everything is
//   /llms-full.txt             — every bulletin's full text in a single fetch
//   /y/<year>/<slug>.txt       — one bulletin as plain text
//   /feed.xml                  — RSS with the full article text per item
// The bulletin JSON under /data/ is already public and stays the structured
// source; these add the plain-text and feed forms that models ingest best.
function writeFileRel(rel, content) {
  const target = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

// "Newest first", using the same rule the site and the worker use to pick the
// latest bulletin: an explicit displayOrder wins (lowest = newest), otherwise
// fall back to publish date. Keeps the feed and the home page's links in step
// with what the site itself calls the latest issue.
function newestFirst(weeks) {
  const ordered = weeks.filter((w) => typeof w.displayOrder === 'number');
  const rest = weeks.filter((w) => typeof w.displayOrder !== 'number');
  return [
    ...ordered.sort((a, b) => a.displayOrder - b.displayOrder),
    ...rest.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))),
  ];
}

function toPlainText(week) {
  const body = week.plainText || plainSummary(week.textHtml || '', 100000)
    || '[גליון זה זמין כקובץ PDF בלבד — טקסט מלא עדיין לא הופק עבורו.]';
  const head = [
    `פרשת ${week.parshaName} — עלון משמעות`,
    [week.issueNumber ? `גליון ${week.issueNumber}` : '', week.dateLabel, week.yearDisplay]
      .filter(Boolean).join(' · '),
    `${SITE}/y/${week.yearId}/${week.slug}`,
    week.pdfUrl ? `PDF: ${SITE}/${week.pdfUrl}` : '',
    '',
  ].filter((l) => l !== '').join('\n');
  return `${head}\n${body}\n`;
}

function writeAiSurfaces(idx) {
  // Order comes from index.json, which is authoritative: the per-bulletin files
  // carry a stale displayOrder (mostly a leftover 0), so sorting the loaded
  // files instead would scramble the feed. Sort the summaries, then load in that
  // order and keep it.
  const weeks = newestFirst((idx.weeks || []).filter((w) => w.yearId && w.slug));
  const full = weeks.map((w) => ({
    ...readJson(path.join(DATA, 'bulletins', w.yearId, `${w.slug}.json`), w),
    displayOrder: w.displayOrder,
  }));

  // Per-bulletin plain text.
  for (const week of full) {
    writeFileRel(`y/${week.yearId}/${week.slug}.txt`, toPlainText(week));
  }

  // llms.txt — the index an assistant reads first.
  const byYear = new Map();
  for (const w of newestFirst(full)) {
    if (!byYear.has(w.yearDisplay || w.yearId)) byYear.set(w.yearDisplay || w.yearId, []);
    byYear.get(w.yearDisplay || w.yearId).push(w);
  }
  const llms = [
    '# עלון משמעות (Alon Mashmaut)',
    '',
    `> עלון שבועי של חסידות על פרשת השבוע, מתורתו של הרב יצחק גינזבורג שליט״א. כל עלון מברר רעיון חסידי אחד מן הפרשה — פנימיות התורה, עבודת הנפש והיחס שבין האדם לבוראו — בשפה בהירה ובגובה העיניים. מתפרסם מדי שבוע לקראת שבת. האתר מכיל ארכיון מלא של כל העלונים, בטקסט מלא וב-PDF.`,
    '',
    'רקע: העלון נוסד בשנת תשפ״ה על ידי קבוצת בחורים בישיבת "תום ודעת" של הרב יצחק גינזבורג בירושלים, שחיפשו תוכן קליל ופשוט לחלוקה במבצע תפילין בימי שישי. מאז התרחב לתפוצה במייל, ברשתות החברתיות ובאתר.',
    '',
    'ייחוס: התורה והתוכן הם של הרב יצחק גינזבורג שליט״א, ותחתיו מקוטלג התוכן. העלון עצמו נכתב, נערך ומופץ על ידי תלמידים — ולמי שרוצה דיוק: הדברים נכתבים מתוך דבריו של הרב אך אינם בהכרח מוגהים על ידו לפני הפרסום.',
    '',
    'שפה: עברית.',
    '',
    'הרשאות שימוש: מותר להפיץ, להדפיס, לצטט ולשתף את העלון ללא הגבלה וללא תשלום — בדפוס, במייל, בוואטסאפ וברשתות החברתיות, בלי צורך בבקשת רשות מראש. הבקשה היחידה: לשמור על התוכן כפי שהוא ולציין את המקור "עלון משמעות" עם קישור ל-alonmashmaut.org.',
    '',
    '## מידע על העלון',
    `- [אודות עלון משמעות](${SITE}/about): מה זה העלון, למי הוא מיועד, מה יש בכל גליון ואיך נרשמים.`,
    `- [ארכיון השנים](${SITE}/years): כל העלונים לפי שנים.`,
    `- [חיפוש](${SITE}/search): חיפוש בטקסט המלא של כל העלונים.`,
    '',
    '## שאיבת תוכן',
    `- [כל העלונים בקובץ אחד](${SITE}/llms-full.txt): הטקסט המלא של כל העלונים.`,
    `- [פיד RSS](${SITE}/feed.xml): העלונים האחרונים, עם הטקסט המלא בכל פריט.`,
    `- [מפת האתר](${SITE}/sitemap.xml): כל הכתובות.`,
    '- טקסט גולמי של עלון בודד: `' + SITE + '/y/<שנה>/<פרשה>.txt`',
    '- נתונים מובְנים של עלון בודד (JSON): `' + SITE + '/data/bulletins/<שנה>/<פרשה>.json`',
    '- קובץ PDF של עלון בודד: `' + SITE + '/data/bulletins/<שנה>/<פרשה>.pdf`',
    '',
    `הערה על זמינות הטקסט: ${full.filter((w) => w.plainText || w.textHtml).length} מתוך ${full.length} הגליונות זמינים בטקסט מלא. היתר (הגליונות המוקדמים) קיימים כקובץ PDF בלבד, ומסומנים למטה ב-[PDF בלבד].`,
    '',
    '## העלונים',
  ];
  for (const [year, list] of byYear) {
    llms.push('', `### ${year}`);
    for (const w of list) {
      const teaser = plainSummary(w.teaser || w.plainText || '', 140);
      const hasText = !!(w.plainText || w.textHtml);
      llms.push(`- [פרשת ${w.parshaName}](${SITE}/y/${w.yearId}/${w.slug})` +
        `${w.issueNumber ? ` (גליון ${w.issueNumber})` : ''}` +
        `${hasText ? '' : ' [PDF בלבד]'}${teaser ? `: ${teaser}` : ''}`);
    }
  }
  writeFileRel('llms.txt', llms.join('\n') + '\n');

  // llms-full.txt — one fetch, everything.
  const sep = '\n\n' + '='.repeat(72) + '\n\n';
  writeFileRel('llms-full.txt',
    `# עלון משמעות — הטקסט המלא של כל העלונים\n# ${SITE}\n# ${full.length} עלונים\n` +
    sep + full.map(toPlainText).join(sep));

  // feed.xml — RSS 2.0, newest first, full text in content:encoded.
  const esc = (s) => escapeHtml(s);
  const items = newestFirst(full).slice(0, 60).map((w) => {
    const link = `${SITE}/y/${w.yearId}/${w.slug}`;
    const date = w.publishedAt ? new Date(w.publishedAt).toUTCString() : '';
    return `    <item>
      <title>${esc(`פרשת ${w.parshaName} — עלון משמעות`)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${date ? `<pubDate>${date}</pubDate>` : ''}
      <description>${esc(plainSummary(w.teaser || w.plainText || '', 300))}</description>
      <content:encoded><![CDATA[${w.textHtml || ''}]]></content:encoded>
    </item>`;
  }).join('\n');
  writeFileRel('feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>עלון משמעות — פרשת השבוע</title>
    <link>${SITE}/</link>
    <description>${esc(SITE_TAGLINE)}</description>
    <language>he</language>
${items}
  </channel>
</rss>
`);

  console.log(`prerender: wrote llms.txt, llms-full.txt, feed.xml and ${full.length} .txt bulletins.`);
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('prerender: dist/index.html missing — run `vite build` first.');
    process.exit(1);
  }
  const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const idx = readJson(path.join(DATA, 'index.json'), { years: [], weeks: [] });
  const config = readJson(path.join(DATA, 'config.json'), {});
  const siteName = config.siteName || 'משמעות';

  let count = 0;

  // Home — same content as Vite already wrote, but normalize via rewriteHead so
  // any future template drift stays consistent.
  const homeTitle = 'עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג';
  const homeDesc = 'עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג. שיחות שבועיות בגובה העיניים, ארכיון מלא של כל העלונים, חיפוש, והרשמה למייל.';
  // Newest bulletins, so the home page's raw HTML both describes the site and
  // links onward to actual issues.
  const recent = newestFirst(idx.weeks || []).slice(0, 12);
  const recentLinks = recent
    .filter((w) => w.yearId && w.slug)
    .map((w) => [`/y/${w.yearId}/${w.slug}`, `פרשת ${w.parshaName}`]);

  writeRoute('/', injectBody(rewriteHead(template, {
    title: homeTitle,
    description: homeDesc,
    path: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: homeTitle,
      alternateName: 'עלון משמעות',
      url: SITE + '/',
      inLanguage: 'he',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  }), fallbackBody({
    h1: 'עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג',
    lead: 'עלון משמעות הוא עלון שבועי לפרשת השבוע, המביא רעיונות מתוך תורתו של הרב יצחק גינזבורג שליט״א בשפה בהירה ובגובה העיניים. העלון מתפרסם מדי שבוע לקראת שבת, ונשלח חינם במייל לכל הנרשמים.',
    bodyHtml: `<h2>מה יש באתר</h2>
      <p>הטקסט המלא של כל עלון זמין לקריאה באתר, לצד קובץ PDF להדפסה. באתר ארכיון מלא של כל העלונים לפי שנים ולפי סדר הפרשיות, חיפוש בכל העלונים, ואפשרות להירשם לקבלת העלון השבועי במייל.</p>
      <h2>העלונים האחרונים</h2>`,
    links: fallbackLinks(recentLinks),
  })));
  count++;

  // /years
  const yearLinks = (idx.years || [])
    .filter((y) => y.id)
    .map((y) => [`/y/${y.id}`, `עלוני ${y.displayName || y.id}`]);
  writeRoute('/years', injectBody(rewriteHead(template, {
    title: `ארכיון השנים · עלון ${siteName}`,
    description: `כל עלוני משמעות לפי שנים — ארכיון מלא של פרשיות השבוע מתורת הרב יצחק גינזבורג.`,
    path: '/years',
  }), fallbackBody({
    h1: 'ארכיון עלוני משמעות',
    lead: 'כל עלוני משמעות שיצאו עד היום, מסודרים לפי שנים ולפי סדר קריאת הפרשיות. כל עלון זמין לקריאה כדף אינטרנט וגם כקובץ PDF להדפסה.',
    links: fallbackLinks(yearLinks),
  })));
  count++;

  // /search
  writeRoute('/search', injectBody(rewriteHead(template, {
    title: `חיפוש בעלוני משמעות · עלון ${siteName}`,
    description: `חיפוש מהיר בכל עלוני משמעות — לפי פרשה, מילה או נושא.`,
    path: '/search',
  }), fallbackBody({
    h1: 'חיפוש בעלוני משמעות',
    lead: 'חיפוש בכל עלוני משמעות לפי פרשה, מילה או נושא. החיפוש עובר על הטקסט המלא של כל העלונים שבארכיון.',
  })));
  count++;

  // /guide
  writeRoute('/guide', injectBody(rewriteHead(template, {
    title: `מדריך שימוש · עלון ${siteName}`,
    description: `מדריך אינטראקטיבי קצר: איך קוראים את העלון, מנווטים בארכיון, מחפשים ונרשמים לקבלה במייל.`,
    path: '/guide',
  }), fallbackBody({
    h1: 'מדריך שימוש באתר עלון משמעות',
    lead: 'מדריך קצר: איך קוראים את העלון השבועי, מנווטים בארכיון, מחפשים בעלונים קודמים ונרשמים לקבלת העלון במייל.',
  })));
  count++;

  // /about — the canonical "what is עלון משמעות" page. Mirrors src/pages/about.js;
  // this is the version an AI assistant or crawler reads without running the SPA.
  const aboutDesc = 'עלון משמעות הוא עלון שבועי של חסידות על פרשת השבוע מתורתו של הרב יצחק גינזבורג שליט״א. נוסד בתשפ״ה על ידי בחורים מישיבת ״תום ודעת״ בירושלים, נכתב ומופץ על ידי תלמידים, ומתפרסם מדי שבוע לקראת שבת — עם ארכיון מלא, חיפוש והרשמה במייל.';
  writeRoute('/about', injectBody(rewriteHead(template, {
    title: 'אודות עלון משמעות — פרשת השבוע מתורת הרב יצחק גינזבורג',
    description: aboutDesc,
    path: '/about',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'אודות עלון משמעות',
      url: `${SITE}/about`,
      inLanguage: 'he',
      description: aboutDesc,
      mainEntity: {
        '@type': 'Periodical',
        name: 'עלון משמעות',
        alternateName: 'עלון משמעות — פרשת השבוע',
        url: SITE + '/',
        inLanguage: 'he',
        description: aboutDesc,
        about: ['חסידות', 'פרשת השבוע', 'תורה', 'פנימיות התורה', 'תורת הרב יצחק גינזבורג'],
        genre: 'חסידות על פרשת השבוע',
        // The Torah is the Rav's and the content is catalogued under him; the
        // bulletin itself is written and edited by students, and is not
        // necessarily proofread by him before publication.
        author: { '@type': 'Person', name: 'הרב יצחק גינזבורג' },
        editor: { '@type': 'Organization', name: 'מערכת עלון משמעות — תלמידים' },
        publisher: {
          '@type': 'Organization',
          name: 'מערכת עלון משמעות',
          url: SITE + '/',
          email: 'alon@alonmashmaut.org',
          logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
        },
      },
    },
  }), fallbackBody({
    h1: 'אודות עלון משמעות',
    lead: 'עלון משמעות הוא עלון שבועי של חסידות על פרשת השבוע מתורתו של הרב יצחק גינזבורג שליט״א, המוגש בשפה בהירה ובגובה העיניים. העלון נוסד בתשפ״ה, נכתב ומופץ על ידי תלמידים, ומתפרסם מדי שבוע לקראת שבת — במייל, ברשתות החברתיות ובאתר alonmashmaut.org.',
    bodyHtml: `
      <h2>מה זה עלון משמעות?</h2>
      <p>בכל שבוע יוצא עלון חדש שנצמד לפרשת השבוע ומוציא ממנה רעיון אחד מרכזי — לא סיכום של הפרשה, אלא מבט חסידי שמברר נקודה אחת לעומק ומחבר אותה לחיים. תורת החסידות עוסקת בפנימיות התורה: לא רק במה שכתוב, אלא במה שהדברים אומרים על הנפש, על העבודה הפנימית ועל היחס שבין האדם לבוראו — וזו הזווית שממנה נכתב כל עלון.</p>
      <h2>איך הכל התחיל</h2>
      <p>העלון נוסד בשנת תשפ״ה, מקבוצת בחורים בישיבת ״תום ודעת״ של הרב יצחק גינזבורג בירושלים. הם חיפשו תוכן קליל ופשוט לחלוקה במבצע תפילין בימי שישי — משהו שאפשר יהיה לתת לכל אדם ברחוב, והוא ייקח ממנו רעיון אחד מאיר לשבת. מהדפים שחולקו ברחוב זה התרחב בהדרגה לתפוצה רחבה יותר: רשימת תפוצה במייל, הפצה ברשתות החברתיות, וארכיון מלא באתר.</p>
      <h2>מי עומד מאחורי העלון?</h2>
      <p>התורה שבעלון היא תורתו של הרב יצחק גינזבורג שליט״א — הרעיונות, הדרך והתוכן מבוססים על שיעוריו ומאמריו על פרשת השבוע, ותחתיו מקוטלג התוכן שבאתר. העלון עצמו נכתב, נערך ומופץ על ידי תלמידים, מתוך רצון להנגיש את הרעיונות לקהל רחב ובשפה פשוטה.</p>
      <p>למי שרוצה דיוק: הדברים נכתבים מתוך דבריו של הרב, אך אינם בהכרח מוגהים על ידו לפני הפרסום. לכן, במקום שבו נדרשת הדייקנות המלאה, יש לפנות למקורות המקוריים של הרב עצמו.</p>
      <h2>למי העלון מיועד?</h2>
      <p>לכל מי שרוצה להיכנס לפרשת השבוע בלי רקע מוקדם, וגם למי שכבר לומד ומחפש זווית נוספת. כל עלון עומד בפני עצמו, ואפשר להתחיל מכל שבוע.</p>
      <h2>מה יש בכל עלון?</h2>
      <p>מאמר מרכזי על פרשת השבוע, מחולק בכותרות ברורות — קריאה של כחמש דקות; גרסת PDF בעימוד המקורי להדפסה לשבת; וגרסת אתר נגישה עם הטקסט המלא.</p>
      <h2>האתר והארכיון</h2>
      <p>באתר שמור ארכיון מלא של כל העלונים שיצאו, מסודר לפי שנים ולפי סדר קריאת הפרשיות. עד היום יצאו ${(idx.weeks || []).length} גליונות. יש חיפוש בעלונים ואפשרות לפתוח שיחה על כל עלון.</p>
      <h2>הפצה והדפסה — מותר, ובשמחה</h2>
      <p>העלון נולד כדי להיות מחולק, וכך הוא נשאר: מותר להפיץ ולהדפיס אותו ללא הגבלה. אפשר להדפיס עותקים ולחלק בבית הכנסת, בישיבה, בשולחן שבת או בפעילות בשטח; אפשר להעביר את הקובץ או את הקישור בוואטסאפ, במייל וברשתות החברתיות — הכל בלי צורך בבקשת רשות מראש ובלי תשלום. הבקשה היחידה היא לשמור על העלון כפי שהוא ולציין את המקור: עלון משמעות, alonmashmaut.org.</p>
      <h2>איך מקבלים את העלון?</h2>
      <p>אפשר להירשם לקבלת העלון במייל — בכל ערב שבת נשלח העלון החדש לתיבה, עם קישור לקריאה באתר ולקובץ להדפסה. ההרשמה חינם, וניתן להסיר את הכתובת בכל רגע.</p>
      <h2>תרומות ותמיכה</h2>
      <p>העלון נכתב ומופץ ללא תשלום. מי שמעוניין לתמוך בהמשך ההוצאה וההפצה, או לסייע בדרכים אחרות, מוזמן לפנות במייל העלון.</p>
      <h2>יצירת קשר</h2>
      <p>דוא״ל: <a href="mailto:alon@alonmashmaut.org">alon@alonmashmaut.org</a></p>`,
  })));
  count++;

  // Year archive pages
  for (const y of (idx.years || [])) {
    if (!y.id) continue;
    const yPath = `/y/${encodeURIComponent(y.id)}`;
    const inYear = (idx.weeks || [])
      .filter((w) => w.yearId === y.id && w.slug)
      .map((w) => [`/y/${w.yearId}/${w.slug}`, `פרשת ${w.parshaName}`]);
    writeRoute(yPath, injectBody(rewriteHead(template, {
      title: `עלוני משמעות ${y.displayName || y.id} · פרשת השבוע`,
      description: `כל עלוני משמעות של שנת ${y.displayName || y.id} — פרשיות השבוע מתורת הרב יצחק גינזבורג, מסודרות לפי סדר הקריאה.`,
      path: yPath,
    }), fallbackBody({
      h1: `עלוני משמעות · שנת ${y.displayName || y.id}`,
      lead: `כל עלוני משמעות של שנת ${y.displayName || y.id} — פרשיות השבוע מתורת הרב יצחק גינזבורג, מסודרות לפי סדר הקריאה.`,
      links: fallbackLinks(inYear),
    })));
    count++;
  }

  // Each bulletin: text view + PDF view
  for (const summary of (idx.weeks || [])) {
    if (!summary.yearId || !summary.slug) continue;

    // Load full bulletin to get teaser/plainText for description.
    const fullPath = path.join(DATA, 'bulletins', summary.yearId, `${summary.slug}.json`);
    const week = readJson(fullPath, summary);
    const teaser = week.teaser || summary.teaser || '';
    const desc = plainSummary(teaser || week.plainText || '', 200) ||
      `פרשת ${week.parshaName} — עלון משמעות${week.yearDisplay ? ', ' + week.yearDisplay : ''}.`;
    const title = `פרשת ${week.parshaName} · ${siteName}${week.yearDisplay ? ' · ' + week.yearDisplay : ''}`;

    const articleJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `פרשת ${week.parshaName}`,
      description: desc,
      inLanguage: 'he',
      datePublished: week.publishedAt || undefined,
      dateModified: week.publishedAt || undefined,
      url: `${SITE}/y/${week.yearId}/${week.slug}`,
      mainEntityOfPage: `${SITE}/y/${week.yearId}/${week.slug}`,
      author: { '@type': 'Person', name: 'הרב יצחק גינזבורג' },
      // The full article text, so an engine that reads structured data alone
      // still gets the actual content rather than just a teaser.
      articleBody: plainSummary(week.plainText || '', 100000) || undefined,
      isPartOf: {
        '@type': 'PublicationIssue',
        issueNumber: week.issueNumber || undefined,
        datePublished: week.publishedAt || undefined,
        isPartOf: {
          '@type': 'Periodical',
          name: 'עלון משמעות',
          url: SITE + '/',
        },
      },
      publisher: {
        '@type': 'Organization',
        name: 'עלון משמעות',
        url: SITE + '/',
        logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
      },
    };

    const route = `/y/${encodeURIComponent(week.yearId)}/${encodeURIComponent(week.slug)}`;
    const meta = [
      week.issueNumber ? `גליון ${week.issueNumber}` : '',
      week.dateLabel || '',
      week.yearDisplay || '',
    ].filter(Boolean).join(' · ');

    writeRoute(route, injectBody(rewriteHead(template, {
      title, description: desc, path: route, jsonLd: articleJsonLd,
    }), fallbackBody({
      h1: `פרשת ${week.parshaName}`,
      lead: meta ? `עלון משמעות · ${meta}` : 'עלון משמעות',
      // The bulletin's own article HTML — the content that was previously
      // reachable only by running the SPA. Older issues (up to #48) were
      // imported as PDF only and carry no text, so point at the PDF instead of
      // emitting an empty page.
      bodyHtml: week.textHtml
        || (week.plainText ? `<p>${escapeHtml(week.plainText)}</p>` : '')
        || `<p>גליון זה זמין כקובץ PDF בלבד; טקסט מלא לקריאה באתר עדיין לא הופק עבורו.${
          week.pdfUrl ? ` <a href="/${escapeHtml(week.pdfUrl)}">להורדת ה-PDF של פרשת ${escapeHtml(week.parshaName)}</a>.` : ''
        }</p>`,
      links: fallbackLinks([
        [`${route}/pdf`, `PDF להדפסה — פרשת ${week.parshaName}`],
      ]),
    })));
    count++;

    // PDF route
    const pdfRoute = `${route}/pdf`;
    writeRoute(pdfRoute, injectBody(rewriteHead(template, {
      title: `פרשת ${week.parshaName} (PDF) · עלון ${siteName}`,
      description: desc,
      path: pdfRoute,
    }), fallbackBody({
      h1: `פרשת ${week.parshaName} — גרסת PDF`,
      lead: `קובץ ה-PDF של עלון משמעות לפרשת ${week.parshaName}${meta ? ' · ' + meta : ''}, בעימוד המקורי להדפסה.`,
      bodyHtml: week.pdfUrl
        ? `<p><a href="/${escapeHtml(week.pdfUrl)}">הורדת קובץ ה-PDF</a></p>`
        : '',
      links: fallbackLinks([[route, `לקריאת פרשת ${week.parshaName} באתר`]]),
    })));
    count++;
  }

  console.log(`prerender: wrote ${count} static HTML pages.`);
  writeAiSurfaces(idx);
}

main();
