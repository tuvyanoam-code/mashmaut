// Pre-build step:
//   1. Generate public/sitemap.xml from public/data/index.json
//   2. If config.logo is a base64 data URL, decode it to public/logo.png and
//      public/og-image.png so og:image / structured-data references resolve
//      to a real file (social scrapers reject data URLs).
//
// Run via the "prebuild" npm script (see package.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(PUBLIC, 'data');
const SITE = 'https://alonmashmaut.org';

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function buildSitemap() {
  const idx = readJson(path.join(DATA, 'index.json'), { years: [], weeks: [] });
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  // Top-level pages
  urls.push({ loc: `${SITE}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' });
  urls.push({ loc: `${SITE}/years`, lastmod: today, changefreq: 'monthly', priority: '0.6' });
  urls.push({ loc: `${SITE}/search`, changefreq: 'yearly', priority: '0.3' });
  urls.push({ loc: `${SITE}/guide`, changefreq: 'monthly', priority: '0.5' });

  // Year archive pages
  for (const y of (idx.years || [])) {
    if (!y.id) continue;
    urls.push({
      loc: `${SITE}/y/${encodeURIComponent(y.id)}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.6',
    });
  }

  // Each bulletin: text view + PDF view.
  for (const w of (idx.weeks || [])) {
    if (!w.yearId || !w.slug) continue;
    const lastmod = (w.publishedAt || '').slice(0, 10) || today;
    urls.push({
      loc: `${SITE}/y/${encodeURIComponent(w.yearId)}/${encodeURIComponent(w.slug)}`,
      lastmod,
      changefreq: 'yearly',
      priority: '0.9',
    });
    urls.push({
      loc: `${SITE}/y/${encodeURIComponent(w.yearId)}/${encodeURIComponent(w.slug)}/pdf`,
      lastmod,
      changefreq: 'yearly',
      priority: '0.5',
    });
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => {
      const fields = [
        `    <loc>${u.loc}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
        u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
        u.priority ? `    <priority>${u.priority}</priority>` : null,
      ].filter(Boolean).join('\n');
      return `  <url>\n${fields}\n  </url>`;
    }).join('\n') +
    '\n</urlset>\n';

  fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), xml);
  console.log(`[seo] wrote sitemap.xml — ${urls.length} URLs`);
}

function extractLogo() {
  const cfg = readJson(path.join(DATA, 'config.json'), {});
  const dataUrl = cfg.logo;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    console.log('[seo] no logo data-URL in config; skipping logo extraction');
    return;
  }
  const m = /^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) { console.log('[seo] config.logo present but not a base64 image; skipping'); return; }
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  // Always write logo.png/jpg — and a sibling og-image.png for social scrapers.
  const logoPath = path.join(PUBLIC, `logo.${ext}`);
  fs.writeFileSync(logoPath, buf);
  // og-image is just a copy with a stable name; many scrapers cache by URL.
  fs.writeFileSync(path.join(PUBLIC, 'og-image.png'), buf);
  // favicon for browser tab.
  fs.writeFileSync(path.join(PUBLIC, 'favicon.png'), buf);
  console.log(`[seo] extracted logo → public/logo.${ext}, og-image.png, favicon.png (${buf.length} bytes)`);
}

buildSitemap();
extractLogo();
