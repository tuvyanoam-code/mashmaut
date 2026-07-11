// mashmaut-api — Cloudflare Worker
// Endpoints:
//   POST   /subscribe        { email }                       public
//   POST   /unsubscribe      { email, token? }               public (token from email)
//   POST   /event            { type, slug, year, fp }        public
//   GET    /open             ?e=<email>&s=<slug>&y=<year>    public (email-open pixel → 1×1 GIF)
//   GET    /click            ?e=&s=&y=&l=<read|pdf|share>    public (email link-click → 302 redirect)
//   GET    /admin/stats      Authorization: Bearer <key>     admin
//   GET    /admin/opens      Authorization: Bearer <key>     admin (email opens per bulletin)
//   GET    /admin/subscribers                                admin
//   POST   /admin/send-now   { yearId, slug }                admin (manual blast)
// Cron: Thursday 17:00 UTC — sends current week's bulletin to all subscribers.

const CORS = {
  // Locked to the production site. The API is bearer-authenticated; it must not
  // be usable in a browser from arbitrary origins (was '*', which let any site
  // send credentialed writes).
  'Access-Control-Allow-Origin': 'https://alonmashmaut.org',
  'Vary': 'Origin',
  // Baseline security headers on every API response.
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS,PUT',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  // Without this, browsers hide Content-Disposition from cross-origin JS,
  // and the file downloads as `download.bin` (macOS then tries to unzip it
  // and fails). Exposing the header lets the client read the suggested
  // filename (`mashmaut-stats-...csv`) and apply it via <a download>.
  'Access-Control-Expose-Headers': 'Content-Disposition',
  'Access-Control-Max-Age': '86400',
};

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS, ...(init.headers || {}) },
  });

const text = (s, status = 200) =>
  new Response(s, { status, headers: CORS });

const ok = (extra = {}) => json({ ok: true, ...extra });
const err = (msg, status = 400) => json({ ok: false, error: msg }, { status });

const today = () => new Date().toISOString().slice(0, 10);

const isEmail = (s) =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

// Constant-time string compare. Plain `===` short-circuits at the first
// differing byte, leaking — via response timing — how much of a guessed key
// is correct, which can enable byte-by-byte recovery. This compares every
// byte regardless. (Length is allowed to leak; the key is long + random.)
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authed(request, env) {
  const h = request.headers.get('Authorization') || '';
  const key = h.replace(/^Bearer\s+/i, '');
  return !!env.ADMIN_API_KEY && timingSafeEqual(key, env.ADMIN_API_KEY);
}

// --- GitHub Contents API helpers ----------------------------------------

const GH = (env, path) => `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || 'main'}`;
const GH_HEADERS = (env) => ({
  'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'mashmaut-worker',
});

async function ghGetFile(env, path) {
  // In staging, never call the GitHub API. Read JSON from the public CDN
  // instead so admin POSTs that merge with existing config/index can still
  // function (writes themselves are no-op'd in ghPutFile). For non-JSON paths
  // (PDFs, Word docs) just return null since staging never writes those back.
  if (env.STAGING_MODE === '1') {
    if (!path.endsWith('.json') || !path.startsWith('public/')) return null;
    try {
      const publicPath = path.slice('public/'.length);
      const r = await fetch(`${(env.SITE_URL || '').replace(/\/$/, '')}/${publicPath}`, { cf: { cacheTtl: 0 } });
      if (!r.ok) return null;
      const txt = await r.text();
      const b64 = btoa(unescape(encodeURIComponent(txt)));
      return { content: b64, sha: 'staging' };
    } catch (_) { return null; }
  }
  const r = await fetch(GH(env, path), { headers: GH_HEADERS(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub get ${path}: ${r.status}`);
  return r.json(); // { content, sha, ... }
}

async function ghPutFile(env, path, contentBase64, message, sha) {
  // Staging guard: never write to GitHub from the staging worker. This is the
  // primary safety net — the secondary one is GITHUB_BRANCH="staging" (no such
  // branch exists in the repo, so any leaked write would 404 anyway).
  if (env.STAGING_MODE === '1') {
    console.log('staging: ghPutFile no-op for', path);
    return { staged: true, path };
  }
  const body = {
    message,
    content: contentBase64,
    branch: env.GITHUB_BRANCH || 'main',
  };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...GH_HEADERS(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub put ${path}: ${r.status} ${t}`);
  }
  return r.json();
}

async function ghDeleteFile(env, path, sha, message) {
  if (env.STAGING_MODE === '1') {
    console.log('staging: ghDeleteFile no-op for', path);
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...GH_HEADERS(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH || 'main' }),
  });
  if (!r.ok && r.status !== 404) {
    const t = await r.text();
    throw new Error(`GitHub delete ${path}: ${r.status} ${t}`);
  }
}

async function ghReadJson(env, path) {
  const f = await ghGetFile(env, path);
  if (!f) return { data: null, sha: null };
  try {
    const decoded = atob(f.content.replace(/\n/g, ''));
    const utf8 = decodeURIComponent(escape(decoded));
    return { data: JSON.parse(utf8), sha: f.sha };
  } catch (e) {
    throw new Error(`Failed to parse ${path}: ${e.message}`);
  }
}

async function ghWriteJson(env, path, data, message) {
  const cur = await ghGetFile(env, path);
  const sha = cur ? cur.sha : null;
  const json = JSON.stringify(data, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return ghPutFile(env, path, b64, message, sha);
}

async function ghWriteBinary(env, path, base64Content, message) {
  const cur = await ghGetFile(env, path);
  const sha = cur ? cur.sha : null;
  return ghPutFile(env, path, base64Content, message, sha);
}

// --- Subscribers ---------------------------------------------------------

async function listSubscribers(env) {
  const out = [];
  let cursor;
  do {
    const res = await env.EMAILS.list({ prefix: 'sub:', cursor });
    for (const k of res.keys) {
      const v = await env.EMAILS.get(k.name, 'json');
      if (v && v.confirmed !== false) out.push(v);
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  return out;
}

async function addSubscriber(env, email, request, opts = {}) {
  const cleaned = email.trim().toLowerCase();
  const name = (opts.name || '').trim().slice(0, 120);
  const key = 'sub:' + cleaned;
  const existing = await env.EMAILS.get(key, 'json');
  if (existing) {
    // Returning subscriber: backfill a name if they now provided one and we
    // didn't have it before. Otherwise leave the record untouched.
    if (name && !existing.name) {
      existing.name = name;
      await env.EMAILS.put(key, JSON.stringify(existing));
    }
    return { existing: true, data: existing };
  }
  const token = crypto.randomUUID();
  const data = {
    email: cleaned,
    name: name || null,
    addedAt: new Date().toISOString(),
    country: request?.cf?.country || null,
    city: request?.cf?.city || null,
    source: opts.source || 'public',
    token,
  };
  await env.EMAILS.put(key, JSON.stringify(data));
  return { existing: false, data };
}

async function removeSubscriber(env, email) {
  await env.EMAILS.delete('sub:' + email.trim().toLowerCase());
}

// --- Notifications (admin inbox) -----------------------------------------
// Stored as `notif:<ISO-timestamp>:<rand>` → { type, ...payload, at }.
// Read-state is a single cursor `notif-read-until` holding the most recent
// timestamp the admin has acknowledged.

async function recordNotification(env, type, payload = {}) {
  try {
    const at = new Date().toISOString();
    const id = at + ':' + Math.random().toString(36).slice(2, 10);
    const value = { type, at, ...payload };
    // 400 days TTL — same as analytics events.
    await env.EVENTS.put('notif:' + id, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 400 });
  } catch (e) {
    console.log('notif failed:', e.message);
  }
}

async function listNotifications(env, limit = 200) {
  const out = [];
  let cursor;
  do {
    const res = await env.EVENTS.list({ prefix: 'notif:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (let i = 0; i < res.keys.length; i++) {
      const v = values[i];
      if (!v) continue;
      // Strip the leading 'notif:' to get the id.
      out.push({ id: res.keys[i].name.slice(6), ...v });
    }
    cursor = res.cursor;
    if (res.list_complete) break;
    if (out.length >= limit * 4) break;
  } while (cursor);
  // Newest first.
  out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const trimmed = out.slice(0, limit);
  const readUntil = await env.EVENTS.get('notif-read-until') || '';
  const unread = trimmed.filter((n) => (n.at || '') > readUntil).length;
  return { items: trimmed, unread, readUntil };
}

async function markNotificationsRead(env) {
  // Move the read-until cursor to "now" — everything currently in the inbox
  // is considered seen.
  const at = new Date().toISOString();
  await env.EVENTS.put('notif-read-until', at);
  return { readUntil: at };
}

// --- Events / analytics --------------------------------------------------

const VALID_EVENTS = new Set(['view', 'pdf', 'finish', 'share', 'subscribe-cta']);

async function recordEvent(env, body, request) {
  const { type, slug = '', year = '', fp = '' } = body || {};
  if (!VALID_EVENTS.has(type)) return;

  // Server-side dedupe per (fp, type, slug+year). Without this, the same
  // browser refreshing the bulletin would inflate views/finishes/PDFs, and
  // unique-vs-returning ratios would be useless.
  // 400-day TTL — same as the counters; a fp that returns after that window
  // is effectively a different browser anyway.
  if (fp) {
    const dedupeKey = `done:${type}:${year}/${slug}:${fp}`;
    const already = await env.EVENTS.get(dedupeKey);
    if (already) return;
    await env.EVENTS.put(dedupeKey, '1', { expirationTtl: 60 * 60 * 24 * 400 });
  }

  const date = today();
  const country = request?.cf?.country || 'unknown';
  const city = request?.cf?.city || '';

  // Daily counters (lightweight aggregations for the dashboard)
  const counters = [
    `cnt:${date}:type:${type}`,
    `cnt:${date}:slug:${year}/${slug}:${type}`,
    `cnt:${date}:country:${country}:${type}`,
  ];
  for (const k of counters) {
    const cur = parseInt(await env.EVENTS.get(k) || '0', 10);
    await env.EVENTS.put(k, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  }

  // City counter (only for views, to keep KV size sane)
  if (type === 'view' && city) {
    const k = `cnt:${date}:city:${country}:${city}`;
    const cur = parseInt(await env.EVENTS.get(k) || '0', 10);
    await env.EVENTS.put(k, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  }

  // Per-fingerprint visit history (to count returning visitors)
  if (fp && fp.length <= 64) {
    const k = `fp:${fp}`;
    const cur = await env.EVENTS.get(k, 'json') || { firstSeen: date, visits: 0, finished: 0, shared: 0 };
    cur.visits = (cur.visits || 0) + (type === 'view' ? 1 : 0);
    cur.finished = (cur.finished || 0) + (type === 'finish' ? 1 : 0);
    cur.shared = (cur.shared || 0) + (type === 'share' ? 1 : 0);
    cur.lastSeen = date;
    cur.country = cur.country || country;
    await env.EVENTS.put(k, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 400 });
  }
}

// --- Email open tracking -------------------------------------------------
// A 1×1 transparent GIF embedded in the weekly bulletin email. When a mail
// client loads it we record an "open" for that recipient + bulletin.
//
// CAVEAT — open tracking is directional, not exact, and this is inherent to
// every mail platform, not a bug here:
//   • Apple Mail Privacy Protection pre-fetches the pixel when the mail is
//     *received* (regardless of a real open) → over-counts + fakes geo.
//   • Gmail loads it through Google's image proxy and caches it → the IP is
//     Google's, and repeat opens by the same reader usually aren't recounted.
//   • Readers with images disabled are never counted → under-counts.
// Treat the numbers as "roughly how many / which addresses engaged".

// A 1×1 fully-transparent GIF, decoded once at module load.
const PIXEL_GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

function pixelResponse() {
  return new Response(PIXEL_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL_GIF.length),
      // Discourage caching so genuine re-opens can still reach us where the
      // mail client allows it.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...CORS,
    },
  });
}

// Record that `email` opened the bulletin `year/slug`. First open per
// (recipient, bulletin) also bumps the aggregate daily counters so opens
// flow into the existing dashboard byType/bySlug aggregations.
async function recordOpen(env, { email, slug, year, request }) {
  const clean = (email || '').trim().toLowerCase();
  // Strict, stateless validation first — caps key size and rejects junk so a
  // flood of /open requests can't explode KV with arbitrary keys.
  if (!isEmail(clean) || clean.length > 100) return;
  if (!/^[a-z0-9-]{1,40}$/.test(slug) || !/^\d{3,5}$/.test(String(year))) return;
  // Only track addresses we actually mailed: real subscribers (or the admin
  // test address). Blocks attackers forging opens for, or spamming KV with,
  // addresses that were never sent the bulletin.
  const isReal = clean === (env.ADMIN_EMAIL || '').toLowerCase()
    || !!(await env.EMAILS.get('sub:' + clean));
  if (!isReal) return;
  const ref = `${year}/${slug}`;
  const key = `open:${ref}:${clean}`;
  const now = new Date().toISOString();
  const existing = await env.EVENTS.get(key, 'json');
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastOpen = now;
    await env.EVENTS.put(key, JSON.stringify(existing), { expirationTtl: 60 * 60 * 24 * 400 });
    return;
  }
  const rec = {
    email: clean, year, slug,
    firstOpen: now, lastOpen: now, count: 1,
    country: request?.cf?.country || null,
  };
  await env.EVENTS.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 400 });
  const date = today();
  for (const k of [`cnt:${date}:type:open`, `cnt:${date}:slug:${ref}:open`]) {
    const cur = parseInt(await env.EVENTS.get(k) || '0', 10);
    await env.EVENTS.put(k, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  }
}

const CLICK_LABELS = new Set(['read', 'pdf', 'share']);

// Rebuild the click destination from a fixed label — NEVER from a
// caller-supplied URL — so /click can't be abused as an open redirect. Any
// unknown label or malformed slug/year falls back to the site home page,
// which is always a safe, same-site URL.
function clickDestination(env, { slug, year, label }) {
  const site = (env.SITE_URL || 'https://alonmashmaut.org').replace(/\/$/, '');
  const okSlug = /^[a-z0-9-]{1,40}$/.test(slug);
  const okYear = /^\d{3,5}$/.test(String(year));
  if (okSlug && okYear) {
    if (label === 'pdf') return `${site}/data/bulletins/${year}/${slug}.pdf`;
    if (label === 'read' || label === 'share') return `${site}/y/${year}/${slug}`;
  }
  return site;
}

// Record that `email` clicked a link (`label`) in the bulletin `year/slug`.
// Same anti-abuse gate as recordOpen: only real recipients, well-formed input.
// Per-recipient record keeps a per-label breakdown so "every click" detail is
// preserved; the unique-clicker aggregate (cnt:*) mirrors opens.
async function recordClick(env, { email, slug, year, label, request }) {
  const clean = (email || '').trim().toLowerCase();
  if (!isEmail(clean) || clean.length > 100) return;
  if (!/^[a-z0-9-]{1,40}$/.test(slug) || !/^\d{3,5}$/.test(String(year))) return;
  if (!CLICK_LABELS.has(label)) return;
  const isReal = clean === (env.ADMIN_EMAIL || '').toLowerCase()
    || !!(await env.EMAILS.get('sub:' + clean));
  if (!isReal) return;
  const ref = `${year}/${slug}`;
  const key = `click:${ref}:${clean}`;
  const now = new Date().toISOString();
  const existing = await env.EVENTS.get(key, 'json');
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastClick = now;
    existing.byLabel = existing.byLabel || {};
    existing.byLabel[label] = (existing.byLabel[label] || 0) + 1;
    await env.EVENTS.put(key, JSON.stringify(existing), { expirationTtl: 60 * 60 * 24 * 400 });
    return;
  }
  const rec = {
    email: clean, year, slug,
    firstClick: now, lastClick: now, count: 1,
    byLabel: { [label]: 1 },
    country: request?.cf?.country || null,
  };
  await env.EVENTS.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 400 });
  const date = today();
  for (const k of [`cnt:${date}:type:click`, `cnt:${date}:slug:${ref}:click`]) {
    const cur = parseInt(await env.EVENTS.get(k) || '0', 10);
    await env.EVENTS.put(k, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  }
}

// Merge open:* and click:* keys into per-bulletin email engagement: who
// opened, who clicked (and which links). Attaches sent counts (dispatch:*) and
// parsha names (index.json). Used by the admin panel AND the CSV archive.
async function listEngagement(env) {
  const byBulletin = {};
  const bucket = (year, slug) => {
    const ref = `${year}/${slug}`;
    return byBulletin[ref] || (byBulletin[ref] = { ref, year, slug, recipients: new Map() });
  };
  const recip = (b, email) => {
    let r = b.recipients.get(email);
    if (!r) { r = { email, opens: 0, clicks: 0, byLabel: {}, lastOpen: null, lastClick: null }; b.recipients.set(email, r); }
    return r;
  };

  let cursor;
  do {
    const res = await env.EVENTS.list({ prefix: 'open:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (const v of values) {
      if (!v) continue;
      const r = recip(bucket(v.year, v.slug), v.email);
      r.opens = v.count || 1;
      r.lastOpen = v.lastOpen || v.firstOpen || null;
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);

  cursor = undefined;
  do {
    const res = await env.EVENTS.list({ prefix: 'click:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (const v of values) {
      if (!v) continue;
      const r = recip(bucket(v.year, v.slug), v.email);
      r.clicks = v.count || 1;
      r.lastClick = v.lastClick || v.firstClick || null;
      r.byLabel = v.byLabel || {};
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);

  // Sent counts: dispatch:<date>:<slug> → { sent, at }. Keep latest per slug.
  const sentBySlug = {};
  cursor = undefined;
  do {
    const res = await env.EVENTS.list({ prefix: 'dispatch:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (let i = 0; i < res.keys.length; i++) {
      const v = values[i];
      if (!v) continue;
      const slug = res.keys[i].name.split(':')[2] || '';
      const prev = sentBySlug[slug];
      if (!prev || (v.at || '') > (prev.at || '')) sentBySlug[slug] = { sent: v.sent || 0, at: v.at };
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);

  // Parsha display names (best-effort).
  const meta = {};
  try {
    const r = await fetch(`${env.SITE_URL.replace(/\/$/, '')}/data/index.json`, { cf: { cacheTtl: 0 } });
    if (r.ok) {
      const idx = await r.json();
      for (const w of (idx.weeks || [])) {
        meta[`${w.yearId}/${w.slug}`] = { parshaName: w.parshaName, yearDisplay: w.yearDisplay, publishedAt: w.publishedAt };
      }
    }
  } catch (_) { /* names are cosmetic */ }

  // Subscriber display names (email -> full name), so the admin sees who each
  // address belongs to alongside the raw email.
  const nameByEmail = {};
  try {
    for (const s of await listSubscribers(env)) {
      if (s && s.email && s.name) nameByEmail[s.email.toLowerCase()] = s.name;
    }
  } catch (_) { /* names are cosmetic */ }

  const bulletins = Object.values(byBulletin).map((b) => {
    const m = meta[b.ref] || {};
    const sent = (sentBySlug[b.slug] || {}).sent || 0;
    const recipients = [...b.recipients.values()].map((r) => ({ ...r, name: nameByEmail[r.email] || null }));
    const opened = recipients.filter((r) => r.opens > 0).length;
    const clicked = recipients.filter((r) => r.clicks > 0).length;
    recipients.sort((a, z) =>
      (z.lastClick || z.lastOpen || '').localeCompare(a.lastClick || a.lastOpen || ''));
    return {
      ref: b.ref, year: b.year, slug: b.slug,
      parshaName: m.parshaName || b.slug,
      yearDisplay: m.yearDisplay || b.year,
      publishedAt: m.publishedAt || null,
      sent, opened, clicked,
      openRate: sent ? Math.round((opened / sent) * 100) : null,
      clickRate: sent ? Math.round((clicked / sent) * 100) : null,
      recipients,
      // Legacy field for the previously-deployed admin panel (pre-click); lets
      // the old front-end keep rendering during the worker→site rollout gap.
      openers: recipients.filter((r) => r.opens > 0)
        .map((r) => ({ email: r.email, lastOpen: r.lastOpen, count: r.opens })),
    };
  });
  bulletins.sort((a, z) =>
    (z.publishedAt || '').localeCompare(a.publishedAt || '') || z.ref.localeCompare(a.ref));
  const totalOpened = bulletins.reduce((s, b) => s + b.opened, 0);
  const totalClicked = bulletins.reduce((s, b) => s + b.clicked, 0);
  return { bulletins, totalOpened, totalClicked };
}

// In-memory cache for the admin stats dashboard. buildStats() does a full
// scan of `cnt:*` + `fp:*` (50–200+ KV reads per call); the admin clicks
// the dashboard often, so without a cache this dominates daily KV usage.
// Module-scoped: cleared on every cold start, which is fine — we just want
// to coalesce bursts of admin clicks within a 5-minute window down to a
// single KV scan. Invalidated on `/admin/stats/reset`. `?fresh=1` bypasses.
let _statsCache = null;
let _statsCacheAt = 0;
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;

async function buildStatsCached(env, { bypass = false } = {}) {
  const now = Date.now();
  if (!bypass && _statsCache && (now - _statsCacheAt) < STATS_CACHE_TTL_MS) {
    return _statsCache;
  }
  _statsCache = await buildStats(env);
  _statsCacheAt = now;
  return _statsCache;
}

function invalidateStatsCache() {
  _statsCache = null;
  _statsCacheAt = 0;
}

async function buildStats(env) {
  const byDay = {};
  const byType = {};
  const byCountry = {};
  const byCity = {};
  const bySlug = {};

  // Walk every counter key — KV list caps at 1000 per page, so paginate fully.
  let cursor;
  do {
    const res = await env.EVENTS.list({ prefix: 'cnt:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name)));
    for (let i = 0; i < res.keys.length; i++) {
      const v = parseInt(values[i] || '0', 10);
      if (!v) continue;
      const parts = res.keys[i].name.split(':'); // cnt:DATE:dim:value(:type?)
      const [, date, dim, ...rest] = parts;
      if (dim === 'type') {
        const type = rest[0];
        byDay[date] = byDay[date] || { view: 0, pdf: 0, finish: 0, share: 0, 'subscribe-cta': 0 };
        byDay[date][type] = (byDay[date][type] || 0) + v;
        byType[type] = (byType[type] || 0) + v;
      } else if (dim === 'country') {
        const country = rest[0]; const type = rest[1];
        if (type === 'view') byCountry[country] = (byCountry[country] || 0) + v;
      } else if (dim === 'city') {
        const country = rest[0]; const city = rest[1];
        const k2 = country + ' / ' + city;
        byCity[k2] = (byCity[k2] || 0) + v;
      } else if (dim === 'slug') {
        const slug = rest[0]; const type = rest[1];
        bySlug[slug] = bySlug[slug] || {};
        bySlug[slug][type] = (bySlug[slug][type] || 0) + v;
      }
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);

  // Fingerprint stats
  let unique = 0, returning = 0, finishers = 0, sharers = 0;
  cursor = undefined;
  do {
    const res = await env.EVENTS.list({ prefix: 'fp:', cursor });
    const fps = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (const fp of fps) {
      if (!fp) continue;
      unique++;
      if ((fp.visits || 0) > 1) returning++;
      if ((fp.finished || 0) > 0) finishers++;
      if ((fp.shared || 0) > 0) sharers++;
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);

  return { byDay, byType, byCountry, byCity, bySlug, unique, returning, finishers, sharers };
}

// --- Stats archive -------------------------------------------------------
// Periodically (default: weekly) snapshot the current `cnt:*` / `fp:*` /
// `done:*` keys into a CSV, store it under `archive:<isoTs>`, then wipe the
// counters. The admin can browse archives and download any of them. This
// keeps the live dashboard focused on the recent period the admin cares
// about, while preserving the full history.

const STATS_ARCHIVE_MAX = 100;     // keep most recent N archives
const ARCHIVE_TTL_DAYS = 0;        // 0 = no expiry (KV value); we trim by count.

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildStatsCsv(stats, periodStart, periodEnd, engagement) {
  const lines = [];
  lines.push(`# mashmaut stats archive`);
  lines.push(`# period_start,${csvEscape(periodStart)}`);
  lines.push(`# period_end,${csvEscape(periodEnd)}`);
  lines.push('');

  // Daily activity
  lines.push('# byDay');
  lines.push('date,view,pdf,finish,share,subscribe-cta');
  const days = Object.keys(stats.byDay || {}).sort();
  for (const d of days) {
    const row = stats.byDay[d] || {};
    lines.push([d, row.view || 0, row.pdf || 0, row.finish || 0, row.share || 0, row['subscribe-cta'] || 0].map(csvEscape).join(','));
  }
  lines.push('');

  // Per-bulletin
  lines.push('# bySlug');
  lines.push('slug,view,pdf,finish,share');
  const slugs = Object.entries(stats.bySlug || {}).sort((a, b) => (b[1].view || 0) - (a[1].view || 0));
  for (const [slug, vals] of slugs) {
    lines.push([slug, vals.view || 0, vals.pdf || 0, vals.finish || 0, vals.share || 0].map(csvEscape).join(','));
  }
  lines.push('');

  // Country
  lines.push('# byCountry');
  lines.push('country,views');
  const countries = Object.entries(stats.byCountry || {}).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of countries) lines.push([c, n].map(csvEscape).join(','));
  lines.push('');

  // City
  lines.push('# byCity');
  lines.push('country/city,views');
  const cities = Object.entries(stats.byCity || {}).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of cities) lines.push([c, n].map(csvEscape).join(','));
  lines.push('');

  // Aggregate type totals
  lines.push('# byType');
  lines.push('type,total');
  for (const [t, n] of Object.entries(stats.byType || {})) lines.push([t, n].map(csvEscape).join(','));
  lines.push('');

  // Fingerprint summary
  lines.push('# fingerprintSummary');
  lines.push('metric,value');
  lines.push(['unique_browsers', stats.unique || 0].map(csvEscape).join(','));
  lines.push(['returning_browsers', stats.returning || 0].map(csvEscape).join(','));
  lines.push(['finishers', stats.finishers || 0].map(csvEscape).join(','));
  lines.push(['sharers', stats.sharers || 0].map(csvEscape).join(','));
  lines.push('');

  // Email engagement — per bulletin (opens + clicks) and per recipient.
  const eng = (engagement && engagement.bulletins) || [];
  lines.push('# emailEngagementByBulletin');
  lines.push('parsha,year/slug,sent,opened,clicked,open_rate_pct,click_rate_pct');
  for (const b of eng) {
    lines.push([b.parshaName, b.ref, b.sent || 0, b.opened || 0, b.clicked || 0,
      b.openRate == null ? '' : b.openRate, b.clickRate == null ? '' : b.clickRate].map(csvEscape).join(','));
  }
  lines.push('');

  lines.push('# emailEngagementByRecipient');
  lines.push('parsha,year/slug,name,email,opens,clicks,click_read,click_pdf,click_share,last_open,last_click');
  for (const b of eng) {
    for (const r of (b.recipients || [])) {
      const bl = r.byLabel || {};
      lines.push([b.parshaName, b.ref, r.name || '', r.email, r.opens || 0, r.clicks || 0,
        bl.read || 0, bl.pdf || 0, bl.share || 0, r.lastOpen || '', r.lastClick || ''].map(csvEscape).join(','));
    }
  }

  // BOM so Excel opens UTF-8 cleanly with Hebrew intact.
  return '﻿' + lines.join('\n');
}

async function listArchives(env) {
  const out = [];
  let cursor;
  do {
    const res = await env.EVENTS.list({ prefix: 'archive:', cursor });
    for (const k of res.keys) {
      // Pull metadata only — don't read the (potentially large) CSV body
      // unless asked to download. We stored sizeBytes on the value itself,
      // so we have to fetch lightweight stub keys to get it. To avoid a
      // second key, we encode metadata in the value but only return the
      // header here.
      const v = await env.EVENTS.get(k.name, 'json');
      if (!v) continue;
      out.push({
        id: v.id || k.name.slice('archive:'.length),
        periodStart: v.periodStart || null,
        periodEnd: v.periodEnd || null,
        sizeBytes: v.sizeBytes || (v.csv ? v.csv.length : 0),
        createdAt: v.createdAt || v.periodEnd || null,
      });
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  // Newest first.
  out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return out;
}

async function trimArchives(env, keep = STATS_ARCHIVE_MAX) {
  const list = await listArchives(env);
  if (list.length <= keep) return 0;
  const toDelete = list.slice(keep);
  for (const a of toDelete) {
    await env.EVENTS.delete('archive:' + a.id);
  }
  return toDelete.length;
}

async function maybeArchiveStats(env, opts = {}) {
  const config = await fetchSiteConfig(env);
  const sa = (config && config.statsArchive) || {};
  if (!sa.enabled && !opts.force) return { skipped: 'archive disabled' };
  // periodDays accepts fractional values for testing convenience (e.g. 0.001).
  const periodDays = (typeof sa.periodDays === 'number' && sa.periodDays > 0) ? sa.periodDays : 7;
  const now = Date.now();
  const last = await env.EVENTS.get('last-stats-archive');
  const lastMs = last ? Date.parse(last) : 0;
  if (!opts.force && lastMs && (now - lastMs) < periodDays * 24 * 60 * 60 * 1000) {
    return { skipped: 'too soon', last, periodDays };
  }

  // Build snapshot.
  const stats = await buildStats(env);
  const engagement = await listEngagement(env);
  const periodStart = last || new Date(now - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = new Date(now).toISOString();
  const csv = buildStatsCsv(stats, periodStart, periodEnd, engagement);
  const sizeBytes = csv.length;
  const id = periodEnd;

  // 1) Write archive FIRST. If this throws, we never wipe.
  const value = { id, periodStart, periodEnd, sizeBytes, csv, createdAt: periodEnd };
  const putOpts = ARCHIVE_TTL_DAYS > 0 ? { expirationTtl: ARCHIVE_TTL_DAYS * 24 * 60 * 60 } : undefined;
  await env.EVENTS.put('archive:' + id, JSON.stringify(value), putOpts);

  // 2) Wipe analytics + email-engagement keys (same set as /admin/stats/reset).
  let deleted = 0;
  for (const prefix of ['cnt:', 'fp:', 'done:', 'open:', 'click:']) {
    let cursor;
    do {
      const res = await env.EVENTS.list({ prefix, cursor });
      for (const k of res.keys) { await env.EVENTS.delete(k.name); deleted++; }
      cursor = res.cursor;
      if (res.list_complete) break;
    } while (cursor);
  }

  // 3) Update cursor + record notification + trim old archives.
  await env.EVENTS.put('last-stats-archive', periodEnd);
  await recordNotification(env, 'stats-archived', { id, periodStart, periodEnd, sizeBytes, deleted });
  const trimmed = await trimArchives(env, STATS_ARCHIVE_MAX);
  return { ok: true, id, sizeBytes, deleted, trimmed };
}

// --- Discussions (per-bulletin threads) ----------------------------------
// Each bulletin can have many discussion *threads*. A thread has a title and
// an opening message; replies are chronological inside it. The bulletin page
// shows only the list of thread titles (with a "show" link). The full thread
// lives on its own page, so the bulletin stays uncluttered.
//
// Key map (all in EVENTS):
//   thread:<year>/<slug>:<sortableId>           → { id, title, body, author, fp, createdAt, editedAt?, lastAt, replyCount, deleted?, isAdmin? }
//   reply:<year>/<slug>/<threadId>:<sortableId> → { id, threadId, body, author, fp, createdAt, editedAt?, deleted?, isAdmin? }
//   reaction:<msgRef>:<fp>                       → emoji (msgRef = "t:<id>" or "r:<id>")
//   reactionAgg:<msgRef>                         → { "❤": n, ... }
//   name:<normalized>                            → { fp, lastSeen }     (180d TTL)
//   rl:<fp>:<unixMinute>                         → count                (90s TTL)
//   report:<msgRef>:<fp>                         → reason               (90d TTL)
//   report-count:<msgRef>                        → int

const ALLOWED_REACTIONS = new Set(['❤', '🙏', '👍', '🤔', '😮']);
const COMMENT_RATE_PER_MIN = 5;
const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;
const COMMENT_BODY_MAX = 4000;
const COMMENT_TITLE_MAX = 120;
const NAME_TTL_DAYS = 180;

const SLUG_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const YEAR_RE = /^[A-Za-z0-9_\-]{1,16}$/;
const FP_RE = /^[A-Za-z0-9_\-]{6,64}$/;
const COMMENT_ID_RE = /^[0-9]{14}-[A-Za-z0-9]{1,12}$/;

function commentSortableId() {
  const ms = Date.now().toString().padStart(14, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ms}-${rand}`;
}

function stripHtml(s) {
  return String(s == null ? '' : s).replace(/<[^>]+>/g, '');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeName(s) {
  let n = String(s || '').trim();
  if (n.normalize) n = n.normalize('NFC');
  n = n.replace(/[​-‍﻿]/g, '');
  n = n.replace(/\s+/g, ' ');
  return n.toLowerCase();
}

function isValidDisplayName(s) {
  const n = String(s || '').trim();
  if (n.length < 2 || n.length > 40) return false;
  if (/[<>]/.test(n)) return false;
  return true;
}

// Names that public posters can't claim — protects against impersonation of
// the site itself or the rabbi whose teachings are being summarized. Admins
// can override these via the rename endpoint when legitimately needed.
const FORBIDDEN_NAME_PATTERNS = [
  /משמעות/i,
  /גינזבורג/i,
  /גנזבורג/i,
  /ginzburg/i,
  /mashmaut/i,
];
function isForbiddenPublicName(s) {
  const n = normalizeName(s);
  return FORBIDDEN_NAME_PATTERNS.some((re) => re.test(n));
}

async function checkRateLimit(env, fp) {
  if (!fp) return { ok: true };
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${fp}:${minute}`;
  const cur = parseInt(await env.EVENTS.get(key) || '0', 10);
  if (cur >= COMMENT_RATE_PER_MIN) return { ok: false, retryAfterSec: 60 - (Math.floor(Date.now() / 1000) % 60) };
  await env.EVENTS.put(key, String(cur + 1), { expirationTtl: 90 });
  return { ok: true };
}

async function reserveDisplayName(env, name, fp) {
  const norm = normalizeName(name);
  if (!norm) return { ok: false, error: 'שם לא תקין' };
  const key = 'name:' + norm;
  const cur = await env.EVENTS.get(key, 'json');
  const ttl = NAME_TTL_DAYS * 24 * 60 * 60;
  if (cur && cur.fp && cur.fp !== fp) {
    return { ok: false, error: 'השם תפוס. בחר שם אחר.' };
  }
  await env.EVENTS.put(key, JSON.stringify({ fp, lastSeen: new Date().toISOString() }), { expirationTtl: ttl });
  const after = await env.EVENTS.get(key, 'json');
  if (after && after.fp && after.fp !== fp) {
    return { ok: false, error: 'השם תפוס. בחר שם אחר.' };
  }
  return { ok: true };
}

// --- thread / reply storage ---

function threadKey(year, slug, threadId) {
  return `thread:${year}/${slug}:${threadId}`;
}

function replyKey(year, slug, threadId, replyId) {
  return `reply:${year}/${slug}/${threadId}:${replyId}`;
}

async function findThread(env, year, slug, threadId) {
  if (!COMMENT_ID_RE.test(threadId)) return null;
  const key = threadKey(year, slug, threadId);
  const v = await env.EVENTS.get(key, 'json');
  return v ? { key, value: v } : null;
}

async function findReply(env, year, slug, threadId, replyId) {
  if (!COMMENT_ID_RE.test(threadId) || !COMMENT_ID_RE.test(replyId)) return null;
  const key = replyKey(year, slug, threadId, replyId);
  const v = await env.EVENTS.get(key, 'json');
  return v ? { key, value: v } : null;
}

async function listThreadsForBulletin(env, year, slug) {
  const out = [];
  let cursor;
  const prefix = `thread:${year}/${slug}:`;
  do {
    const res = await env.EVENTS.list({ prefix, cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (let i = 0; i < res.keys.length; i++) {
      const v = values[i]; if (!v) continue;
      out.push(v);
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  // Newest first — the bulletin's preview list shows the most recent on top.
  out.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  return out;
}

async function listRepliesInThread(env, year, slug, threadId) {
  const out = [];
  let cursor;
  const prefix = `reply:${year}/${slug}/${threadId}:`;
  do {
    const res = await env.EVENTS.list({ prefix, cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (let i = 0; i < res.keys.length; i++) {
      const v = values[i]; if (!v) continue;
      out.push(v);
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  // Oldest first — chronological reading order inside a thread.
  out.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return out;
}

// --- reactions (work with refs: 't:<id>' for thread, 'r:<id>' for reply) ---

function reactionRef(kind, id) { return `${kind}:${id}`; }

async function getReactionAgg(env, ref) {
  const v = await env.EVENTS.get(`reactionAgg:${ref}`, 'json');
  return v || {};
}

async function applyReaction(env, ref, fp, emoji) {
  if (emoji && !ALLOWED_REACTIONS.has(emoji)) return { ok: false, error: 'אימוג׳י לא נתמך' };
  const fpKey = `reaction:${ref}:${fp}`;
  const aggKey = `reactionAgg:${ref}`;
  const prev = await env.EVENTS.get(fpKey);
  const agg = await getReactionAgg(env, ref);
  let next;
  if (!emoji || (prev && prev === emoji)) {
    if (prev) {
      await env.EVENTS.delete(fpKey);
      agg[prev] = Math.max(0, (agg[prev] || 0) - 1);
      if (agg[prev] === 0) delete agg[prev];
    }
    next = null;
  } else {
    if (prev) {
      agg[prev] = Math.max(0, (agg[prev] || 0) - 1);
      if (agg[prev] === 0) delete agg[prev];
    }
    await env.EVENTS.put(fpKey, emoji);
    agg[emoji] = (agg[emoji] || 0) + 1;
    next = emoji;
  }
  await env.EVENTS.put(aggKey, JSON.stringify(agg));
  return { ok: true, agg, my: next };
}

async function getReactionsForThread(env, threadId, replies) {
  const out = { [threadId]: await getReactionAgg(env, reactionRef('t', threadId)) };
  for (const r of replies) {
    if (r.deleted) { out[r.id] = {}; continue; }
    out[r.id] = await getReactionAgg(env, reactionRef('r', r.id));
  }
  return out;
}

// --- create / append ---

async function createThread(env, year, slug, payload) {
  const id = commentSortableId();
  const now = new Date().toISOString();
  const full = {
    id,
    title: payload.title,
    body: payload.body,
    author: payload.author,
    fp: payload.fp,
    createdAt: now,
    lastAt: now,
    replyCount: 0,
    ...(payload.isAdmin ? { isAdmin: true } : {}),
  };
  await env.EVENTS.put(threadKey(year, slug, id), JSON.stringify(full));
  return full;
}

async function deleteByPrefix(env, prefix) {
  let cursor;
  let count = 0;
  do {
    const res = await env.EVENTS.list({ prefix, cursor });
    for (const k of res.keys) {
      await env.EVENTS.delete(k.name);
      count++;
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  return count;
}

/** Hard-delete a thread and EVERYTHING attached to it: the thread record,
 *  all replies inside it, all reactions (per-fp + aggregates), all reports
 *  (per-fp + counts) on the thread and on each reply. Then call name cleanup
 *  for every unique participant so users left with no remaining messages
 *  vanish from the moderator's "משתתפים" view too. */
async function hardDeleteThread(env, year, slug, threadId) {
  const fps = new Set();
  let removed = 0;
  // 1. Thread record + its reactions/reports.
  const t = await findThread(env, year, slug, threadId);
  if (t) {
    if (t.value.fp) fps.add(t.value.fp);
    await env.EVENTS.delete(t.key); removed++;
    removed += await deleteByPrefix(env, `reaction:t:${threadId}:`);
    await env.EVENTS.delete(`reactionAgg:t:${threadId}`);
    removed += await deleteByPrefix(env, `report:t:${threadId}:`);
    await env.EVENTS.delete(`report-count:t:${threadId}`);
  }
  // 2. All replies — also wipe their reactions/reports.
  const replies = await listRepliesInThread(env, year, slug, threadId);
  for (const r of replies) {
    if (r.fp) fps.add(r.fp);
    await env.EVENTS.delete(replyKey(year, slug, threadId, r.id)); removed++;
    removed += await deleteByPrefix(env, `reaction:r:${r.id}:`);
    await env.EVENTS.delete(`reactionAgg:r:${r.id}`);
    removed += await deleteByPrefix(env, `report:r:${r.id}:`);
    await env.EVENTS.delete(`report-count:r:${r.id}`);
  }
  // 3. Free every participant's name reservation if they have no other
  //    remaining content anywhere on the site.
  for (const fp of fps) {
    await cleanupNameIfUnused(env, fp);
  }
  return { removed, participants: fps.size };
}

/** After any deletion, see whether `fp` still owns any non-deleted message.
 *  If not, free the `name:` reservation so the now-unused name becomes
 *  available for someone else. Cheap: single pass per prefix, early-exit on
 *  first hit. */
async function cleanupNameIfUnused(env, fp) {
  if (!fp) return false;
  // Look for ANY non-deleted thread or reply by this fp.
  let cursor;
  do {
    const res = await env.EVENTS.list({ prefix: 'thread:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (const v of values) {
      if (v && v.fp === fp && !v.deleted) return false;
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  cursor = undefined;
  do {
    const res = await env.EVENTS.list({ prefix: 'reply:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (const v of values) {
      if (v && v.fp === fp && !v.deleted) return false;
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  // No remaining content — find and delete the user's name reservation(s).
  cursor = undefined;
  let removedNames = 0;
  do {
    const res = await env.EVENTS.list({ prefix: 'name:', cursor });
    const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
    for (let i = 0; i < res.keys.length; i++) {
      const v = values[i];
      if (v && v.fp === fp) {
        await env.EVENTS.delete(res.keys[i].name);
        removedNames++;
      }
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  return removedNames > 0;
}

async function appendReply(env, year, slug, threadId, payload) {
  const id = commentSortableId();
  const now = new Date().toISOString();
  const full = {
    id,
    threadId,
    body: payload.body,
    author: payload.author,
    fp: payload.fp,
    createdAt: now,
    // Optional: when the user clicked "השב" on a specific reply, replyToId
    // points at that reply's id. UI uses it to show "(בתגובה לשלמה)".
    ...(payload.replyToId ? { replyToId: payload.replyToId, replyToAuthor: payload.replyToAuthor || null } : {}),
    ...(payload.isAdmin ? { isAdmin: true } : {}),
  };
  await env.EVENTS.put(replyKey(year, slug, threadId, id), JSON.stringify(full));
  // Bump thread's lastAt + replyCount.
  const t = await findThread(env, year, slug, threadId);
  if (t) {
    const next = { ...t.value, lastAt: now, replyCount: (t.value.replyCount || 0) + 1 };
    await env.EVENTS.put(t.key, JSON.stringify(next));
  }
  return full;
}

// --- Email sending (Resend) ----------------------------------------------

async function sendEmail(env, to, subject, html, opts = {}) {
  // Staging guard: only ever send mail to the admin's own inbox. Combined with
  // FROM_EMAIL pointed at Resend's sandbox sender, this is double-protection
  // against accidentally emailing real subscribers from a staging tick.
  if (env.STAGING_MODE === '1') {
    const allow = (env.ADMIN_EMAIL || '').toLowerCase();
    const recipients = (Array.isArray(to) ? to : [to]).map((s) => String(s || '').toLowerCase());
    if (!allow || !recipients.every((r) => r === allow)) {
      console.log('staging: sendEmail blocked, recipients=', recipients);
      return { id: 'staging-noop' };
    }
  }
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
  const fromName = env.FROM_NAME || 'משמעות';
  const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
  // Replies go to the admin's real inbox, not the no-reply sender domain.
  const replyTo = env.ADMIN_EMAIL || 'alonmashmaut@gmail.com';
  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: Array.isArray(to) ? to : [to],
    reply_to: replyTo,
    subject,
    html,
  };
  // Resend supports attachments: [{ filename, content }] where content is
  // a base64 string. Callers pass attachments via opts when they want the
  // PDF (or any other file) clipped to the email.
  if (opts.attachments && opts.attachments.length) {
    payload.attachments = opts.attachments;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Resend ${r.status}: ${errText}`);
  }
  return r.json();
}

function buildBulletinEmail(env, week) {
  const url = `${env.SITE_URL.replace(/\/$/, '')}/y/${week.yearId}/${week.slug}`;
  const pdfUrl = `${env.SITE_URL.replace(/\/$/, '')}/data/bulletins/${week.yearId}/${week.slug}.pdf`;
  const apiUrl = (env.API_URL || 'https://api.alonmashmaut.org').replace(/\/$/, '');
  // Click-tracked link: routes through /click (records the click, then 302s to
  // the real destination). The destination is rebuilt server-side from the
  // `l` label — never passed as a URL param — so it can't be an open redirect.
  // `&amp;` is the HTML-attribute-correct encoding of `&`; the client decodes
  // it when fetching. {{EMAIL}} is substituted per-recipient at send time.
  const clickUrl = (label) => `${apiUrl}/click?e={{EMAIL}}&amp;s=${week.slug}&amp;y=${week.yearId}&amp;l=${label}`;
  const title = `עלון משמעות — פרשת ${week.parshaName}`;
  const teaser = (week.teaser || '').replace(/<[^>]+>/g, '');
  const colors = week.colors || {};
  const primary = colors.primary || '#2d6a4f';
  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#fbfaf7;font-family:Assistant,system-ui,sans-serif;color:#1a1a1a;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:18px;border:1px solid #ece6d8;max-width:600px;">
        <tr><td style="padding:40px 32px 28px;">
          <div style="font-size:14px;color:${primary};font-weight:600;letter-spacing:0.04em;">העלון של השבוע · ${week.yearDisplay || ''}</div>
          <h1 style="font-size:34px;margin:8px 0 12px;font-weight:800;letter-spacing:-0.02em;">פרשת ${week.parshaName}</h1>
          ${teaser ? `<p style="font-size:17px;line-height:1.6;color:#333;">${teaser}</p>` : ''}
          <div style="margin:28px 0 8px;">
            <a href="${clickUrl('read')}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">קרא באתר</a>
            <a href="${clickUrl('pdf')}" style="display:inline-block;background:#fff;color:#1a1a1a;border:1px solid #ece6d8;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;margin-right:6px;">פתח PDF</a>
          </div>
          <p style="font-size:14px;color:#888;margin-top:32px;line-height:1.5;">
            רוצה לשתף עם חבר? פשוט העבר את המייל הזה, או שלח להם את הקישור:
            <br><a href="${clickUrl('share')}" style="color:${primary};text-decoration:underline;">${url}</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #ece6d8;font-size:12px;color:#999;">
          קיבלת את המייל הזה כי נרשמת לעלון משמעות.
          <a href="${apiUrl}/unsubscribe?email={{EMAIL}}" style="color:#999;">להסרה מרשימת התפוצה</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
  <img src="${apiUrl}/open?e={{EMAIL}}&amp;s=${week.slug}&amp;y=${week.yearId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;max-height:1px;overflow:hidden;line-height:1px;border:0;opacity:0;" />
</body>
</html>`;
  return { subject: title, html };
}

// Fetch the bulletin PDF and return it as a Uint8Array. Returns null if
// the file is missing or unreachable — caller decides whether to send
// the email without an attachment or to abort.
async function fetchBulletinPdf(env, week) {
  const url = `${env.SITE_URL.replace(/\/$/, '')}/data/bulletins/${week.yearId}/${week.slug}.pdf`;
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

// btoa() in Workers handles strings only; for binary data we manually
// chunk the byte array to avoid the "Invalid character" issues that
// come from spreading large Uint8Arrays into String.fromCharCode.
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchLatestBulletin(env) {
  const r = await fetch(`${env.SITE_URL.replace(/\/$/, '')}/data/index.json`, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('cannot fetch index');
  const idx = await r.json();
  const weeks = idx.weeks || [];
  if (!weeks.length) return null;
  const withOrder = weeks.filter((w) => typeof w.displayOrder === 'number');
  const latest = withOrder.length
    ? withOrder.sort((a, b) => a.displayOrder - b.displayOrder)[0]
    : weeks.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))[0];
  // Load full bulletin to get teaser
  const r2 = await fetch(`${env.SITE_URL.replace(/\/$/, '')}/data/bulletins/${latest.yearId}/${latest.slug}.json`, { cf: { cacheTtl: 0 } });
  if (r2.ok) {
    const full = await r2.json();
    return { ...latest, teaser: full.teaser, colors: full.colors };
  }
  return latest;
}

async function fetchSiteConfig(env) {
  try {
    const r = await fetch(`${env.SITE_URL.replace(/\/$/, '')}/data/config.json`, { cf: { cacheTtl: 0 } });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

// Default schedule when none is set: Thursday 19:00 Israel time.
const DEFAULT_SCHEDULE = {
  enabled: true,
  dayOfWeek: 4,       // 0=Sunday … 4=Thursday … 6=Saturday
  hour: 19,           // local Israel hour
  requireApproval: false,
};

function getSchedule(config) {
  const s = (config && config.dispatchSchedule) || {};
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SCHEDULE.enabled,
    dayOfWeek: Number.isInteger(s.dayOfWeek) ? s.dayOfWeek : DEFAULT_SCHEDULE.dayOfWeek,
    hour: Number.isInteger(s.hour) ? s.hour : DEFAULT_SCHEDULE.hour,
    requireApproval: !!s.requireApproval,
  };
}

// Get the current Israel-local Date by re-parsing a timezone-coerced string.
// JS doesn't expose timezone-aware Date objects, but this trick is reliable
// for read-only inspection of weekday/hour.
function israelNow() {
  const localized = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  return new Date(localized);
}

// ISO-week-style key that flips at the schedule day, used to dedupe sends.
function weekKey() {
  const il = israelNow();
  // Year-month-day works fine — we'll pair it with the bulletin slug.
  return il.toISOString().slice(0, 10);
}

// Resend free tier: 2 requests/second. Without spacing, ~4-5 sends per second
// would race past that and the surplus would 429. 700ms between sends keeps
// us at ~1.4/sec — safely under the cap.
const SEND_THROTTLE_MS = 700;

async function sendBulletinToAll(env) {
  const week = await fetchLatestBulletin(env);
  if (!week) return { ok: false, error: 'no bulletin' };
  const subs = await listSubscribers(env);
  if (!subs.length) return { ok: true, sent: 0 };
  const tpl = buildBulletinEmail(env, week);

  // Fetch the PDF once and reuse for every recipient. We base64-encode it
  // here (Resend's attachment format) rather than letting each send make
  // its own copy. If the fetch fails, we still send the email — just
  // without an attachment — so a broken PDF link doesn't block dispatch.
  let attachments;
  try {
    const pdfBytes = await fetchBulletinPdf(env, week);
    if (pdfBytes) {
      attachments = [{
        filename: `${week.parshaName || week.slug}.pdf`,
        content: bytesToBase64(pdfBytes),
      }];
    }
  } catch (e) {
    console.log('PDF attachment fetch failed:', e.message);
  }

  let sent = 0, failed = 0;
  const failures = [];
  // Send sequentially with throttling to respect Resend's rate limit.
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    try {
      const html = tpl.html.replace(/\{\{EMAIL\}\}/g, encodeURIComponent(s.email));
      await sendEmail(env, s.email, tpl.subject, html, { attachments });
      sent++;
    } catch (e) {
      failed++;
      failures.push({ email: s.email, error: e.message });
      console.log('send failed for', s.email, e.message);
    }
    if (i < subs.length - 1) await new Promise((r) => setTimeout(r, SEND_THROTTLE_MS));
  }
  // Log the dispatch + admin notification + last-sent marker (for week dedupe).
  await env.EVENTS.put(`dispatch:${today()}:${week.slug}`, JSON.stringify({ sent, failed, at: new Date().toISOString() }));
  await env.EVENTS.put('last-sent', JSON.stringify({
    slug: week.slug, yearId: week.yearId, at: new Date().toISOString(),
  }));
  await recordNotification(env, 'bulletin-sent', {
    slug: week.slug,
    parshaName: week.parshaName,
    yearDisplay: week.yearDisplay || null,
    sent,
    failed,
  });
  return { ok: true, sent, failed, failures };
}

// --- Reply email notifications ----------------------------------------
//
// When a reply is posted, we identify every participant who might want
// to know about it (by `mode` stored in `prefs:{fp}`) and queue a
// "pending notification" for each. A cron task pops pending entries
// older than NOTIF_DELAY_MS and checks whether the user has since
// "seen" the thread (timestamp stored in `seen:{fp}:{threadId}`). If
// they've seen the reply already, the email is skipped — no need to
// nag about something they read on the site.
//
// Modes (from emailPrefs.js, mirrored here):
//   off      — never email
//   mention  — only when target was @mentioned or replied to directly
//   admin    — only when the reply is from the admin/moderator
//   all      — every new reply in any thread the user participated in

const NOTIF_DELAY_MS = 5 * 60 * 1000;   // 5 minutes
const NOTIF_TTL_S    = 7 * 24 * 60 * 60; // 7 days — drop stale pending entries

// --- Prefs: { email, mode, opted, updatedAt } per fp ---
async function savePrefs(env, fp, patch) {
  if (!FP_RE.test(fp)) return null;
  const existing = (await loadPrefs(env, fp)) || { email: '', mode: 'off', opted: false };
  const next = {
    email: typeof patch.email === 'string' ? String(patch.email).trim().toLowerCase() : existing.email,
    mode: ['off', 'mention', 'admin', 'all'].includes(patch.mode) ? patch.mode : existing.mode,
    opted: !!(patch.opted ?? existing.opted),
    updatedAt: new Date().toISOString(),
  };
  // Normalize: no email → mode must be 'off' (can't send without an address).
  if (!next.email) next.mode = 'off';
  await env.EVENTS.put(`prefs:${fp}`, JSON.stringify(next));
  return next;
}
async function loadPrefs(env, fp) {
  if (!FP_RE.test(fp)) return null;
  return env.EVENTS.get(`prefs:${fp}`, 'json');
}

// --- Seen: ISO timestamp of last view per (fp, threadId) ---
async function markThreadSeen(env, fp, year, slug, threadId) {
  if (!FP_RE.test(fp) || !COMMENT_ID_RE.test(threadId)) return;
  // 90-day TTL — long enough to cover any reasonable "did I see this" window.
  await env.EVENTS.put(`seen:${fp}:${threadId}`, new Date().toISOString(), {
    expirationTtl: 90 * 24 * 60 * 60,
  });
}
async function getSeenAt(env, fp, threadId) {
  return env.EVENTS.get(`seen:${fp}:${threadId}`);
}

// --- Unread mentions per fp (for the home-page badge) ---
async function addUnreadMention(env, targetFp, mention) {
  const key = `mention:unread:${targetFp}`;
  const arr = (await env.EVENTS.get(key, 'json')) || [];
  arr.push(mention);
  // Cap to prevent unbounded growth (worst case: someone never visits).
  await env.EVENTS.put(key, JSON.stringify(arr.slice(-50)), {
    expirationTtl: 90 * 24 * 60 * 60,
  });
}
async function clearUnreadMentionsForThread(env, targetFp, threadId) {
  const key = `mention:unread:${targetFp}`;
  const arr = (await env.EVENTS.get(key, 'json')) || [];
  const next = arr.filter((m) => m.threadId !== threadId);
  if (next.length === arr.length) return; // no-op
  if (next.length === 0) await env.EVENTS.delete(key);
  else await env.EVENTS.put(key, JSON.stringify(next), { expirationTtl: 90 * 24 * 60 * 60 });
}

// --- Pending notifications queue ---
// Key shape: `notif:pending:{ISO ts}:{noteId}` — the ts prefix makes the
// list naturally sortable, so the cron processor can stop as soon as it
// hits a future entry.
async function enqueueNotification(env, note) {
  const ts = note.createdAt || new Date().toISOString();
  const noteId = note.replyId + '-' + note.targetFp;
  await env.EVENTS.put(
    `notif:pending:${ts}:${noteId}`,
    JSON.stringify({ ...note, createdAt: ts }),
    { expirationTtl: NOTIF_TTL_S },
  );
}

// Walk the participants of a thread, figure out who wants a notification
// for this reply (based on their stored prefs), and enqueue one entry
// per target. The poster themselves is always skipped.
//
//   year, slug, threadId          location of the reply
//   reply                         the saved reply { id, body, author, fp, isAdmin, replyToId, replyToAuthor }
//   thread                        the thread { id, title, fp: opener, ... }
//   replies                       all replies in the thread (already loaded by caller)
//   mentions                      names the poster @-mentioned (validated against participants)
async function enqueueRepliesNotifications(env, { year, slug, threadId, parshaName, thread, replies, reply, mentions }) {
  // Build a unique set of {fp, displayName} for everyone in the thread,
  // excluding the poster (their own reply, no notification).
  const seen = new Set();
  const participants = [];
  const consider = (m) => {
    if (!m || !m.fp || m.deleted) return;
    if (m.fp === reply.fp) return;
    if (seen.has(m.fp)) return;
    seen.add(m.fp);
    participants.push({ fp: m.fp, author: m.author, isAdmin: !!m.isAdmin });
  };
  consider(thread);
  (replies || []).forEach(consider);

  // Did the new reply target a specific reply? If so, that author gets a
  // "direct reply" notification regardless of their other settings (as
  // long as they didn't opt all the way off).
  let directReplyFp = null;
  if (reply.replyToId) {
    const target = (replies || []).find((r) => r.id === reply.replyToId)
      || (thread.id === reply.replyToId ? thread : null);
    if (target) directReplyFp = target.fp;
  }
  const mentionSet = new Set((mentions || []).map((s) => String(s)));

  for (const p of participants) {
    const prefs = await loadPrefs(env, p.fp);
    if (!prefs || !prefs.email || prefs.mode === 'off') continue;
    // The thread opener is always treated as a "direct" target — every
    // reply in their thread is for them. Otherwise people only get an
    // email when someone clicks "השב" on their specific reply, which
    // misses the common case of a top-level reply to the opener's
    // original post.
    const isOpener = !!(thread && thread.fp === p.fp);
    const isDirect = isOpener || directReplyFp === p.fp;
    const isMention = mentionSet.has(p.author);
    const isAdminReply = !!reply.isAdmin;
    // Pick the *strongest* applicable notifyType for this user. Order:
    // direct > mention > admin > thread-update.
    let notifyType = null;
    if (isDirect) notifyType = 'direct';
    else if (isMention) notifyType = 'mention';
    else if (prefs.mode === 'all') notifyType = 'thread-update';
    else if (prefs.mode === 'admin' && isAdminReply) notifyType = 'admin';
    if (!notifyType) continue;
    // Mode-based filtering: even if there's a matching type, respect the
    // user's chosen narrowness. `mention` mode only accepts mention/direct;
    // `admin` mode accepts admin/mention/direct.
    if (prefs.mode === 'mention' && !(isDirect || isMention)) continue;
    if (prefs.mode === 'admin' && !(isAdminReply || isDirect || isMention)) continue;

    await enqueueNotification(env, {
      year, slug, threadId,
      parshaName,
      threadTitle: thread.title || '',
      replyId: reply.id,
      replyAuthor: reply.author,
      replyBody: (reply.body || '').slice(0, 600),
      replyIsAdmin: !!reply.isAdmin,
      targetFp: p.fp,
      targetEmail: prefs.email,
      notifyType,
      createdAt: new Date().toISOString(),
    });

    // Track unread mentions separately so the home page can show a badge.
    if (notifyType === 'mention' || notifyType === 'direct') {
      await addUnreadMention(env, p.fp, {
        year, slug, threadId, replyId: reply.id,
        replyAuthor: reply.author, threadTitle: thread.title || '',
        parshaName, at: new Date().toISOString(),
      });
    }
  }
}

// Cron task: pop every pending notification older than NOTIF_DELAY_MS,
// skip those whose target has since "seen" the thread, send the rest.
async function processPendingNotifications(env) {
  const cutoff = new Date(Date.now() - NOTIF_DELAY_MS).toISOString();
  let sent = 0, skipped = 0, failed = 0;
  let cursor;
  const PREFIX = 'notif:pending:';
  do {
    const res = await env.EVENTS.list({ prefix: PREFIX, cursor, limit: 200 });
    for (const k of res.keys) {
      // Key format: `notif:pending:{ISO ts}:{noteId}`.
      // The ISO ts itself contains colons (e.g. `2026-05-19T12:10:51.589Z`),
      // so `split(':')` truncates it. Strip the fixed prefix and take
      // everything up to the LAST colon as ts; the tail is the noteId.
      const rest = k.name.slice(PREFIX.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon === -1) continue;
      const ts = rest.slice(0, lastColon);
      if (!ts || ts > cutoff) continue; // not yet ready
      const note = await env.EVENTS.get(k.name, 'json');
      if (!note) { await env.EVENTS.delete(k.name); continue; }
      try {
        // Skip if the target has seen the thread AFTER this reply was posted.
        const seenAt = await getSeenAt(env, note.targetFp, note.threadId);
        if (seenAt && seenAt >= note.createdAt) {
          await env.EVENTS.delete(k.name);
          skipped++;
          continue;
        }
        const tpl = buildReplyNotificationEmail(env, note);
        await sendEmail(env, note.targetEmail, tpl.subject, tpl.html);
        sent++;
        await env.EVENTS.delete(k.name);
      } catch (e) {
        failed++;
        console.log('notif send failed:', k.name, e.message);
        // Leave the entry in place — retry next tick. The TTL caps how
        // many retries we'll do over the entry's lifetime.
      }
      // Light throttling between sends.
      await new Promise((r) => setTimeout(r, 250));
    }
    cursor = res.cursor;
    if (res.list_complete) break;
  } while (cursor);
  return { sent, skipped, failed };
}

function buildReplyNotificationEmail(env, note) {
  const site = env.SITE_URL.replace(/\/$/, '');
  const threadUrl = `${site}/y/${note.year}/${note.slug}/discuss/${note.threadId}`;
  const reasons = {
    direct: 'מישהו ענה ישירות להודעה שלך',
    mention: 'מישהו הזכיר אותך בתגובה',
    admin: 'מנהל האתר השיב בשיחה שאתה משתתף בה',
    'thread-update': 'יש תגובה חדשה בשיחה שאתה משתתף בה',
  };
  const reason = reasons[note.notifyType] || 'יש לך תגובה חדשה';
  // Subject is consistent across notification types — the *body's* eyebrow
  // shows which reason fired (mention / direct / admin / thread-update).
  // The subject leads with the thread title so the inbox preview is
  // immediately useful.
  const subject = `קיבלת תגובה להודעה שלך: ${note.threadTitle || '(שיחה)'}`;
  const escaped = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bodyPreview = escaped(note.replyBody).slice(0, 400);
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>${escaped(subject)}</title></head>
<body style="margin:0;padding:24px;background:#fbfaf7;font-family:Assistant,system-ui,sans-serif;color:#1a1a1a;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:18px;border:1px solid #ece6d8;max-width:560px;">
        <tr><td style="padding:32px 28px 24px;">
          <div style="font-size:13px;color:#6f675b;font-weight:500;letter-spacing:.04em;">${escaped(reason)}</div>
          ${note.threadTitle ? `<h2 style="font-size:22px;margin:8px 0 16px;font-weight:700;">${escaped(note.threadTitle)}</h2>` : ''}
          <div style="background:#fef9f0;border-inline-start:3px solid #f59c66;padding:12px 16px;border-radius:6px;font-size:15px;line-height:1.6;color:#2a2722;">
            <div style="font-weight:600;font-size:13px;color:#6f675b;margin-bottom:4px;">${escaped(note.replyAuthor || '')}${note.replyIsAdmin ? ' · מנהל' : ''}</div>
            ${bodyPreview.replace(/\n/g, '<br>')}
          </div>
          <div style="margin:24px 0 8px;">
            <a href="${threadUrl}" style="display:inline-block;background:#2d6a4f;color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:15px;">לפתוח את השיחה</a>
          </div>
          <p style="font-size:12px;color:#999;margin:28px 0 0;line-height:1.6;">
            אתה מקבל את ההודעה הזו כי הצטרפת לשיחה הזו וביקשת התראות במייל.
            תוכל לשנות את ההעדפות בכל זמן בעמוד ההגדרות שבתוך השיחות.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}

// Decide what to do when the hourly cron fires. Honors the user's schedule
// (day/hour in Israel time), an "automatic dispatch off" toggle, an "approval
// required" gate, and a per-bulletin dedupe so we never double-send.
async function maybeSendOnSchedule(env) {
  const config = await fetchSiteConfig(env);
  const sched = getSchedule(config);
  if (!sched.enabled) return { skipped: 'auto-dispatch disabled' };

  const il = israelNow();
  if (il.getDay() !== sched.dayOfWeek) return { skipped: `wrong day (${il.getDay()} vs ${sched.dayOfWeek})` };
  if (il.getHours() !== sched.hour) return { skipped: `wrong hour (${il.getHours()} vs ${sched.hour})` };

  const week = await fetchLatestBulletin(env);
  if (!week) return { skipped: 'no bulletin' };

  // Dedupe: skip if we already sent this exact bulletin.
  const lastSent = await env.EVENTS.get('last-sent', 'json');
  if (lastSent && lastSent.slug === week.slug && lastSent.yearId === week.yearId) {
    return { skipped: 'already-sent', slug: week.slug };
  }
  // Also skip if a pending-approval already exists for this bulletin.
  const pending = await env.EVENTS.get('pending-dispatch', 'json');
  if (pending && pending.slug === week.slug && pending.yearId === week.yearId) {
    return { skipped: 'pending-approval', slug: week.slug };
  }

  if (sched.requireApproval) {
    const payload = {
      slug: week.slug,
      yearId: week.yearId,
      yearDisplay: week.yearDisplay || null,
      parshaName: week.parshaName,
      scheduledAt: new Date().toISOString(),
    };
    await env.EVENTS.put('pending-dispatch', JSON.stringify(payload));
    await recordNotification(env, 'dispatch-pending', payload);
    return { pending: true, slug: week.slug };
  }

  return await sendBulletinToAll(env);
}

// --- Routing -------------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return text('', 204);
    const url = new URL(request.url);
    const p = url.pathname;

    try {
      if (p === '/' || p === '/health') return ok({ name: 'mashmaut-api' });

      if (p === '/subscribe' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!isEmail(body.email)) return err('כתובת מייל לא תקינה');
        // Name is required by the signup form, but the server stays lenient so
        // a cached/old client (SPA tab opened before this change) can still
        // subscribe rather than erroring out — it just won't have a name.
        const subName = (body.name || '').trim();
        const { existing, data } = await addSubscriber(env, body.email, request, { source: 'public', name: subName });
        if (!existing) {
          // Record an admin notification (only for genuine new signups).
          await recordNotification(env, 'subscribe', {
            email: data.email,
            name: data.name || null,
            country: data.country || null,
            city: data.city || null,
          });
          // Send a welcome email
          try {
            const apiBase = (env.API_URL || 'https://api.alonmashmaut.org').replace(/\/$/, '');
            const link = `${apiBase}/unsubscribe?email=${encodeURIComponent(data.email)}&token=${data.token}`;
            const greet = data.name ? ` ${escapeHtml(data.name)}` : '';
            await sendEmail(env, data.email,
              `ברוך הבא לעלון משמעות`,
              `<div dir="rtl" style="font-family:Assistant,system-ui,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.6;">
                <p>תודה${greet} שנרשמת לעלון <b>משמעות</b>.</p>
                <p>בכל יום חמישי בערב נשלח לך את העלון של השבוע.</p>
                <p style="font-size:13px;color:#888;">להסרה מרשימת התפוצה: <a href="${link}">לחץ כאן</a></p>
              </div>`);
          } catch (_) { /* best-effort */ }
        }
        return ok({ subscribed: true });
      }

      if ((p === '/unsubscribe' && (request.method === 'POST' || request.method === 'GET'))) {
        const params = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
        const email = params.email;
        if (!isEmail(email)) return err('email required');
        const cleaned = email.trim().toLowerCase();
        const existed = await env.EMAILS.get('sub:' + cleaned);
        await removeSubscriber(env, email);
        if (existed) await recordNotification(env, 'unsubscribe', { email: cleaned });
        if (request.method === 'GET') {
          const siteUrl = env.SITE_URL || 'https://alonmashmaut.org';
          const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הוסרת מרשימת התפוצה — עלון משמעות</title>
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { margin:0; font-family:Assistant,system-ui,sans-serif; background:#fbfaf7; color:#1a1a1a; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { background:#fff; border:1px solid #ece6d8; border-radius:18px; padding:36px 28px; max-width:440px; width:100%; text-align:center; box-shadow:0 6px 24px rgba(20,20,20,.07); }
    h1 { margin:0 0 8px; font-size:1.6rem; }
    p { color:#666; line-height:1.6; margin:8px 0; }
    .check { width:60px; height:60px; border-radius:50%; background:#e0f0e7; color:#2d6a4f; display:inline-flex; align-items:center; justify-content:center; margin:0 auto 16px; }
    .check svg { width:32px; height:32px; }
    .home { display:inline-block; margin-top:16px; padding:10px 22px; background:#2d6a4f; color:#fff; text-decoration:none; border-radius:999px; font-weight:600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
    <h1>הוסרת מרשימת התפוצה</h1>
    <p>הכתובת <b>${email}</b> לא תקבל יותר מיילים מעלון משמעות.</p>
    <p>אם נרשמת בטעות או שינית דעתך, אפשר להירשם מחדש דרך האתר בכל שלב.</p>
    <a class="home" href="${siteUrl}">חזרה לאתר</a>
  </div>
</body>
</html>`;
          return new Response(html, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' },
          });
        }
        return ok();
      }

      if (p === '/event' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        await recordEvent(env, body, request);
        return ok();
      }

      // Email open-tracking pixel. Always return the GIF — a tracking failure
      // must never surface as a broken image in the recipient's mail client.
      if (p === '/open' && request.method === 'GET') {
        try {
          await recordOpen(env, {
            email: url.searchParams.get('e') || '',
            slug: url.searchParams.get('s') || '',
            year: url.searchParams.get('y') || '',
            request,
          });
        } catch (_) { /* best-effort */ }
        return pixelResponse();
      }

      // Email link-click tracking. Records the click, then 302-redirects to a
      // destination rebuilt server-side from the `l` label (never a caller URL,
      // so this is not an open redirect). Redirects even if recording fails.
      if (p === '/click' && request.method === 'GET') {
        const slug = url.searchParams.get('s') || '';
        const year = url.searchParams.get('y') || '';
        const label = url.searchParams.get('l') || '';
        const dest = clickDestination(env, { slug, year, label });
        try {
          await recordClick(env, {
            email: url.searchParams.get('e') || '',
            slug, year, label, request,
          });
        } catch (_) { /* best-effort */ }
        return Response.redirect(dest, 302);
      }

      // --- Likes (public; per-fp dedupe) ---------------------------------

      if (p === '/like-state' && request.method === 'GET') {
        const slug = url.searchParams.get('slug') || '';
        const year = url.searchParams.get('year') || '';
        const fp = url.searchParams.get('fp') || '';
        if (!slug || !year) return err('slug + year required');
        const countKey = `like-count:${year}/${slug}`;
        const count = parseInt(await env.EVENTS.get(countKey) || '0', 10);
        let liked = false;
        if (fp) {
          liked = !!(await env.EVENTS.get(`like-fp:${year}/${slug}:${fp}`));
        }
        return ok({ count, liked });
      }

      if (p === '/like' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { slug = '', year = '', fp = '' } = body;
        if (!slug || !year || !fp) return err('slug + year + fp required');
        const countKey = `like-count:${year}/${slug}`;
        const fpKey = `like-fp:${year}/${slug}:${fp}`;
        const already = await env.EVENTS.get(fpKey);
        let count = parseInt(await env.EVENTS.get(countKey) || '0', 10);
        let liked;
        if (already) {
          // Toggle off.
          await env.EVENTS.delete(fpKey);
          count = Math.max(0, count - 1);
          liked = false;
        } else {
          // Toggle on (no TTL — persists indefinitely so the user can't
          // double-like by waiting a TTL window).
          await env.EVENTS.put(fpKey, '1');
          count = count + 1;
          liked = true;
        }
        await env.EVENTS.put(countKey, String(count));
        return ok({ count, liked });
      }

      // --- Discussions (public; per-bulletin threads) -------------------

      // List all threads for a bulletin (lightweight — for the bulletin's
      // preview list. Doesn't include reply bodies).
      // --- Notification prefs (called by frontend on opt-in / settings change) ---
      if (p === '/discuss/prefs' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const fp = String(body.fp || '');
        if (!FP_RE.test(fp)) return err('fp invalid');
        // email may be empty (= unsubscribe / off). Mode falls back to off.
        const saved = await savePrefs(env, fp, {
          email: body.email,
          mode: body.mode,
          opted: true,
        });
        return ok({ prefs: saved });
      }

      // Mark a thread as "seen" by this fp. Called when the user opens
      // the thread page; the timestamp is compared against pending
      // notifications by the cron processor.
      if (p.startsWith('/discuss/seen/') && request.method === 'POST') {
        const threadId = p.slice('/discuss/seen/'.length);
        const body = await request.json().catch(() => ({}));
        const fp = String(body.fp || '');
        const year = String(body.year || '');
        const slug = String(body.slug || '');
        if (!FP_RE.test(fp) || !COMMENT_ID_RE.test(threadId)) return err('invalid');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('invalid');
        await markThreadSeen(env, fp, year, slug, threadId);
        await clearUnreadMentionsForThread(env, fp, threadId);
        return ok({ at: new Date().toISOString() });
      }

      // Unread mentions count + list for the home-page badge.
      if (p === '/discuss/mentions' && request.method === 'GET') {
        const fp = url.searchParams.get('fp') || '';
        if (!FP_RE.test(fp)) return err('fp invalid');
        const list = (await env.EVENTS.get(`mention:unread:${fp}`, 'json')) || [];
        return ok({ count: list.length, mentions: list });
      }

      if (p === '/discuss/threads' && request.method === 'GET') {
        const slug = url.searchParams.get('slug') || '';
        const year = url.searchParams.get('year') || '';
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year required');
        const threads = await listThreadsForBulletin(env, year, slug);
        // Strip the body from the preview list — it's loaded only when the
        // user opens an individual thread.
        const lite = threads.map((t) => ({
          id: t.id, title: t.title, author: t.author,
          createdAt: t.createdAt, lastAt: t.lastAt, replyCount: t.replyCount || 0,
          deleted: !!t.deleted, isAdmin: !!t.isAdmin,
        }));
        return ok({ threads: lite });
      }

      // Open a new thread.
      if (p === '/discuss/threads' && request.method === 'POST') {
        const config = await fetchSiteConfig(env);
        if (config && config.commentsEnabled === false) return err('comments disabled', 403);
        const body = await request.json().catch(() => ({}));
        if (body.honeypot) return ok({ ignored: true });
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const fp = String(body.fp || '');
        const author = String(body.displayName || '').trim();
        const title = String(body.title || '').trim();
        const text = String(body.body || '').trim();
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!isValidDisplayName(author)) return err('שם תצוגה לא תקין (2–40 תווים)');
        if (isForbiddenPublicName(author)) return err('השם הזה שמור. בחר שם אחר.', 409);
        if (!title || title.length > COMMENT_TITLE_MAX) return err(`כותרת חסרה או ארוכה (עד ${COMMENT_TITLE_MAX})`);
        if (!text || text.length > COMMENT_BODY_MAX) return err(`תוכן חסר או ארוך מדי (עד ${COMMENT_BODY_MAX})`);
        const rl = await checkRateLimit(env, fp);
        if (!rl.ok) return err('יותר מדי הודעות. נסה שוב בעוד דקה.', 429);
        const reserved = await reserveDisplayName(env, author, fp);
        if (!reserved.ok) return err(reserved.error, 409);
        const cleanTitle = stripHtml(title).slice(0, COMMENT_TITLE_MAX);
        const cleanBody = stripHtml(text).slice(0, COMMENT_BODY_MAX);
        const saved = await createThread(env, year, slug, { title: cleanTitle, body: cleanBody, author, fp });
        // Persist the poster's notification prefs (from the onboarding
        // popup). No notifications enqueued — they're the only person in
        // the thread so far. Mark them as seen so they don't get notified
        // about replies that arrived while they're still on the page.
        if (body.emailPrefs && typeof body.emailPrefs === 'object') {
          await savePrefs(env, fp, body.emailPrefs);
        }
        await markThreadSeen(env, fp, year, slug, saved.id);
        return ok({ thread: saved });
      }

      // Read one full thread (header + replies + reactions).
      if (p.startsWith('/discuss/threads/') && !p.endsWith('/reply') && !p.endsWith('/react') && !p.endsWith('/report') && request.method === 'GET') {
        const threadId = p.slice('/discuss/threads/'.length);
        const slug = url.searchParams.get('slug') || '';
        const year = url.searchParams.get('year') || '';
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year required');
        if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
        const t = await findThread(env, year, slug, threadId);
        if (!t) return err('thread not found', 404);
        const replies = await listRepliesInThread(env, year, slug, threadId);
        const reactions = await getReactionsForThread(env, threadId, replies);
        return ok({ thread: t.value, replies, reactions });
      }

      // Reply to a thread.
      if (p.startsWith('/discuss/threads/') && p.endsWith('/reply') && request.method === 'POST') {
        const config = await fetchSiteConfig(env);
        if (config && config.commentsEnabled === false) return err('comments disabled', 403);
        const threadId = p.slice('/discuss/threads/'.length, -'/reply'.length);
        const body = await request.json().catch(() => ({}));
        if (body.honeypot) return ok({ ignored: true });
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const fp = String(body.fp || '');
        const author = String(body.displayName || '').trim();
        const text = String(body.body || '').trim();
        const replyToId = body.replyToId ? String(body.replyToId) : null;
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
        if (!isValidDisplayName(author)) return err('שם תצוגה לא תקין (2–40 תווים)');
        if (isForbiddenPublicName(author)) return err('השם הזה שמור. בחר שם אחר.', 409);
        if (!text || text.length > COMMENT_BODY_MAX) return err(`תוכן חסר או ארוך מדי (עד ${COMMENT_BODY_MAX})`);
        const t = await findThread(env, year, slug, threadId);
        if (!t || t.value.deleted) return err('thread not found', 404);
        // If replying to a specific reply, validate it exists in this thread,
        // and resolve its author to display "(בתגובה ל-X)".
        let replyToAuthor = null;
        if (replyToId) {
          if (!COMMENT_ID_RE.test(replyToId)) return err('replyToId invalid');
          const target = await findReply(env, year, slug, threadId, replyToId);
          if (!target || target.value.deleted) return err('הודעה שאליה משיבים לא נמצאה', 404);
          replyToAuthor = target.value.author || null;
        }
        const rl = await checkRateLimit(env, fp);
        if (!rl.ok) return err('יותר מדי הודעות. נסה שוב בעוד דקה.', 429);
        const reserved = await reserveDisplayName(env, author, fp);
        if (!reserved.ok) return err(reserved.error, 409);
        const cleanBody = stripHtml(text).slice(0, COMMENT_BODY_MAX);
        const saved = await appendReply(env, year, slug, threadId, {
          body: cleanBody, author, fp, replyToId, replyToAuthor,
        });
        // Save the poster's notification prefs if they sent any (e.g. they
        // typed their email in the onboarding modal and we want to remember
        // it server-side for the cron worker to match against later).
        if (body.emailPrefs && typeof body.emailPrefs === 'object') {
          await savePrefs(env, fp, body.emailPrefs);
        }
        // Enqueue pending notifications for everyone else who's in the
        // thread and has prefs allowing this kind of message. The cron
        // processor handles the 5-minute delay + skip-if-seen logic.
        const allReplies = await listRepliesInThread(env, year, slug, threadId);
        const mentions = Array.isArray(body.mentions) ? body.mentions.slice(0, 20).map(String) : [];
        // Fetch parshaName so the email subject can show it.
        let parshaName = '';
        try {
          const wkRes = await fetch(`${env.SITE_URL.replace(/\/$/, '')}/data/bulletins/${year}/${slug}.json`, { cf: { cacheTtl: 0 } });
          if (wkRes.ok) parshaName = (await wkRes.json()).parshaName || '';
        } catch (_) {}
        await enqueueRepliesNotifications(env, {
          year, slug, threadId, parshaName,
          thread: t.value, replies: allReplies, reply: saved, mentions,
        });
        // Sender's own view: mark them as seen so they don't get spam'd
        // about a thread they just posted in.
        await markThreadSeen(env, fp, year, slug, threadId);
        return ok({ reply: saved });
      }

      // Edit a thread (own only, within window). Body may include title and/or body.
      if (p.startsWith('/discuss/threads/') && !p.endsWith('/reply') && !p.endsWith('/react') && !p.endsWith('/report') && request.method === 'PUT') {
        const threadId = p.slice('/discuss/threads/'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const fp = String(body.fp || '');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
        const t = await findThread(env, year, slug, threadId);
        if (!t) return err('not found', 404);
        if (t.value.deleted) return err('deleted', 410);
        if (t.value.fp !== fp) return err('אין הרשאה לערוך', 403);
        const ageMs = Date.now() - Date.parse(t.value.createdAt);
        if (ageMs > COMMENT_EDIT_WINDOW_MS) return err('חלון העריכה (15 דק׳) חלף', 409);
        const next = { ...t.value };
        if (body.title !== undefined) {
          const title = stripHtml(String(body.title || '').trim()).slice(0, COMMENT_TITLE_MAX);
          if (!title) return err('כותרת לא תקינה');
          next.title = title;
        }
        if (body.body !== undefined) {
          const text = stripHtml(String(body.body || '').trim()).slice(0, COMMENT_BODY_MAX);
          if (!text) return err('תוכן לא תקין');
          next.body = text;
        }
        next.editedAt = new Date().toISOString();
        await env.EVENTS.put(t.key, JSON.stringify(next));
        return ok({ thread: next });
      }

      // Edit a reply (own only, within window).
      if (p.startsWith('/discuss/replies/') && request.method === 'PUT') {
        const replyId = p.slice('/discuss/replies/'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const threadId = String(body.threadId || '');
        const fp = String(body.fp || '');
        const text = String(body.body || '').trim();
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId) || !COMMENT_ID_RE.test(replyId)) return err('id invalid');
        if (!text || text.length > COMMENT_BODY_MAX) return err('תוכן לא תקין');
        const r = await findReply(env, year, slug, threadId, replyId);
        if (!r) return err('not found', 404);
        if (r.value.deleted) return err('deleted', 410);
        if (r.value.fp !== fp) return err('אין הרשאה לערוך', 403);
        const ageMs = Date.now() - Date.parse(r.value.createdAt);
        if (ageMs > COMMENT_EDIT_WINDOW_MS) return err('חלון העריכה (15 דק׳) חלף', 409);
        const next = { ...r.value, body: stripHtml(text).slice(0, COMMENT_BODY_MAX), editedAt: new Date().toISOString() };
        await env.EVENTS.put(r.key, JSON.stringify(next));
        return ok({ reply: next });
      }

      // Reactions on threads.
      if (p.startsWith('/discuss/threads/') && p.endsWith('/react') && request.method === 'POST') {
        const threadId = p.slice('/discuss/threads/'.length, -'/react'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const fp = String(body.fp || '');
        const emoji = String(body.emoji || '');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
        const t = await findThread(env, year, slug, threadId);
        if (!t || t.value.deleted) return err('not found', 404);
        const result = await applyReaction(env, reactionRef('t', threadId), fp, emoji);
        return result.ok ? ok(result) : err(result.error || 'שגיאה');
      }

      // Reactions on replies.
      if (p.startsWith('/discuss/replies/') && p.endsWith('/react') && request.method === 'POST') {
        const replyId = p.slice('/discuss/replies/'.length, -'/react'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const threadId = String(body.threadId || '');
        const fp = String(body.fp || '');
        const emoji = String(body.emoji || '');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId) || !COMMENT_ID_RE.test(replyId)) return err('id invalid');
        const r = await findReply(env, year, slug, threadId, replyId);
        if (!r || r.value.deleted) return err('not found', 404);
        const result = await applyReaction(env, reactionRef('r', replyId), fp, emoji);
        return result.ok ? ok(result) : err(result.error || 'שגיאה');
      }

      // Delete own thread (soft-delete).
      if (p.startsWith('/discuss/threads/') && p.endsWith('/delete') && request.method === 'POST') {
        const threadId = p.slice('/discuss/threads/'.length, -'/delete'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const fp = String(body.fp || '');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
        const t = await findThread(env, year, slug, threadId);
        if (!t) return err('not found', 404);
        if (t.value.deleted) return ok({ deleted: true });
        if (t.value.fp !== fp) return err('אין הרשאה למחיקה', 403);
        await env.EVENTS.put(t.key, JSON.stringify({ ...t.value, deleted: true, deletedAt: new Date().toISOString() }));
        // If the user no longer has any remaining messages, free their name.
        await cleanupNameIfUnused(env, fp);
        return ok({ deleted: true });
      }

      // Delete own reply (soft-delete).
      if (p.startsWith('/discuss/replies/') && p.endsWith('/delete') && request.method === 'POST') {
        const replyId = p.slice('/discuss/replies/'.length, -'/delete'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const threadId = String(body.threadId || '');
        const fp = String(body.fp || '');
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(threadId) || !COMMENT_ID_RE.test(replyId)) return err('id invalid');
        const r = await findReply(env, year, slug, threadId, replyId);
        if (!r) return err('not found', 404);
        if (r.value.deleted) return ok({ deleted: true });
        if (r.value.fp !== fp) return err('אין הרשאה למחיקה', 403);
        await env.EVENTS.put(r.key, JSON.stringify({ ...r.value, deleted: true, deletedAt: new Date().toISOString() }));
        await cleanupNameIfUnused(env, fp);
        return ok({ deleted: true });
      }

      // Reports — works on either threads or replies.
      if ((p.startsWith('/discuss/threads/') || p.startsWith('/discuss/replies/')) && p.endsWith('/report') && request.method === 'POST') {
        const isThread = p.startsWith('/discuss/threads/');
        const id = isThread
          ? p.slice('/discuss/threads/'.length, -'/report'.length)
          : p.slice('/discuss/replies/'.length, -'/report'.length);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        const year = String(body.year || '');
        const threadId = String(body.threadId || (isThread ? id : ''));
        const fp = String(body.fp || '');
        const reason = String(body.reason || '').slice(0, 200);
        if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('slug + year invalid');
        if (!FP_RE.test(fp)) return err('fp invalid');
        if (!COMMENT_ID_RE.test(id)) return err('id invalid');
        const found = isThread
          ? await findThread(env, year, slug, id)
          : await findReply(env, year, slug, threadId, id);
        if (!found) return err('not found', 404);
        const ref = reactionRef(isThread ? 't' : 'r', id);
        const reportKey = `report:${ref}:${fp}`;
        if (!(await env.EVENTS.get(reportKey))) {
          await env.EVENTS.put(reportKey, reason || '1', { expirationTtl: 90 * 24 * 60 * 60 });
          const cur = parseInt(await env.EVENTS.get(`report-count:${ref}`) || '0', 10);
          await env.EVENTS.put(`report-count:${ref}`, String(cur + 1));
          await recordNotification(env, 'comment-reported', {
            ref, kind: isThread ? 'thread' : 'reply', threadId: isThread ? id : threadId,
            year, slug, reason: reason || null,
            author: found.value.author || null,
            preview: (isThread ? found.value.title : found.value.body || '').slice(0, 120),
          });
        }
        return ok();
      }

      if (p.startsWith('/admin/')) {
        if (!authed(request, env)) return err('unauthorized', 401);
        if (p === '/admin/auth' && request.method === 'POST') return ok({ valid: true });
        if (p === '/admin/stats') {
          const bypass = url.searchParams.get('fresh') === '1';
          return ok(await buildStatsCached(env, { bypass }));
        }

        if (p === '/admin/opens' && request.method === 'GET') {
          return ok(await listEngagement(env));
        }

        if (p === '/admin/resend-recent' && request.method === 'GET') {
          const limit = url.searchParams.get('limit') || '100';
          const r = await fetch(`https://api.resend.com/emails?limit=${limit}`, {
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          });
          const txt = await r.text();
          let data;
          try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
          return ok({ status: r.status, body: data });
        }

        if (p === '/admin/stats/reset' && request.method === 'POST') {
          // Wipe analytics counters, fingerprints, dedupe markers, and email
          // open/click engagement. Keeps operational keys (notif:*, dispatch:*,
          // last-sent, pending-*).
          let deleted = 0;
          for (const prefix of ['cnt:', 'fp:', 'done:', 'open:', 'click:']) {
            let cursor;
            do {
              const res = await env.EVENTS.list({ prefix, cursor });
              for (const k of res.keys) {
                await env.EVENTS.delete(k.name);
                deleted++;
              }
              cursor = res.cursor;
              if (res.list_complete) break;
            } while (cursor);
          }
          invalidateStatsCache();
          return ok({ deleted });
        }
        if (p === '/admin/subscribers' && request.method === 'GET') return ok({ subscribers: await listSubscribers(env) });

        if (p === '/admin/subscribers/set-name' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const email = (body.email || '').trim().toLowerCase();
          const name = (body.name || '').trim().slice(0, 120);
          if (!isEmail(email)) return err('email required');
          const key = 'sub:' + email;
          const existing = await env.EMAILS.get(key, 'json');
          if (!existing) return err('subscriber not found', 404);
          existing.name = name || null;
          await env.EMAILS.put(key, JSON.stringify(existing));
          return ok({ email, name: existing.name });
        }

        if (p === '/admin/subscribers/export.csv') {
          const subs = await listSubscribers(env);
          const rows = [['email', 'name', 'addedAt', 'country', 'city', 'source']];
          for (const s of subs) rows.push([s.email, s.name || '', s.addedAt || '', s.country || '', s.city || '', s.source || '']);
          const csv = rows.map((r) => r.map((c) => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\n');
          // Prepend BOM so Excel opens UTF-8 correctly.
          return new Response('﻿' + csv, {
            headers: {
              ...CORS,
              'Content-Type': 'text/csv;charset=utf-8',
              'Content-Disposition': `attachment; filename="mashmaut-subscribers-${today()}.csv"`,
            },
          });
        }

        if (p === '/admin/subscribers/bulk-add' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          let raw = body.emails;
          if (Array.isArray(raw)) raw = raw.join('\n');
          if (typeof raw !== 'string') return err('emails (array or string) required');
          const sendWelcome = !!body.sendWelcome;
          // Extract anything that looks like an email — handles commas, semicolons,
          // newlines, "Name <a@b>" form, and stray spaces.
          const candidates = raw.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
          // Dedupe, normalize.
          const seen = new Set();
          const valid = [];
          for (const c of candidates) {
            const lc = c.toLowerCase();
            if (!seen.has(lc) && isEmail(lc)) { seen.add(lc); valid.push(lc); }
          }
          let added = 0, skipped = 0, sentWelcome = 0, welcomeFailed = 0;
          for (const e of valid) {
            const { existing, data } = await addSubscriber(env, e, request, { source: 'admin' });
            if (existing) { skipped++; continue; }
            added++;
            if (sendWelcome) {
              try {
                const apiBase = (env.API_URL || 'https://api.alonmashmaut.org').replace(/\/$/, '');
                const link = `${apiBase}/unsubscribe?email=${encodeURIComponent(data.email)}&token=${data.token}`;
                await sendEmail(env, data.email,
                  `ברוך הבא לעלון משמעות`,
                  `<div dir="rtl" style="font-family:Assistant,system-ui,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.6;">
                    <p>תודה שנרשמת לעלון <b>משמעות</b>.</p>
                    <p>בכל יום חמישי בערב נשלח לך את העלון של השבוע.</p>
                    <p style="font-size:13px;color:#888;">להסרה מרשימת התפוצה: <a href="${link}">לחץ כאן</a></p>
                  </div>`);
                sentWelcome++;
              } catch (_) { welcomeFailed++; }
            }
          }
          return ok({ added, skipped, sentWelcome, welcomeFailed, totalCandidates: candidates.length });
        }

        if (p === '/admin/subscribers/remove' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const list = Array.isArray(body.emails) ? body.emails : [];
          let removed = 0;
          for (const e of list) {
            if (!isEmail(e)) continue;
            const cleaned = e.trim().toLowerCase();
            const existed = await env.EMAILS.get('sub:' + cleaned);
            if (existed) {
              await removeSubscriber(env, cleaned);
              removed++;
            }
          }
          return ok({ removed });
        }

        if (p === '/admin/notifications' && request.method === 'GET') {
          return ok(await listNotifications(env));
        }
        if (p === '/admin/notifications/mark-read' && request.method === 'POST') {
          return ok(await markNotificationsRead(env));
        }

        if (p === '/admin/pending-dispatch' && request.method === 'GET') {
          const pending = await env.EVENTS.get('pending-dispatch', 'json');
          return ok({ pending: pending || null });
        }
        if (p === '/admin/pending-dispatch/approve' && request.method === 'POST') {
          const pending = await env.EVENTS.get('pending-dispatch', 'json');
          if (!pending) return err('no pending dispatch');
          await env.EVENTS.delete('pending-dispatch');
          const result = await sendBulletinToAll(env);
          return ok(result);
        }
        if (p === '/admin/pending-dispatch/cancel' && request.method === 'POST') {
          await env.EVENTS.delete('pending-dispatch');
          return ok();
        }
        if (p === '/admin/schedule-info' && request.method === 'GET') {
          // Read-only summary for the admin UI: current Israel time + active schedule.
          const config = await fetchSiteConfig(env);
          const sched = getSchedule(config);
          const il = israelNow();
          return ok({
            schedule: sched,
            israelNow: { weekday: il.getDay(), hour: il.getHours(), minute: il.getMinutes() },
          });
        }
        if (p === '/admin/send-now' && request.method === 'POST') {
          const result = await sendBulletinToAll(env);
          return ok(result);
        }
        if (p === '/admin/resend-to' && request.method === 'POST') {
          // Send the current bulletin to a SPECIFIC list of emails (not all
          // subscribers). Useful to recover from partial failures without
          // re-spamming everyone.
          const body = await request.json().catch(() => ({}));
          const list = Array.isArray(body.emails) ? body.emails : [];
          if (!list.length) return err('emails required');
          const week = await fetchLatestBulletin(env);
          if (!week) return err('no bulletin');
          const tpl = buildBulletinEmail(env, week);
          let sent = 0, failed = 0;
          const failures = [];
          for (let i = 0; i < list.length; i++) {
            const email = list[i];
            if (!isEmail(email)) { failed++; failures.push({ email, error: 'invalid' }); continue; }
            try {
              const html = tpl.html.replace(/\{\{EMAIL\}\}/g, encodeURIComponent(email));
              await sendEmail(env, email, tpl.subject, html);
              sent++;
            } catch (e) {
              failed++;
              failures.push({ email, error: e.message });
            }
            if (i < list.length - 1) await new Promise((r) => setTimeout(r, SEND_THROTTLE_MS));
          }
          return ok({ sent, failed, failures });
        }
        if (p === '/admin/test-email' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const to = body.to || env.ADMIN_EMAIL;
          await sendEmail(env, to, 'בדיקה — עלון משמעות', '<p dir="rtl">המערכת פועלת. זוהי בדיקה.</p>');
          return ok();
        }

        // --- Cloud admin: writes through GitHub Contents API ---

        if (p === '/admin/bulletin' && request.method === 'POST') {
          // Body: { week, pdfBase64?, wordBase64? } — week is the full bulletin object
          const body = await request.json();
          const { week, pdfBase64, wordBase64 } = body;
          if (!week || !week.yearId || !week.slug) return err('week.yearId and week.slug required');
          const dir = `public/data/bulletins/${week.yearId}`;
          if (pdfBase64) await ghWriteBinary(env, `${dir}/${week.slug}.pdf`, pdfBase64, `upload PDF for ${week.slug}`);
          if (wordBase64) await ghWriteBinary(env, `${dir}/${week.slug}.docx`, wordBase64, `upload Word for ${week.slug}`);

          // Update / create the bulletin JSON
          await ghWriteJson(env, `${dir}/${week.slug}.json`, week, `update bulletin ${week.slug}`);

          // Update the index
          const { data: idx } = await ghReadJson(env, 'public/data/index.json');
          const cur = idx || { years: [], weeks: [] };
          if (!cur.years.find((y) => y.id === week.yearId)) {
            cur.years.push({ id: week.yearId, displayName: week.yearDisplay });
          }
          const summary = {
            yearId: week.yearId,
            yearDisplay: week.yearDisplay,
            slug: week.slug,
            parshaName: week.parshaName,
            issueNumber: week.issueNumber || null,
            dateLabel: week.dateLabel || null,
            teaser: week.teaser || null,
            publishedAt: week.publishedAt || new Date().toISOString(),
            colors: week.colors || {},
            ...(typeof week.displayOrder === 'number' ? { displayOrder: week.displayOrder } : {}),
          };
          const i = cur.weeks.findIndex((w) => w.yearId === week.yearId && w.slug === week.slug);
          if (i >= 0) {
            cur.weeks[i] = summary;
          } else {
            // Brand-new bulletin. The admin form sets the new summary's
            // displayOrder to 0 ("latest"), but every existing ordered
            // week probably also has its own 0/1/2/… The new one being
            // pushed to the *end* of the array makes a stable sort
            // keep the existing 0 first, so the homepage stays on the
            // previous week until the user drags. Shift every existing
            // displayOrder up by 1 so the new 0 is unique and wins.
            if (typeof summary.displayOrder === 'number') {
              cur.weeks.forEach((w) => {
                if (typeof w.displayOrder === 'number' && w.displayOrder >= summary.displayOrder) {
                  w.displayOrder += 1;
                }
              });
            }
            cur.weeks.push(summary);
          }
          await ghWriteJson(env, 'public/data/index.json', cur, `index: ${i >= 0 ? 'update' : 'add'} ${week.slug}`);

          return ok({ saved: true, slug: week.slug });
        }

        if (p === '/admin/bulletin' && request.method === 'DELETE') {
          const body = await request.json();
          const { yearId, slug } = body;
          if (!yearId || !slug) return err('yearId+slug required');
          const dir = `public/data/bulletins/${yearId}`;
          for (const ext of ['json', 'pdf', 'docx']) {
            const path = `${dir}/${slug}.${ext}`;
            const f = await ghGetFile(env, path);
            if (f) await ghDeleteFile(env, path, f.sha, `remove ${path}`);
          }
          // Update index
          const { data: idx } = await ghReadJson(env, 'public/data/index.json');
          if (idx) {
            idx.weeks = (idx.weeks || []).filter((w) => !(w.yearId === yearId && w.slug === slug));
            await ghWriteJson(env, 'public/data/index.json', idx, `index: remove ${slug}`);
          }
          return ok();
        }

        if (p === '/admin/reorder' && request.method === 'POST') {
          const body = await request.json();
          const { order } = body; // ["yearId/slug", ...]
          if (!Array.isArray(order)) return err('order must be array');
          const map = new Map(order.map((k, i) => [k, i]));
          const { data: idx } = await ghReadJson(env, 'public/data/index.json');
          if (!idx) return err('no index');
          idx.weeks = idx.weeks.map((w) => {
            const k = `${w.yearId}/${w.slug}`;
            return map.has(k) ? { ...w, displayOrder: map.get(k) } : w;
          });
          await ghWriteJson(env, 'public/data/index.json', idx, `reorder bulletins`);
          // No mirror to per-bulletin JSONs — `index.json` is the only
          // place that's actually consumed for ordering (the worker and
          // every frontend path read it from there). Mirroring used to
          // burn through Cloudflare's 50-subrequest-per-invocation limit
          // on big catalogs, which surfaced as a "Too many subrequests"
          // error halfway through the reorder and a partially-applied
          // state. The displayOrder field that already exists inside
          // older per-bulletin JSONs is harmless drift; we just stop
          // touching it on every drag.
          return ok();
        }

        if (p === '/admin/year' && request.method === 'POST') {
          const body = await request.json();
          const { id, displayName } = body;
          if (!id || !displayName) return err('id and displayName required');
          const { data: idx } = await ghReadJson(env, 'public/data/index.json');
          const cur = idx || { years: [], weeks: [] };
          if (!cur.years.find((y) => y.id === id)) cur.years.push({ id, displayName });
          await ghWriteJson(env, 'public/data/index.json', cur, `add year ${displayName}`);
          return ok();
        }

        if (p === '/admin/config' && request.method === 'POST') {
          const body = await request.json();
          const { data: cur } = await ghReadJson(env, 'public/data/config.json');
          const next = { ...(cur || {}), ...body };
          // The public config.json is served to every visitor — never let any
          // secret be persisted into it (this is how the admin key leaked). The
          // admin key lives only in the ADMIN_API_KEY worker secret.
          for (const k of ['adminApiKey', 'apiKey', 'adminKey', 'githubToken', 'resendApiKey', 'secret']) delete next[k];
          await ghWriteJson(env, 'public/data/config.json', next, `update site config`);
          return ok();
        }

        // --- Stats archive (admin) ---

        if (p === '/admin/stats/archives' && request.method === 'GET') {
          return ok({ archives: await listArchives(env) });
        }

        if (p.startsWith('/admin/stats/archives/') && request.method === 'GET') {
          // Archive IDs are ISO timestamps containing colons. The client
          // url-encodes them (T22%3A05%3A30...), so the server must decode
          // before looking the key up in KV — otherwise we 404 ourselves.
          const rawId = p.slice('/admin/stats/archives/'.length);
          if (!rawId) return err('id required');
          let id;
          try { id = decodeURIComponent(rawId); } catch { id = rawId; }
          const v = await env.EVENTS.get('archive:' + id, 'json');
          if (!v) return err('archive not found', 404);
          const filename = `mashmaut-stats-${(v.periodStart || 'start').slice(0, 10)}_to_${(v.periodEnd || 'end').slice(0, 10)}.csv`;
          return new Response(v.csv || '', {
            headers: {
              ...CORS,
              'Content-Type': 'text/csv;charset=utf-8',
              'Content-Disposition': `attachment; filename="${filename}"`,
            },
          });
        }

        if (p.startsWith('/admin/stats/archives/') && request.method === 'DELETE') {
          const rawId = p.slice('/admin/stats/archives/'.length);
          if (!rawId) return err('id required');
          let id;
          try { id = decodeURIComponent(rawId); } catch { id = rawId; }
          await env.EVENTS.delete('archive:' + id);
          return ok({ deleted: id });
        }

        // Debug-only endpoint: trigger an archive run synchronously. Gated
        // behind STAGING_MODE so it can't be invoked in production.
        if (p === '/admin/stats/archive-now' && request.method === 'POST') {
          if (env.STAGING_MODE !== '1') return err('staging only', 403);
          const result = await maybeArchiveStats(env, { force: true });
          return ok(result);
        }

        // --- Discussions (admin) ---

        // Flat list of all threads across all bulletins, newest activity first.
        // O(threads) — one KV list call (paginated) + one get per thread.
        if (p === '/admin/discuss/threads' && request.method === 'GET') {
          const out = [];
          let cursor;
          do {
            const res = await env.EVENTS.list({ prefix: 'thread:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v) continue;
              // Key: thread:<year>/<slug>:<id>
              const tail = res.keys[i].name.slice('thread:'.length);
              const slashIdx = tail.indexOf('/');
              const colonIdx = tail.indexOf(':', slashIdx + 1);
              if (slashIdx < 0 || colonIdx < 0) continue;
              const year = tail.slice(0, slashIdx);
              const slug = tail.slice(slashIdx + 1, colonIdx);
              out.push({ year, slug, ...v });
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          out.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
          return ok({ threads: out });
        }

        // Full thread for moderation (same as public GET but with report counts).
        if (p.startsWith('/admin/discuss/threads/') && request.method === 'GET') {
          const rest = p.slice('/admin/discuss/threads/'.length);
          // Path is /<year>/<slug>/<threadId> for admin.
          const parts = rest.split('/');
          if (parts.length !== 3) return err('path: /admin/discuss/threads/<year>/<slug>/<threadId>');
          const [year, slug, threadId] = parts;
          if (!SLUG_RE.test(slug) || !YEAR_RE.test(year) || !COMMENT_ID_RE.test(threadId)) return err('invalid');
          const t = await findThread(env, year, slug, threadId);
          if (!t) return err('not found', 404);
          const replies = await listRepliesInThread(env, year, slug, threadId);
          const reactions = await getReactionsForThread(env, threadId, replies);
          // Pull report counts.
          const reports = {};
          const tReportN = parseInt(await env.EVENTS.get(`report-count:t:${threadId}`) || '0', 10);
          if (tReportN > 0) reports[threadId] = tReportN;
          for (const r of replies) {
            const n = parseInt(await env.EVENTS.get(`report-count:r:${r.id}`) || '0', 10);
            if (n > 0) reports[r.id] = n;
          }
          return ok({ thread: t.value, replies, reactions, reports });
        }

        // Soft-delete a thread or a single reply.
        if (p === '/admin/discuss/delete' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const slug = String(body.slug || '');
          const year = String(body.year || '');
          const threadId = String(body.threadId || '');
          const replyId = body.replyId ? String(body.replyId) : null;
          if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('year+slug required');
          if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
          if (replyId) {
            // Reply admin-delete remains a soft-delete so the surrounding
            // thread keeps its flow ("[ההודעה נמחקה]" placeholder).
            if (!COMMENT_ID_RE.test(replyId)) return err('replyId invalid');
            const r = await findReply(env, year, slug, threadId, replyId);
            if (!r) return err('not found', 404);
            const next = { ...r.value, deleted: true, deletedAt: new Date().toISOString() };
            await env.EVENTS.put(r.key, JSON.stringify(next));
            if (r.value.fp) await cleanupNameIfUnused(env, r.value.fp);
            return ok({ deleted: 'reply', id: replyId });
          }
          // Admin thread-delete is a HARD delete — the thread, its replies,
          // their reactions and reports all vanish. Participants who have
          // nothing left elsewhere are removed from the user directory too.
          const result = await hardDeleteThread(env, year, slug, threadId);
          if (result.removed === 0) return err('not found', 404);
          return ok({ deleted: 'thread', id: threadId, ...result });
        }

        // Admin replies into a thread.
        if (p === '/admin/discuss/reply' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const slug = String(body.slug || '');
          const year = String(body.year || '');
          const threadId = String(body.threadId || '');
          const text = String(body.body || '').trim();
          if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('year+slug required');
          if (!COMMENT_ID_RE.test(threadId)) return err('threadId invalid');
          if (!text) return err('body required');
          const t = await findThread(env, year, slug, threadId);
          if (!t || t.value.deleted) return err('thread not found', 404);
          const author = body.author && String(body.author).trim() || 'צוות משמעות';
          const adminFp = 'admin-' + (env.ADMIN_EMAIL || 'admin');
          const cleanBody = stripHtml(text).slice(0, COMMENT_BODY_MAX);
          const saved = await appendReply(env, year, slug, threadId, {
            body: cleanBody, author, fp: adminFp, isAdmin: true,
          });
          return ok({ reply: saved });
        }

        // List unique participants (by fp) across all bulletins. Used by the
        // moderation "users" tab to support rename/cleanup operations.
        if (p === '/admin/discuss/users' && request.method === 'GET') {
          const users = new Map(); // fp → { fp, names: Set, threadCount, replyCount, lastAt, recent: [] }
          // Walk threads first. Soft-deleted records are skipped — a user
          // whose only message was soft-deleted shouldn't show up here.
          let cursor;
          do {
            const res = await env.EVENTS.list({ prefix: 'thread:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v || v.deleted) continue;
              if (v.fp && v.fp.startsWith('admin-')) continue;
              const tail = res.keys[i].name.slice('thread:'.length);
              const slashIdx = tail.indexOf('/');
              const colonIdx = tail.indexOf(':', slashIdx + 1);
              if (slashIdx < 0 || colonIdx < 0) continue;
              const year = tail.slice(0, slashIdx);
              const slug = tail.slice(slashIdx + 1, colonIdx);
              const u = users.get(v.fp) || { fp: v.fp, names: new Set(), threadCount: 0, replyCount: 0, lastAt: '', recent: [] };
              u.names.add(v.author || '');
              u.threadCount++;
              const at = v.lastAt || v.createdAt || '';
              if (at > u.lastAt) u.lastAt = at;
              u.recent.push({ year, slug, threadId: v.id, title: v.title, at: v.createdAt });
              users.set(v.fp, u);
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          // Walk replies — also skip soft-deleted.
          cursor = undefined;
          do {
            const res = await env.EVENTS.list({ prefix: 'reply:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v || v.deleted) continue;
              if (v.fp && v.fp.startsWith('admin-')) continue;
              const u = users.get(v.fp) || { fp: v.fp, names: new Set(), threadCount: 0, replyCount: 0, lastAt: '', recent: [] };
              u.names.add(v.author || '');
              u.replyCount++;
              if ((v.createdAt || '') > u.lastAt) u.lastAt = v.createdAt || '';
              users.set(v.fp, u);
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          // Serialize: latest activity first, top 3 recent threads each.
          const out = Array.from(users.values()).map((u) => ({
            fp: u.fp,
            names: Array.from(u.names).filter(Boolean),
            currentName: Array.from(u.names).filter(Boolean).pop() || '',
            threadCount: u.threadCount,
            replyCount: u.replyCount,
            messageCount: u.threadCount + u.replyCount,
            lastAt: u.lastAt,
            recent: u.recent.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 3),
          }));
          out.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
          return ok({ users: out });
        }

        // Rename every message authored by `fp` (threads + replies + the
        // replyToAuthor field on replies that point at this user). Admin-
        // only — bypasses the public forbidden-name blocklist.
        if (p === '/admin/discuss/rename-user' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const fp = String(body.fp || '');
          const newName = String(body.newName || '').trim();
          if (!FP_RE.test(fp)) return err('fp invalid');
          if (!isValidDisplayName(newName)) return err('שם תצוגה לא תקין (2–40 תווים)');
          const cleanName = stripHtml(newName);
          let updated = 0;
          const messageIds = new Set();
          // Pass 1: rewrite threads + replies authored by this fp; collect their ids.
          let cursor;
          do {
            const res = await env.EVENTS.list({ prefix: 'thread:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v || v.fp !== fp) continue;
              messageIds.add(v.id);
              await env.EVENTS.put(res.keys[i].name, JSON.stringify({ ...v, author: cleanName }));
              updated++;
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          cursor = undefined;
          do {
            const res = await env.EVENTS.list({ prefix: 'reply:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v) continue;
              if (v.fp === fp) {
                messageIds.add(v.id);
                await env.EVENTS.put(res.keys[i].name, JSON.stringify({ ...v, author: cleanName }));
                updated++;
              }
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          // Pass 2: update replyToAuthor on any reply whose replyToId points
          // at one of this user's messages — so "(בתגובה ל-X)" labels stay
          // accurate after the rename.
          cursor = undefined;
          do {
            const res = await env.EVENTS.list({ prefix: 'reply:', cursor });
            const values = await Promise.all(res.keys.map((k) => env.EVENTS.get(k.name, 'json')));
            for (let i = 0; i < res.keys.length; i++) {
              const v = values[i]; if (!v) continue;
              if (v.replyToId && messageIds.has(v.replyToId) && v.replyToAuthor !== cleanName) {
                await env.EVENTS.put(res.keys[i].name, JSON.stringify({ ...v, replyToAuthor: cleanName }));
                updated++;
              }
            }
            cursor = res.cursor;
            if (res.list_complete) break;
          } while (cursor);
          // Reserve the new name for this fp so future posts keep it.
          await reserveDisplayName(env, cleanName, fp);
          return ok({ updated, fp, newName: cleanName });
        }

        // Admin starts a NEW thread directly (e.g. announcement).
        if (p === '/admin/discuss/new-thread' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const slug = String(body.slug || '');
          const year = String(body.year || '');
          const title = String(body.title || '').trim();
          const text = String(body.body || '').trim();
          if (!SLUG_RE.test(slug) || !YEAR_RE.test(year)) return err('year+slug required');
          if (!title || title.length > COMMENT_TITLE_MAX) return err('title invalid');
          if (!text) return err('body required');
          const author = body.author && String(body.author).trim() || 'צוות משמעות';
          const adminFp = 'admin-' + (env.ADMIN_EMAIL || 'admin');
          const cleanBody = stripHtml(text).slice(0, COMMENT_BODY_MAX);
          const cleanTitle = stripHtml(title).slice(0, COMMENT_TITLE_MAX);
          const saved = await createThread(env, year, slug, {
            title: cleanTitle, body: cleanBody, author, fp: adminFp, isAdmin: true,
          });
          return ok({ thread: saved });
        }

        return err('admin route not found', 404);
      }

      return err('not found', 404);
    } catch (e) {
      return err(e.message || 'error', 500);
    }
  },

  async scheduled(event, env, ctx) {
    // Three independent scheduled jobs share the hourly tick:
    //   1) maybeSendOnSchedule — weekly bulletin dispatch.
    //   2) maybeArchiveStats — periodic stats archive + reset.
    //   3) processPendingNotifications — drain the reply-notification
    //      queue, honoring the 5-minute delay + skip-if-seen rules.
    ctx.waitUntil(
      maybeSendOnSchedule(env).then((r) => console.log('cron dispatch:', r))
        .catch((e) => console.log('cron dispatch error:', e.message))
    );
    ctx.waitUntil(
      maybeArchiveStats(env).then((r) => console.log('cron archive:', r))
        .catch((e) => console.log('cron archive error:', e.message))
    );
    ctx.waitUntil(
      processPendingNotifications(env).then((r) => console.log('cron notifs:', r))
        .catch((e) => console.log('cron notifs error:', e.message))
    );
  },
};
