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

export async function loadIndex(force = false) {
  if (_index && !force) return _index;
  const r = await fetch(url('data/index.json'), { cache: 'no-store' });
  _index = await r.json();
  return _index;
}

export async function loadBulletin(yearId, slug) {
  const key = `${yearId}/${slug}`;
  if (_bulletinCache.has(key)) return _bulletinCache.get(key);
  const r = await fetch(url(`data/bulletins/${yearId}/${slug}.json`), { cache: 'no-store' });
  if (!r.ok) return null;
  const data = await r.json();
  _bulletinCache.set(key, data);
  return data;
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
