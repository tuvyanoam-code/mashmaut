// Lightweight data layer. Loads /data/index.json and config.json once and caches.

let _index = null;
let _config = null;
const _bulletinCache = new Map();

function detectBase() {
  if (typeof window === 'undefined') return '';
  const { hostname, pathname } = window.location;
  const segments = pathname.split('/').filter(Boolean);
  if (/\.github\.io$/i.test(hostname) && segments.length > 0) {
    if (!['y', 'admin', 'search', 'years'].includes(segments[0])) {
      return '/' + segments[0];
    }
  }
  return '';
}

const BASE = detectBase();

function url(path) {
  const p = path.replace(/^\//, '');
  return (BASE ? BASE + '/' : '/') + p;
}

export async function loadConfig() {
  if (_config) return _config;
  const r = await fetch(url('data/config.json'), { cache: 'no-store' });
  _config = await r.json();
  return _config;
}

/**
 * Optimistically merge fields into the in-memory config cache. Use this in
 * the admin panel right after a successful POST /admin/config so that
 * navigating away and back reflects the just-saved values immediately —
 * without waiting the ~60s for GitHub Pages to rebuild the static file.
 */
export function patchConfig(partial) {
  if (!partial || typeof partial !== 'object') return;
  if (_config) Object.assign(_config, partial);
  else _config = { ...partial };
}

// --- Instant-publish overlay --------------------------------------------
// Freshly published bulletins live in the worker's KV (short TTL) before the
// ~1min Pages rebuild bakes them into these static files. We fetch that small
// overlay and merge it over the static index / bulletins so a new bulletin
// appears within seconds. Entirely fail-safe: any error → static-only (the
// site behaves exactly as before).

let _pending = null;          // Map<"yearId/slug", week>
let _pendingPromise = null;

async function loadPending() {
  if (_pending) return _pending;
  if (_pendingPromise) return _pendingPromise;
  _pendingPromise = (async () => {
    const m = new Map();
    try {
      const cfg = await loadConfig();
      const base = (cfg && cfg.apiBase || '').replace(/\/$/, '');
      if (base) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500); // never block the page for long
        const r = await fetch(base + '/pub/pending', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (r.ok) {
          const data = await r.json();
          for (const w of (data.items || [])) {
            if (w && w.yearId && w.slug) m.set(`${w.yearId}/${w.slug}`, w);
          }
        }
      }
    } catch (_) { /* fail-safe: no overlay */ }
    _pending = m;
    return m;
  })();
  return _pendingPromise;
}

function toSummary(w) {
  return {
    yearId: w.yearId, yearDisplay: w.yearDisplay, slug: w.slug, parshaName: w.parshaName,
    issueNumber: w.issueNumber ?? null, dateLabel: w.dateLabel ?? null, teaser: w.teaser ?? null,
    publishedAt: w.publishedAt || new Date().toISOString(), colors: w.colors || {},
    displayOrder: typeof w.displayOrder === 'number' ? w.displayOrder : 0,
  };
}

// Merge the (already-fetched) pending weeks over an index, forcing them to the
// front so a just-published bulletin reads as "latest" on the homepage.
function applyPendingToIndex(idx) {
  if (!_pending || _pending.size === 0 || !idx || !Array.isArray(idx.weeks)) return;
  const orders = idx.weeks.map((w) => (typeof w.displayOrder === 'number' ? w.displayOrder : 0));
  let minOrder = orders.length ? Math.min(0, ...orders) : 0;
  const pend = [..._pending.values()]
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  pend.forEach((w, n) => {
    const summary = toSummary(w);
    summary.displayOrder = minOrder - 1 - n; // strictly ahead of everything → newest
    if (!(idx.years || []).find((y) => y.id === w.yearId)) {
      (idx.years || (idx.years = [])).push({ id: w.yearId, displayName: w.yearDisplay });
    }
    const i = idx.weeks.findIndex((x) => x.yearId === w.yearId && x.slug === w.slug);
    if (i >= 0) idx.weeks[i] = summary; else idx.weeks.push(summary);
  });
}

export async function loadIndex(force = false) {
  if (_index && !force) return _index;
  if (force) { _pending = null; _pendingPromise = null; } // re-check the overlay
  // Static index + overlay in parallel — the overlay never adds more than its
  // short timeout to the load, and fails open to static-only.
  const [idx] = await Promise.all([
    fetch(url('data/index.json'), { cache: 'no-store' }).then((r) => r.json()),
    loadPending(),
  ]);
  _index = idx;
  applyPendingToIndex(_index);
  return _index;
}

export async function loadBulletin(yearId, slug) {
  const key = `${yearId}/${slug}`;
  if (_bulletinCache.has(key)) return _bulletinCache.get(key);
  const r = await fetch(url(`data/bulletins/${yearId}/${slug}.json`), { cache: 'no-store' });
  if (r.ok) {
    const data = await r.json();
    _bulletinCache.set(key, data);
    return data;
  }
  // Static miss — a just-published bulletin the rebuild hasn't baked in yet.
  // Fall back to the instant-publish overlay so the reading view works now.
  await loadPending();
  const pend = _pending && _pending.get(key);
  if (pend) { _bulletinCache.set(key, pend); return pend; }
  return null;
}

export function pdfUrl(yearId, slug) {
  return url(`data/bulletins/${yearId}/${slug}.pdf`);
}

export async function getLatestWeek() {
  const idx = await loadIndex();
  if (!idx.weeks || !idx.weeks.length) return null;
  // Manual order wins: the week with the smallest displayOrder is "this week".
  // Falls back to most recent publishedAt when no manual order is set.
  const withOrder = idx.weeks.filter((w) => typeof w.displayOrder === 'number');
  if (withOrder.length) {
    return [...withOrder].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  }
  return [...idx.weeks].sort((a, b) =>
    (b.publishedAt || '').localeCompare(a.publishedAt || '')
  )[0];
}

export async function getYearWeeks(yearId) {
  const idx = await loadIndex();
  return (idx.weeks || []).filter((w) => w.yearId === yearId);
}

export async function getYears() {
  const idx = await loadIndex();
  return idx.years || [];
}
