// Capture the guide's screenshots (mobile + desktop) from a locally-served
// build, using system Chrome via puppeteer-core.
//
// Usage:
//   1. npm run build
//   2. npx vite preview --port 4188 --strictPort   (in another shell)
//   3. node scripts/capture-guide.mjs
//
// Output: public/guide/<key>-mobile.jpg and <key>-desktop.jpg

import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.GUIDE_BASE || 'http://localhost:4188';
const OUT = 'public/guide';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each step: a URL + an optional async prep(page, device) run after load
// (scroll, click, etc.) before the shot is taken.
const BULLETIN = '/y/5786/chukat';
const STEPS = [
  {
    key: 'read',
    url: BULLETIN,
    prep: async (page) => { await page.evaluate(() => window.scrollTo(0, 380)); await sleep(500); },
  },
  {
    key: 'chapters',
    url: BULLETIN,
    prep: async (page, dev) => {
      if (dev.isMobile) {
        await page.evaluate(() => { const f = document.querySelector('.bulletin-toc-fab'); if (f) f.click(); });
      } else {
        await page.evaluate(() => {
          window.scrollTo(0, 260);
          const t = document.querySelector('.bulletin-toc-toggle'); if (t) t.click();
        });
      }
      await sleep(900);
    },
  },
  {
    key: 'archive',
    url: '/years',
    prep: async () => { await sleep(400); },
  },
  {
    key: 'search',
    url: '/search?q=' + encodeURIComponent('תורה'),
    prep: async () => { await sleep(2400); }, // let the index load + results render
  },
  {
    key: 'discuss',
    url: BULLETIN,
    prep: async (page) => {
      await page.evaluate(() => { const t = document.getElementById('threadList'); if (t) t.scrollIntoView({ block: 'center' }); });
      await sleep(900);
    },
  },
  {
    key: 'share',
    url: BULLETIN,
    prep: async (page) => {
      await page.evaluate(() => { const b = document.querySelector('.like-btn'); if (b) b.scrollIntoView({ block: 'center' }); });
      await sleep(700);
    },
  },
  {
    key: 'subscribe',
    url: '/',
    prep: async (page) => {
      await page.evaluate(() => { const b = document.querySelector('[data-action="subscribe"]'); if (b) b.click(); });
      await sleep(700);
    },
  },
];

const DEVICES = [
  { name: 'mobile', width: 390, height: 844, dsf: 2, isMobile: true },
  { name: 'desktop', width: 1280, height: 800, dsf: 1.5, isMobile: false },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
});

try {
  for (const step of STEPS) {
    for (const d of DEVICES) {
      const page = await browser.newPage();
      await page.setViewport({
        width: d.width, height: d.height, deviceScaleFactor: d.dsf,
        isMobile: d.isMobile, hasTouch: d.isMobile,
      });
      await page.goto(BASE + step.url, { waitUntil: 'networkidle2', timeout: 25000 });
      await sleep(1200); // let entrance animations settle
      if (step.prep) await step.prep(page, d);
      const path = `${OUT}/${step.key}-${d.name}.jpg`;
      await page.screenshot({ path, type: 'jpeg', quality: 82 });
      console.log('captured', path);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
