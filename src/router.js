// Tiny client-side router using the History API.
// Routes are registered with patterns like '/y/:year/:slug'.
// Each handler receives ({ params, query, path }) and returns/yields nothing —
// it is responsible for rendering into the #app container.

const routes = [];

// Auto-detect a GitHub Pages project sub-path. When the site is served from
// its own apex domain (alonmashmaut.org) BASE is empty.
function detectBase() {
  const { hostname, pathname } = window.location;
  const segments = pathname.split('/').filter(Boolean);
  if (/\.github\.io$/i.test(hostname) && segments.length > 0) {
    // Only treat the first segment as a base if it doesn't look like a route name
    if (!['y', 'admin', 'search', 'years'].includes(segments[0])) {
      return '/' + segments[0];
    }
  }
  return '';
}

const BASE = detectBase();
export const basePath = BASE;

export function withBase(p) {
  if (!p) return BASE + '/';
  if (/^https?:\/\//.test(p)) return p;
  if (!p.startsWith('/')) p = '/' + p;
  if (BASE && !p.startsWith(BASE)) return BASE + p;
  return p;
}

function stripBase(p) {
  if (BASE && p.startsWith(BASE)) {
    const rest = p.slice(BASE.length);
    return rest.startsWith('/') ? rest : '/' + rest;
  }
  return p;
}

export function defineRoute(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+*?^$()|[\]\\]/g, '\\$&')
        .replace(/\/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
      '/?$'
  );
  routes.push({ regex, keys, handler, pattern });
}

function parseQuery(search) {
  const out = {};
  if (!search) return out;
  const s = search.startsWith('?') ? search.slice(1) : search;
  for (const part of s.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

let currentCleanup = null;

async function dispatch() {
  let path = stripBase(window.location.pathname).replace(/\/+$/, '') || '/';
  const query = parseQuery(window.location.search);
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (_) {}
    currentCleanup = null;
  }
  for (const { regex, keys, handler } of routes) {
    const match = path.match(regex);
    if (match) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
      const result = await handler({ params, query, path });
      if (typeof result === 'function') currentCleanup = result;
      window.scrollTo(0, 0);
      return;
    }
  }
  // No match: render simple not-found
  document.getElementById('app').innerHTML = `
    <div class="page-not-found">
      <h1>הדף לא נמצא</h1>
      <p>הקישור הזה לא מוביל לעלון קיים.</p>
      <a class="btn" href="${withBase('/')}">חזרה לדף הבית</a>
    </div>`;
}

export function navigate(to) {
  const target = withBase(to);
  if (target === window.location.pathname + window.location.search) return;
  window.history.pushState({}, '', target);
  dispatch();
}

export function startRouter() {
  // Rewrite all internal links to include the base path
  if (BASE) {
    const rewrite = () => {
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || /^https?:\/\//.test(href)) return;
        if (a.dataset.baseApplied) return;
        if (href.startsWith('/') && !href.startsWith(BASE)) {
          a.setAttribute('href', BASE + href);
          a.dataset.baseApplied = '1';
        }
      });
    };
    new MutationObserver(rewrite).observe(document.body, { childList: true, subtree: true });
  }

  // Intercept clicks on internal links so they go through the router
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || a.target === '_blank' ||
        a.hasAttribute('download') || a.dataset.external === 'true') return;
    if (/^https?:\/\//.test(href)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(stripBase(href.startsWith('/') ? href : new URL(href, window.location.href).pathname));
  });
  window.addEventListener('popstate', dispatch);
  dispatch();
}

export function dispatchNow() {
  dispatch();
}
