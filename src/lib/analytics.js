// Lightweight, privacy-respecting analytics that talks to the Worker.
// We keep an anonymous browser fingerprint in localStorage so the server
// can count returning vs first-time visitors without knowing who they are.
// Sends are best-effort and silently swallow errors.

import { apiBase } from './api.js';

const FP_KEY = 'mashmaut.fp';

function fingerprint() {
  let fp = '';
  try { fp = localStorage.getItem(FP_KEY) || ''; } catch (_) {}
  if (!fp) {
    fp = (crypto.randomUUID && crypto.randomUUID()) ||
      (Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem(FP_KEY, fp); } catch (_) {}
  }
  return fp;
}

export async function track(type, ctx = {}) {
  try {
    const base = await apiBase();
    if (!base) return;
    const body = {
      type,
      slug: ctx.slug || '',
      year: ctx.year || '',
      fp: fingerprint(),
    };
    const payload = JSON.stringify(body);
    // Use sendBeacon so the request survives navigation. Important: the Blob
    // Content-Type must be a CORS-safe value (text/plain) — application/json
    // would force a preflight that some browsers silently drop for cross-
    // origin sendBeacon. The worker reads the body via request.json() which
    // parses by content, not Content-Type, so this works fine server-side.
    let beaconed = false;
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
        beaconed = navigator.sendBeacon(base + '/event', blob);
      } catch { beaconed = false; }
    }
    if (beaconed) return;
    // Fallback: keepalive fetch — also survives navigation (newer browsers).
    fetch(base + '/event', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload,
      keepalive: true,
      mode: 'cors',
    }).catch(() => {});
  } catch (_) { /* never throw from analytics */ }
}
