// mashmaut-api — Cloudflare Worker
// Endpoints:
//   POST   /subscribe        { email }                       public
//   POST   /unsubscribe      { email, token? }               public (token from email)
//   POST   /event            { type, slug, year, fp }        public
//   GET    /admin/stats      Authorization: Bearer <key>     admin
//   GET    /admin/subscribers                                admin
//   POST   /admin/send-now   { yearId, slug }                admin (manual blast)
// Cron: Thursday 17:00 UTC — sends current week's bulletin to all subscribers.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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

function authed(request, env) {
  const h = request.headers.get('Authorization') || '';
  const key = h.replace(/^Bearer\s+/i, '');
  return env.ADMIN_API_KEY && key === env.ADMIN_API_KEY;
}

// --- GitHub Contents API helpers ----------------------------------------

const GH = (env, path) => `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || 'main'}`;
const GH_HEADERS = (env) => ({
  'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'mashmaut-worker',
});

async function ghGetFile(env, path) {
  const r = await fetch(GH(env, path), { headers: GH_HEADERS(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub get ${path}: ${r.status}`);
  return r.json(); // { content, sha, ... }
}

async function ghPutFile(env, path, contentBase64, message, sha) {
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
  const key = 'sub:' + cleaned;
  const existing = await env.EMAILS.get(key, 'json');
  if (existing) return { existing: true, data: existing };
  const token = crypto.randomUUID();
  const data = {
    email: cleaned,
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

// --- Email sending (Resend) ----------------------------------------------

async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
  const fromName = env.FROM_NAME || 'משמעות';
  const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
  // Replies go to the admin's real inbox, not the no-reply sender domain.
  const replyTo = env.ADMIN_EMAIL || 'alonmashmaut@gmail.com';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      reply_to: replyTo,
      subject,
      html,
    }),
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
            <a href="${url}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">קרא באתר</a>
            <a href="${pdfUrl}" style="display:inline-block;background:#fff;color:#1a1a1a;border:1px solid #ece6d8;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;margin-right:6px;">פתח PDF</a>
          </div>
          <p style="font-size:14px;color:#888;margin-top:32px;line-height:1.5;">
            רוצה לשתף עם חבר? פשוט העבר את המייל הזה, או שלח להם את הקישור:
            <br><a href="${url}" style="color:${primary};text-decoration:underline;">${url}</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #ece6d8;font-size:12px;color:#999;">
          קיבלת את המייל הזה כי נרשמת לעלון משמעות.
          <a href="${apiUrl}/unsubscribe?email={{EMAIL}}" style="color:#999;">להסרה מרשימת התפוצה</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: title, html };
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

async function sendBulletinToAll(env) {
  const week = await fetchLatestBulletin(env);
  if (!week) return { ok: false, error: 'no bulletin' };
  const subs = await listSubscribers(env);
  if (!subs.length) return { ok: true, sent: 0 };
  const tpl = buildBulletinEmail(env, week);
  let sent = 0, failed = 0;
  // Send sequentially to respect rate limits
  for (const s of subs) {
    try {
      const html = tpl.html.replace('{{EMAIL}}', encodeURIComponent(s.email));
      await sendEmail(env, s.email, tpl.subject, html);
      sent++;
    } catch (e) {
      failed++;
      console.log('send failed for', s.email, e.message);
    }
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
  return { ok: true, sent, failed };
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
        const { existing, data } = await addSubscriber(env, body.email, request, { source: 'public' });
        if (!existing) {
          // Record an admin notification (only for genuine new signups).
          await recordNotification(env, 'subscribe', {
            email: data.email,
            country: data.country || null,
            city: data.city || null,
          });
          // Send a welcome email
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

      if (p.startsWith('/admin/')) {
        if (!authed(request, env)) return err('unauthorized', 401);
        if (p === '/admin/auth' && request.method === 'POST') return ok({ valid: true });
        if (p === '/admin/stats') return ok(await buildStats(env));
        if (p === '/admin/subscribers' && request.method === 'GET') return ok({ subscribers: await listSubscribers(env) });

        if (p === '/admin/subscribers/export.csv') {
          const subs = await listSubscribers(env);
          const rows = [['email', 'addedAt', 'country', 'city', 'source']];
          for (const s of subs) rows.push([s.email, s.addedAt || '', s.country || '', s.city || '', s.source || '']);
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
          if (i >= 0) cur.weeks[i] = summary;
          else cur.weeks.push(summary);
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
          // Mirror onto each per-bulletin JSON (non-blocking would be nicer, do sequentially)
          for (const k of order) {
            const [y, s] = k.split('/');
            const path = `public/data/bulletins/${y}/${s}.json`;
            const cur = await ghReadJson(env, path);
            if (cur.data) {
              cur.data.displayOrder = map.get(k);
              await ghWriteJson(env, path, cur.data, `reorder: ${s}`);
            }
          }
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
          await ghWriteJson(env, 'public/data/config.json', next, `update site config`);
          return ok();
        }

        return err('admin route not found', 404);
      }

      return err('not found', 404);
    } catch (e) {
      return err(e.message || 'error', 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      maybeSendOnSchedule(env).then((r) => console.log('cron tick:', r))
        .catch((e) => console.log('cron error:', e.message))
    );
  },
};
