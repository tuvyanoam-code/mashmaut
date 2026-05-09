// Tiny client for the Cloudflare Worker.
// Reads the API base URL from /data/config.json so the user can change it
// in the admin "settings" page without a code edit.
//
// Override for staging: set VITE_API_BASE in `.env.local` and `npm run dev`
// will point the frontend at your staging Worker. Production builds (no
// `.env.local`) fall through to the value in config.json, so production is
// untouched.

import { loadConfig } from './store.js';

let _baseCache = null;

export async function apiBase() {
  if (_baseCache) return _baseCache;
  const override = import.meta.env && import.meta.env.VITE_API_BASE;
  if (override) {
    _baseCache = String(override).replace(/\/$/, '');
    return _baseCache;
  }
  const cfg = await loadConfig();
  _baseCache = (cfg.apiBase || '').replace(/\/$/, '');
  return _baseCache;
}

export async function apiCall(path, opts = {}) {
  const base = await apiBase();
  if (!base) throw new Error('API not configured');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export async function apiAvailable() {
  try {
    const base = await apiBase();
    if (!base) return false;
    const r = await fetch(base + '/health');
    return r.ok;
  } catch (_) {
    return false;
  }
}
