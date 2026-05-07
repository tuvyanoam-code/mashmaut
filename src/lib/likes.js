// Per-bulletin "like" toggle. The browser fingerprint (already used by
// analytics) doubles as the dedupe key — same browser can like once and
// later toggle off, but can't pad the count by clicking repeatedly.
//
// Fully optional: every call is wrapped in a try/catch and returns a safe
// default on failure, so analytics-blocked / offline users never see errors.

import { apiBase } from './api.js';

const FP_KEY = 'mashmaut.fp';

function ensureFp() {
  let fp = '';
  try { fp = localStorage.getItem(FP_KEY) || ''; } catch (_) {}
  if (!fp) {
    fp = (crypto.randomUUID && crypto.randomUUID()) ||
      (Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem(FP_KEY, fp); } catch (_) {}
  }
  return fp;
}

/** Read the current like count and whether THIS browser has liked. */
export async function getLikeState(yearId, slug) {
  try {
    const base = await apiBase();
    if (!base) return { count: 0, liked: false };
    const fp = ensureFp();
    const r = await fetch(
      `${base}/like-state?slug=${encodeURIComponent(slug)}&year=${encodeURIComponent(yearId)}&fp=${encodeURIComponent(fp)}`,
      { cache: 'no-store' }
    );
    if (!r.ok) return { count: 0, liked: false };
    const data = await r.json();
    return { count: data.count || 0, liked: !!data.liked };
  } catch { return { count: 0, liked: false }; }
}

/** Toggle the like state for this browser. Returns the updated count + liked. */
export async function toggleLike(yearId, slug) {
  try {
    const base = await apiBase();
    if (!base) return null;
    const fp = ensureFp();
    const r = await fetch(`${base}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, year: yearId, fp }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { count: data.count || 0, liked: !!data.liked };
  } catch { return null; }
}
