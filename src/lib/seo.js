// Per-route SEO updates: title, meta description, canonical, og:* + twitter:*,
// and an injected JSON-LD payload. Keeps the static index.html as the default
// and overrides per page.

const SITE = 'https://alonmashmaut.org';

function setMeta(selector, attr, key, value) {
  let el = document.head.querySelector(selector);
  if (!value) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(id, payload) {
  // Replace any prior dynamic payload with the same id.
  const existing = document.head.querySelector(`script[type="application/ld+json"][data-seo="${id}"]`);
  if (existing) existing.remove();
  if (!payload) return;
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.setAttribute('data-seo', id);
  el.textContent = JSON.stringify(payload);
  document.head.appendChild(el);
}

/**
 * Update document head for a page.
 *  - title:        document title (also og:title, twitter:title)
 *  - description:  meta description (also og/twitter)
 *  - path:         path (without origin) — used for canonical + og:url
 *  - image:        absolute URL to og:image (defaults to /og-image.png)
 *  - jsonLd:       optional structured-data payload (object)
 */
export function setPageSeo({ title, description, path = '/', image, jsonLd } = {}) {
  if (typeof document === 'undefined') return;
  const fullTitle = title || 'משמעות — עלון פרשת השבוע';
  const fullUrl = SITE + path;
  const fullImage = image || `${SITE}/og-image.png`;

  document.title = fullTitle;

  setMeta('meta[name="description"]', 'name', 'description', description || '');
  setLink('canonical', fullUrl);

  setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
  setMeta('meta[property="og:description"]', 'property', 'og:description', description || '');
  setMeta('meta[property="og:url"]', 'property', 'og:url', fullUrl);
  setMeta('meta[property="og:image"]', 'property', 'og:image', fullImage);

  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description || '');
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', fullImage);

  setJsonLd('page', jsonLd || null);
}

/** Strip HTML tags + collapse whitespace. */
export function plainSummary(text, maxLen = 200) {
  if (!text) return '';
  const s = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}
