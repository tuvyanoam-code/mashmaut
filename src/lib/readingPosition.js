// Per-bulletin reading position. Saved to localStorage as the user scrolls
// so they can return mid-read on a later visit. Single key, JSON-encoded
// dictionary keyed by `${yearId}/${slug}`.
//
//   {
//     "5786/emor": {
//       pct: 0.42,             // 0..1 progress
//       top: 1240,             // scrollY in pixels (best-effort; pct is the
//                              //   source of truth — DOM may have shifted)
//       at: "2026-05-06T...",  // ISO; used for "most recent" + TTL
//       parshaName: "אמור",
//       yearId: "5786",
//       slug: "emor",
//       yearDisplay: "תשפ\"ו"
//     },
//     ...
//   }
//
// Cleared on completion (user finished the article) and on TTL expiry (30d).

const KEY = 'mashmaut.read-pos';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days
const SHOW_MIN_PCT = 0.08;                     // don't bother below 8%
const SHOW_MAX_PCT = 0.95;                     // basically done — skip

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
  catch { return {}; }
}
function write(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota */ }
}
function key(yearId, slug) { return `${yearId}/${slug}`; }
function fresh(entry) {
  if (!entry || !entry.at) return false;
  return (Date.now() - new Date(entry.at).getTime()) < TTL_MS;
}

export function saveReadingPosition(meta, pct, scrollTop) {
  if (!meta || !meta.yearId || !meta.slug) return;
  if (!Number.isFinite(pct)) return;
  // Only persist meaningful mid-reads. The completion path clears the entry,
  // so we never want to overwrite that with a "near-100% but not quite" save.
  if (pct < SHOW_MIN_PCT || pct > SHOW_MAX_PCT) return;
  const all = read();
  all[key(meta.yearId, meta.slug)] = {
    pct,
    top: Math.round(scrollTop || 0),
    at: new Date().toISOString(),
    parshaName: meta.parshaName,
    yearId: meta.yearId,
    slug: meta.slug,
    yearDisplay: meta.yearDisplay || null,
  };
  write(all);
}

export function getReadingPosition(yearId, slug) {
  const e = read()[key(yearId, slug)];
  return e && fresh(e) && e.pct >= SHOW_MIN_PCT && e.pct <= SHOW_MAX_PCT ? e : null;
}

export function clearReadingPosition(yearId, slug) {
  const all = read();
  delete all[key(yearId, slug)];
  write(all);
}

/**
 * Mark a bulletin as the most recently visited — even if the user didn't
 * actually scroll (e.g. they only opened the PDF, or they opened the text
 * page and immediately closed it). This pointer drives the home pill so it
 * always reflects the LAST bulletin the user opened, not the last one they
 * happened to leave a scroll trail in.
 *
 * If no entry exists for this bulletin yet, we create a visit-only entry
 * (no `pct`) so the home pill knows the user was here but has no position
 * to resume to — and therefore hides itself.
 */
export function markVisited(meta) {
  if (!meta || !meta.yearId || !meta.slug) return;
  const all = read();
  const k = key(meta.yearId, meta.slug);
  const existing = all[k];
  const now = new Date().toISOString();
  if (existing) {
    existing.at = now;
    // Keep pct, top, etc.
    all[k] = existing;
  } else {
    all[k] = {
      at: now,
      parshaName: meta.parshaName,
      yearId: meta.yearId,
      slug: meta.slug,
      yearDisplay: meta.yearDisplay || null,
      // pct intentionally absent — visit only.
    };
  }
  all._lastVisitedKey = k;
  write(all);
}

/**
 * The most-recently-visited bulletin entry, or null. The home pill calls
 * this and only renders if the returned entry has a `pct` worth resuming.
 */
export function getLastVisited() {
  const all = read();
  const k = all._lastVisitedKey;
  if (!k) return null;
  const entry = all[k];
  if (!entry || !fresh(entry)) return null;
  return entry;
}

/** Sweep stale entries (called opportunistically on app start). */
export function pruneStalePositions() {
  const all = read();
  let changed = false;
  for (const k of Object.keys(all)) {
    if (k === '_lastVisitedKey') continue;
    if (!fresh(all[k])) { delete all[k]; changed = true; }
  }
  if (changed) write(all);
}
