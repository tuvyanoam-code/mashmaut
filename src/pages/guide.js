// "מדריך שימוש" — a guided, device-aware walkthrough of the site. One step at
// a time, each with a real screenshot (mobile or desktop, matching the reader's
// device) framed in a phone / laptop mockup, an animated tap/cursor pointing at
// the relevant control, and arrows right beside the device for easy paging.

import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig } from '../lib/store.js';
import { icon } from '../icons.js';
import { setPageSeo } from '../lib/seo.js';

// Every step is a short recorded clip (per device) of the real action, with an
// animated cursor. See scripts/record-guide.mjs.
const STEPS = [
  {
    key: 'read', icon: 'book', title: 'קוראים את העלון',
    text: 'כל עלון זמין בטקסט מעוצב ונוח, או כ-PDF להורדה. גלגלו לאורך המאמר — וסמן ההתקדמות מראה כמה נותר.',
    video: true,
  },
  {
    key: 'chapters', icon: 'listUnordered', title: 'קופצים בין הפרקים',
    text: 'מאמר ארוך? כפתור הפרקים פותח ניווט מהיר — קפצו ישר לחלק שמעניין אתכם, בלי לגלול הכול.',
    video: true,
  },
  {
    key: 'archive', icon: 'archive', title: 'ארכיון של כל השנים',
    text: 'כל העלונים שיצאו אי פעם, מסודרים לפי שנה וסדר הפרשיות. חזרו לכל פרשה, מכל שנה, בכל רגע.',
    video: true,
  },
  {
    key: 'search', icon: 'search', title: 'מחפשים בכל העלונים',
    text: 'מחפשים רעיון, פרשה או כותרת? החיפוש סורק את כל הארכיון ומביא לכם את כל המקומות שבהם זה מופיע.',
    video: true,
  },
  {
    key: 'discuss', icon: 'dialog', title: 'שיחה בין הקוראים',
    text: 'מחשבה? שאלה? פִּתחו שיחה על העלון, או הצטרפו לדיון קיים — כאן הקוראים חושבים יחד.',
    video: true,
  },
  {
    key: 'share', icon: 'share', title: 'אהבתי ושיתוף',
    text: 'נהניתם? סמנו "אהבתי", ושתפו את העלון עם חבר — בוואטסאפ, טלגרם, מייל או קישור.',
    video: true,
  },
  {
    key: 'subscribe', icon: 'email', title: 'מקבלים למייל',
    text: 'רוצים את העלון כל שבוע ישר לתיבה? מלאו שם וכתובת מייל — ובכל יום חמישי בערב הוא יגיע אליכם. בלי ספאם.',
    video: true,
  },
];

const CURSOR_SVG = `<svg class="guide-cursor" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 3l14 8-6 1.6L9.6 19 5 3z" fill="#fff" stroke="#1b1b21" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

function deviceKind() {
  return window.matchMedia('(min-width: 721px)').matches ? 'desktop' : 'mobile';
}

export async function renderGuide() {
  const app = document.getElementById('app');
  const [config, nav] = await Promise.all([loadConfig(), navHtml()]);

  app.innerHTML = `
    <div class="fade-in">
      ${nav}
      <main class="guide">
        <header class="guide-head">
          <h1>מדריך שימוש</h1>
          <p>סיור קצר — כל מה שאפשר לעשות באתר, שלב אחר שלב.</p>
        </header>

        <section class="guide-tour" data-guide>
          <div class="guide-dots" role="tablist">
            ${STEPS.map((s, i) => `<button type="button" class="guide-dot${i === 0 ? ' active' : ''}" data-goto="${i}" aria-label="שלב ${i + 1}: ${s.title}"></button>`).join('')}
          </div>

          <div class="guide-stage">
            <div class="guide-stage-row">
              <button type="button" class="guide-arrow" data-prev aria-label="השלב הקודם">${icon('arrowRight', { size: 22 })}</button>
              <div class="guide-device" data-device>
                <div class="guide-device-screen">
                  <img class="guide-shot" data-shot alt="" loading="eager" />
                  <video class="guide-vid" data-vid muted loop autoplay playsinline webkit-playsinline preload="auto" hidden></video>
                  <span class="guide-pointer" data-pointer hidden>
                    <span class="guide-pointer-ripple"></span>
                    ${CURSOR_SVG}
                  </span>
                </div>
              </div>
              <button type="button" class="guide-arrow" data-next aria-label="השלב הבא">${icon('arrowLeft', { size: 22 })}</button>
            </div>
            <div class="guide-info" data-info>
              <div class="guide-step-num" data-num></div>
              <div class="guide-step-icon" data-stepicon aria-hidden="true"></div>
              <h2 class="guide-step-title" data-title></h2>
              <p class="guide-step-text" data-text></p>
            </div>
          </div>
        </section>

        <div class="guide-cta">
          <a class="btn btn-secondary" href="/">${icon('book', { size: 18 })} <span>קדימה, נתחיל לקרוא</span></a>
        </div>
      </main>
      ${footerHtml(config)}
    </div>
  `;

  bindNav();
  setPageSeo({
    title: 'מדריך שימוש — עלון משמעות',
    description: 'מדריך אינטראקטיבי קצר: איך קוראים את העלון, מנווטים בארכיון, ונרשמים לקבלה במייל.',
    path: '/guide',
  });

  const tour = app.querySelector('[data-guide]');
  const img = tour.querySelector('[data-shot]');
  const vid = tour.querySelector('[data-vid]');
  const device = tour.querySelector('[data-device]');
  const pointer = tour.querySelector('[data-pointer]');
  const stage = tour.querySelector('.guide-stage');
  let idx = 0;
  let kind = deviceKind();

  // Robust playback for mobile: iOS honours muted+playsinline autoplay, but the
  // play() call fires after a setTimeout (outside the tap gesture), so also retry
  // on the media's own "can play" events, and once more on the next user touch
  // as a last resort (e.g. Low Power Mode, which blocks autoplay entirely).
  vid.muted = true; // setting the property (not just the attribute) is required for iOS autoplay
  const playVideo = () => { if (!vid.hidden) vid.play().catch(() => {}); };
  ['loadeddata', 'canplay'].forEach((ev) => vid.addEventListener(ev, playVideo));
  const kickOnGesture = () => playVideo();
  document.addEventListener('touchstart', kickOnGesture, { passive: true });
  document.addEventListener('click', kickOnGesture);

  const apply = () => {
    const s = STEPS[idx];
    tour.querySelector('[data-title]').textContent = s.title;
    tour.querySelector('[data-text]').textContent = s.text;
    tour.querySelector('[data-num]').textContent = `שלב ${idx + 1} מתוך ${STEPS.length}`;
    tour.querySelector('[data-stepicon]').innerHTML = icon(s.icon, { size: 22 });

    if (s.video) {
      // A recorded clip of the real action, looping.
      img.hidden = true;
      pointer.hidden = true;
      vid.hidden = false;
      const src = `/guide/${s.key}-${kind}.mp4`;
      // A real screenshot as poster: something meaningful shows instantly while
      // the clip loads, and stays if autoplay is blocked (until the first tap).
      vid.poster = `/guide/${s.key}-${kind}.jpg`;
      if (vid.getAttribute('src') !== src) { vid.src = src; vid.load(); }
      playVideo();
      return;
    }
    vid.pause();
    vid.removeAttribute('src');
    vid.hidden = true;
    img.hidden = false;
    img.src = `/guide/${s.key}-${kind}.jpg`;
    img.alt = s.title;
    const hot = s.hot && s.hot[kind];
    if (hot) {
      pointer.hidden = false;
      pointer.style.left = hot.x + '%';
      pointer.style.top = hot.y + '%';
      pointer.classList.toggle('guide-pointer--cursor', kind === 'desktop');
      pointer.classList.remove('is-live'); void pointer.offsetWidth; pointer.classList.add('is-live');
    } else {
      pointer.hidden = true;
    }
  };

  const paint = (i, animate = true) => {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    device.classList.toggle('guide-device--phone', kind === 'mobile');
    device.classList.toggle('guide-device--laptop', kind === 'desktop');
    tour.querySelectorAll('.guide-dot').forEach((d, di) => d.classList.toggle('active', di === idx));
    tour.querySelector('[data-prev]').disabled = idx === 0;
    tour.querySelector('[data-next]').disabled = idx === STEPS.length - 1;
    if (animate) {
      stage.classList.add('is-swapping');
      setTimeout(() => { apply(); stage.classList.remove('is-swapping'); }, 200);
    } else {
      apply();
    }
  };

  tour.querySelector('[data-next]').addEventListener('click', () => paint(idx + 1));
  tour.querySelector('[data-prev]').addEventListener('click', () => paint(idx - 1));
  tour.querySelectorAll('.guide-dot').forEach((d) => d.addEventListener('click', () => paint(+d.dataset.goto)));

  // →/← page between steps (RTL: → previous, ← next).
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') paint(idx + 1);
    else if (e.key === 'ArrowRight') paint(idx - 1);
  };
  document.addEventListener('keydown', onKey);

  // Swipe on the stage.
  let x0 = null;
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) paint(idx + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });

  const mq = window.matchMedia('(min-width: 721px)');
  const onMq = () => { const k = deviceKind(); if (k !== kind) { kind = k; paint(idx, false); } };
  mq.addEventListener('change', onMq);

  paint(0, false);

  return () => {
    document.removeEventListener('keydown', onKey);
    mq.removeEventListener('change', onMq);
    document.removeEventListener('touchstart', kickOnGesture);
    document.removeEventListener('click', kickOnGesture);
    vid.pause();
  };
}
