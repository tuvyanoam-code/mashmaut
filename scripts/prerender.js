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

function writeRoute(routePath, html) {
  const target = routePath === '/'
    ? path.join(DIST, 'index.html')
    : path.join(DIST, routePath.replace(/^\//, ''), 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, 'utf8');
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
  writeRoute('/', rewriteHead(template, {
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
  }));
  count++;

  // /years
  writeRoute('/years', rewriteHead(template, {
    title: `ארכיון השנים · עלון ${siteName}`,
    description: `כל עלוני משמעות לפי שנים — ארכיון מלא של פרשיות השבוע מתורת הרב יצחק גינזבורג.`,
    path: '/years',
  }));
  count++;

  // /search
  writeRoute('/search', rewriteHead(template, {
    title: `חיפוש בעלוני משמעות · עלון ${siteName}`,
    description: `חיפוש מהיר בכל עלוני משמעות — לפי פרשה, מילה או נושא.`,
    path: '/search',
  }));
  count++;

  // Year archive pages
  for (const y of (idx.years || [])) {
    if (!y.id) continue;
    const yPath = `/y/${encodeURIComponent(y.id)}`;
    writeRoute(yPath, rewriteHead(template, {
      title: `עלוני משמעות ${y.displayName || y.id} · פרשת השבוע`,
      description: `כל עלוני משמעות של שנת ${y.displayName || y.id} — פרשיות השבוע מתורת הרב יצחק גינזבורג, מסודרות לפי סדר הקריאה.`,
      path: yPath,
    }));
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
    writeRoute(route, rewriteHead(template, {
      title, description: desc, path: route, jsonLd: articleJsonLd,
    }));
    count++;

    // PDF route
    const pdfRoute = `${route}/pdf`;
    writeRoute(pdfRoute, rewriteHead(template, {
      title: `פרשת ${week.parshaName} (PDF) · עלון ${siteName}`,
      description: desc,
      path: pdfRoute,
    }));
    count++;
  }

  console.log(`prerender: wrote ${count} static HTML pages.`);
}

main();
