// Shared admin API helper. Wraps `apiBase()` (which respects VITE_API_BASE
// for staging) plus the bearer-token auth header and the 401-redirect logic.
// Used by admin.js, stats.js, notifications.js, and the new admin/comments.js
// so there's a single source of truth for "talk to the admin API".

import { apiBase } from './api.js';

const KEY_STORAGE = 'mashmaut.adminKey';

export function getAdminKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
}

export function setAdminKey(v) {
  try { localStorage.setItem(KEY_STORAGE, v); } catch (_) {}
}

export function clearAdminKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch (_) {}
}

/** JSON request to an /admin/* endpoint. Throws on auth/server failures. */
export async function adminCall(path, opts = {}) {
  const base = await apiBase();
  if (!base) throw new Error('API לא מוגדר');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getAdminKey(),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401) {
    clearAdminKey();
    throw new Error('סיסמה שגויה — התחבר מחדש');
  }
  // Endpoints that stream non-JSON (e.g. CSV download) shouldn't be parsed
  // here. Caller can use adminFetch() instead.
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

/** Lower-level: returns the Response so the caller can stream binary/CSV. */
export async function adminFetch(path, opts = {}) {
  const base = await apiBase();
  if (!base) throw new Error('API לא מוגדר');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + getAdminKey(),
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  if (r.status === 401) {
    clearAdminKey();
    throw new Error('סיסמה שגויה — התחבר מחדש');
  }
  return r;
}

/** Trigger a browser download from an authenticated admin endpoint. The
 *  endpoint must return the file body with appropriate Content-Type. */
export async function adminDownload(path, fallbackFilename = 'download.bin') {
  const r = await adminFetch(path);
  if (!r.ok) throw new Error('שגיאת שרת ' + r.status);
  // Try to read the filename from the Content-Disposition header so users
  // get the server-suggested name instead of the URL slug.
  const cd = r.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^"]+)"?/i);
  const filename = m ? m[1] : fallbackFilename;
  const blob = await r.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, 100);
}
