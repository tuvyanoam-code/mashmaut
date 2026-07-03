// Record short "how-to" clips of the site performing each action, with an
// injected animated cursor (desktop) / tap ring (mobile). Real clicks drive the
// real UI, so the recording shows the actual flow.
//
// The cursor overlay is captured by page.screenshot() (unlike a CDP screencast),
// so we record by grabbing frames in a loop and muxing them with ffmpeg.
//
// Usage: (build + `npx vite preview --port 4188 --strictPort` first)
//   node scripts/record-guide.mjs [flowKey ...]
// Output: public/guide/<key>-<device>.mp4

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const BASE = process.env.GUIDE_BASE || 'http://localhost:4188';
const OUT = 'public/guide';
const BULLETIN = '/y/5786/chukat';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installCursor(page, isMobile) {
  await page.evaluate((isMobile) => {
    const old = document.getElementById('__gcur');
    if (old) old.remove();
    const c = document.createElement('div');
    c.id = '__gcur';
    const cur = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24'%3E%3Cpath d='M5 3l14 8-6 1.6L9.6 19 5 3z' fill='%23fff' stroke='%231b1b21' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E";
    // Start just below the screen, positioned in px so the CSS transition (px→px)
    // animates smoothly to the target.
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
      + 'left:' + Math.round(innerWidth / 2) + 'px;top:' + Math.round(innerHeight * 1.05) + 'px;'
      + 'transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1),transform .13s ease;';
    if (isMobile) {
      c.style.width = '36px'; c.style.height = '36px'; c.style.borderRadius = '50%';
      c.style.marginLeft = '-18px'; c.style.marginTop = '-18px';
      c.style.background = 'rgba(45,106,79,.5)';
      c.style.boxShadow = '0 0 0 3px rgba(45,106,79,.95), 0 2px 8px rgba(0,0,0,.35)';
    } else {
      c.style.width = '30px'; c.style.height = '30px';
      c.style.marginLeft = '-3px'; c.style.marginTop = '-2px';
      c.style.backgroundImage = 'url("' + cur + '")'; c.style.backgroundRepeat = 'no-repeat'; c.style.backgroundSize = '30px 30px';
      c.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,.4))';
    }
    document.body.appendChild(c);
    window.__moveCur = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
    window.__pressCur = () => {
      c.style.transform = 'scale(.8)';
      setTimeout(() => { c.style.transform = 'scale(1)'; }, 150);
      const cx = parseFloat(c.style.left), cy = parseFloat(c.style.top);
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;left:' + cx + 'px;top:' + cy + 'px;'
        + 'width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(45,106,79,.45);'
        + 'box-shadow:0 0 0 2px rgba(45,106,79,.8);transition:transform .55s ease-out,opacity .55s ease-out;';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(3.6)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 560);
    };
  }, isMobile);
}

// The cursor div lives on <body>, outside the router's #app, so it survives
// client-side navigations — but re-install if a full load wiped it.
async function ensureCursor(page, isMobile) {
  const has = await page.evaluate(() => !!window.__moveCur && !!document.getElementById('__gcur'));
  if (!has) await installCursor(page, isMobile);
}

async function waitFor(page, selector, timeout = 9000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.$(selector)) return true;
    await sleep(120);
  }
  console.warn('  ! timed out waiting for', selector);
  return false;
}

async function moveTo(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    let r = el.getBoundingClientRect();
    const inView = r.top >= 8 && r.bottom <= innerHeight - 8 && r.left >= 0 && r.right <= innerWidth;
    if (!inView) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); r = el.getBoundingClientRect(); }
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, selector);
  if (!box) { console.warn('  ! selector not found:', selector); return null; }
  await page.evaluate((x, y) => window.__moveCur(x, y), box.x, box.y);
  await sleep(780);
  return box;
}

async function tap(page, selector) {
  const box = await moveTo(page, selector);
  if (!box) return false;
  await page.evaluate(() => window.__pressCur());
  // Let the press ripple play out so the click clearly "lands" before whatever
  // it triggers (especially a navigation, which would otherwise feel instant).
  await sleep(400);
  // Trigger via element.click() — far more reliable than a pixel-coordinate
  // mouse click for driving the SPA router (which listens for bubbled clicks).
  const ok = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, selector);
  return ok;
}

// Open the mobile hamburger, hold long enough for the menu to clearly appear,
// then tap a menu item — so the viewer sees WHAT is being clicked, not just a
// corner tap followed by a sudden new screen.
async function tapMenuItem(page, itemSelector) {
  await tap(page, '#navToggle');
  // Confirm the menu actually opened (retry the toggle once if not), then hold
  // so the open menu is clearly on screen before we point at an item.
  let open = false;
  for (let i = 0; i < 14; i++) {
    open = await page.evaluate(() => !!document.querySelector('#navActions')?.classList.contains('open'));
    if (open) break;
    if (i === 3) await page.evaluate(() => document.querySelector('#navToggle')?.click());
    await sleep(110);
  }
  console.log('  menu open after toggle:', open);
  await sleep(950); // hold so the open menu is clearly visible
  await tap(page, itemSelector);
}

async function typeInto(page, selector, text) {
  if (!(await waitFor(page, selector, 6000))) { console.warn('  ! type target missing:', selector); return; }
  await tap(page, selector);
  await sleep(250);
  try { await page.type(selector, text, { delay: 110 }); }
  catch (e) { console.warn('  ! type failed:', selector, e.message); }
}

async function smoothScrollTo(page, targetFrac, ms) {
  await page.evaluate((targetFrac, ms) => new Promise((res) => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const to = max * targetFrac, from = window.scrollY, start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      window.scrollTo(0, from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
  }), targetFrac, ms);
}

const FLOWS = {
  // Reading: a calm scroll down the article while the progress ring fills.
  read: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1400);
    rec();
    await sleep(500);
    await smoothScrollTo(page, 0.5, 3600);
    await sleep(1100);
  },

  // Chapters: open the quick-nav and jump to a section.
  chapters: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    if (dev.isMobile) {
      await tap(page, '.bulletin-toc-fab');
      await sleep(1100);
      await tap(page, '.bulletin-toc-roll li:nth-child(3) a');
    } else {
      await tap(page, '.bulletin-toc-toggle');
      await sleep(900);
      await tap(page, '.bulletin-toc-list li:nth-child(3) a');
    }
    await sleep(1800);
  },

  // Archive: pick a year, then a parasha — drilling into an old issue.
  archive: async (page, dev, rec) => {
    await page.goto(BASE + '/years', { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    await tap(page, 'a.year-tile');
    await waitFor(page, 'a[href^="/y/5786/"]');
    await ensureCursor(page, dev.isMobile);
    await sleep(700);
    await tap(page, 'a[href^="/y/5786/"]');
    await sleep(1900);
  },

  // Search: open search from the (solid) nav, type a query, get results.
  // Starts on a bulletin — the home page has a transparent hero nav where the
  // menu button isn't visible.
  search: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    if (dev.isMobile) {
      await tapMenuItem(page, '#navActions a[href="/search"]');
    } else {
      await tap(page, '.nav-actions a[href="/search"]');
    }
    await waitFor(page, '#searchInput');
    await ensureCursor(page, dev.isMobile);
    await sleep(700);
    await typeInto(page, '#searchInput', 'תורה');
    await sleep(500);
    await tap(page, '#searchForm button');
    await sleep(2200);
  },

  // Discuss: open the "start a conversation" flow and write the first message.
  discuss: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    await tap(page, '.threadlist-cta');
    await waitFor(page, '.discuss-form input[name="title"]');
    await ensureCursor(page, dev.isMobile);
    await sleep(700);
    await typeInto(page, '.discuss-form input[name="title"]', 'מחשבה על הפרשה');
    await sleep(300);
    await typeInto(page, '.discuss-form textarea[name="body"]', 'רשמתי כאן מה שהתחדש לי מהמאמר…');
    await sleep(400);
    await moveTo(page, '.discuss-submit');
    await sleep(1300);
  },

  // Share: like the issue, then open the copy-link share action.
  share: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    await tap(page, '.like-btn');
    await sleep(1100);
    await tap(page, 'button.share-btn');
    await sleep(1700);
  },

  // Subscribe: open the modal (from the solid bulletin nav) and fill it in.
  subscribe: async (page, dev, rec) => {
    await page.goto(BASE + BULLETIN, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(1300);
    await installCursor(page, dev.isMobile);
    await sleep(300);
    rec();
    await sleep(500);
    if (dev.isMobile) {
      await tapMenuItem(page, '#navActions #navSubscribe');
    } else {
      await tap(page, '#navSubscribe');
    }
    await waitFor(page, '.modal input[name="name"]');
    await sleep(600);
    await typeInto(page, '.modal input[name="name"]', 'ישראל ישראלי');
    await sleep(350);
    await typeInto(page, '.modal input[name="email"]', 'israel@gmail.com');
    await sleep(450);
    await moveTo(page, '.modal .btn');
    await sleep(1400);
  },
};

const DEVICES = [
  { name: 'mobile', width: 390, height: 844, dsf: 2, isMobile: true },
  { name: 'desktop', width: 1280, height: 800, dsf: 1.5, isMobile: false },
];

const wanted = process.argv.slice(2);
const keys = wanted.length ? wanted : Object.keys(FLOWS);

// Record by grabbing screenshots in a loop (these DO include the injected
// cursor overlay, unlike CDP screencast) and muxing them with ffmpeg.
const FPS = 14;
async function captureFlow(page, dev, key) {
  // Stub the "like" endpoints so the heart always starts empty and a click
  // fills it (and stays filled) — otherwise the shared browser fingerprint
  // carries a real like from an earlier clip to the next, so the next device
  // starts already-liked and the click un-likes. Stubbing also avoids writing
  // phantom likes to the live site.
  await page.setRequestInterception(true);
  // The like API lives on the (cross-origin) production Worker, so stubbed
  // responses need CORS headers or the browser blocks them — which would make
  // toggleLike() throw and the optimistic heart roll back to empty.
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  page.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'OPTIONS' && /\/like/.test(url)) {
      return req.respond({ status: 204, headers: cors, body: '' });
    }
    if (url.includes('/like-state')) {
      return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 0, liked: false }) });
    }
    if (/\/like(\?|$)/.test(url) && req.method() === 'POST') {
      return req.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 1, liked: true }) });
    }
    req.continue();
  });

  // Suppress the "resume where you left off" banner/pill — it pops up over the
  // bulletin and gets in the way of showing the actual action. Clearing the
  // saved position (before the page's scripts run) stops it being created at
  // all; the CSS is a belt-and-suspenders backup.
  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem('mashmaut.read-pos'); } catch (_) {}
    const add = () => {
      if (document.getElementById('__ghide')) return;
      const s = document.createElement('style');
      s.id = '__ghide';
      s.textContent = '.resume-banner,.resume-pill{display:none!important}';
      (document.head || document.documentElement).appendChild(s);
    };
    add();
    document.addEventListener('DOMContentLoaded', add);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gframes-'));
  let n = 0, stop = false, started = false, grabP = null;
  const interval = Math.round(1000 / FPS);
  const startGrab = () => {
    if (started) return; started = true;
    grabP = (async () => {
      while (!stop) {
        const t0 = Date.now();
        try { await page.screenshot({ path: path.join(dir, 'f' + String(n).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 80 }); n++; } catch (_) {}
        const dt = Date.now() - t0;
        if (dt < interval) await sleep(interval - dt);
      }
    })();
  };
  await FLOWS[key](page, dev, startGrab);
  stop = true;
  if (grabP) await grabP;
  const out = `${OUT}/${key}-${dev.name}.mp4`;
  execFileSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-crf', '27', '-movflags', '+faststart', out], { stdio: 'ignore' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('recorded', out, '(' + n + ' frames)');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
try {
  for (const key of keys) {
    for (const dev of DEVICES) {
      const page = await browser.newPage();
      await page.setViewport({ width: dev.width, height: dev.height, deviceScaleFactor: dev.dsf, isMobile: dev.isMobile, hasTouch: dev.isMobile });
      await captureFlow(page, dev, key);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
