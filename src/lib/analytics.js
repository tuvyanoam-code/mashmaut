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
    // Use sendBeacon when possible so the request survives navigation
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon(base + '/event', blob);
      return;
    }
    fetch(base + '/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch (_) { /* never throw from analytics */ }
}
