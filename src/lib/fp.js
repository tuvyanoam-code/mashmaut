// Browser fingerprint, shared across analytics, likes, and comments.
// Stored in localStorage as `mashmaut.fp`. Same identity is used for:
//   - server-side dedupe of analytics events (so a refresh isn't a new view)
//   - per-bulletin like toggling (so the same browser can't like twice)
//   - comment authorship + rate-limit + display-name reservation
//
// This module replaces the duplicate ensureFp() implementations that used to
// live in likes.js and analytics.js — keeping one source of truth means there
// is exactly one identity per browser.

const FP_STORAGE = 'mashmaut.fp';

export function ensureFp() {
  try {
    let fp = localStorage.getItem(FP_STORAGE);
    if (fp && /^[A-Za-z0-9_\-]{6,64}$/.test(fp)) return fp;
    // Generate a UUID-ish value. crypto.randomUUID is available in all modern
    // browsers; fall back to a random string for ancient ones.
    fp = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(FP_STORAGE, fp);
    return fp;
  } catch (_) {
    // localStorage blocked (private mode + Safari etc.) — generate ephemeral.
    return 'eph-' + Math.random().toString(36).slice(2);
  }
}
