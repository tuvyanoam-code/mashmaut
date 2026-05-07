// Reading progress ring + completion celebration.
// Tracks scroll progress through a target element and updates a circular
// indicator. When 100% reached the first time, plays a happy chord and confetti.

import { icon } from '../icons.js';
import { saveReadingPosition, markFinished, isFinished } from '../lib/readingPosition.js';

const RADIUS = 26;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Mount the reading-progress ring on the page.
 * @param targetSelector  Selector for the article whose scroll progress drives the ring.
 * @param onComplete      Fired exactly once when the user reaches ~100%.
 * @param meta            Optional { yearId, slug, parshaName, yearDisplay }.
 *                        When provided, the user's reading position is also
 *                        persisted to localStorage (throttled) so they can
 *                        resume on a later visit — and cleared on completion.
 */
export function mountReadingProgress(targetSelector, onComplete, meta) {
  // Avoid multiple mounts (e.g., on rerenders)
  document.querySelectorAll('.reading-progress, .confetti').forEach((n) => n.remove());

  const ring = document.createElement('div');
  ring.className = 'reading-progress';
  ring.style.setProperty('--circ', CIRC);
  ring.innerHTML = `
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="ring-track" cx="32" cy="32" r="${RADIUS}"></circle>
      <circle class="ring-progress" cx="32" cy="32" r="${RADIUS}"></circle>
    </svg>
    <div class="ring-percent">0%</div>
    <div class="ring-check">${icon('check', { size: 22 })}</div>
  `;
  document.body.appendChild(ring);
  ring.setAttribute('aria-label', 'התקדמות הקריאה');

  const progressEl = ring.querySelector('.ring-progress');
  const percentEl = ring.querySelector('.ring-percent');

  // Treat the bulletin as already finished if this browser previously
  // reached the end. Suppresses the celebration on refresh + protects
  // the saved reading-position from being clobbered with a near-100%
  // entry the user has actually already completed.
  let completed = !!(meta && isFinished(meta.yearId, meta.slug));
  if (completed) ring.classList.add('complete');
  let raf = 0;
  let lastPersist = 0;
  const PERSIST_THROTTLE_MS = 1500;

  const update = () => {
    raf = 0;
    const target = document.querySelector(targetSelector);
    if (!target) {
      ring.style.opacity = 0;
      return;
    }
    ring.style.opacity = 1;
    const rect = target.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = target.offsetHeight + Math.min(rect.top, 0); // distance to traverse
    // Top of element relative to viewport — when negative, we've scrolled past start
    const scrolled = -rect.top + viewport * 0.4; // weight toward "I've read most"
    const max = target.offsetHeight - viewport * 0.4;
    let pct = Math.max(0, Math.min(1, scrolled / Math.max(max, 1)));
    if (rect.top > viewport * 0.6) pct = 0;
    progressEl.style.strokeDashoffset = String(CIRC * (1 - pct));
    percentEl.textContent = Math.round(pct * 100) + '%';

    // Persist mid-read position (throttled) so the user can resume next time.
    // Skip while completed — once the user finished, scrolling back up to
    // re-read a passage shouldn't write a "you stopped at 30%" mark.
    if (meta && meta.yearId && meta.slug && !completed) {
      const now = Date.now();
      if (now - lastPersist > PERSIST_THROTTLE_MS) {
        lastPersist = now;
        saveReadingPosition(meta, pct, window.scrollY);
      }
    }

    // The pct calculation is viewport-relative; even when the user has
    // scrolled the article's bottom into view, pct typically tops out around
    // 0.93–0.96. Treating only ≥ 0.99 as "finished" meant the celebration
    // (and the 'finish' analytics event) fired almost never. 0.92 maps to
    // "the bottom of the article is fully on screen and the user has paused
    // there" — a fair definition of finishing.
    if (pct >= 0.92 && !completed) {
      completed = true;
      ring.classList.add('complete');
      celebrate();
      // Persist the "finished" flag — markFinished also clears any saved
      // reading position so we don't offer to resume to the very end.
      if (meta && meta.yearId && meta.slug) markFinished(meta.yearId, meta.slug);
      try { onComplete && onComplete(); } catch (_) {}
    }
  };

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // Run an initial update once layout settles
  setTimeout(update, 100);
  // Also flush a persist on hide/close, so we don't miss the very-last
  // position if the user closes the tab right after reading.
  const flushOnHide = () => {
    if (meta && meta.yearId && meta.slug && document.visibilityState === 'hidden') {
      const target = document.querySelector(targetSelector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewport = window.innerHeight;
      const scrolled = -rect.top + viewport * 0.4;
      const max = target.offsetHeight - viewport * 0.4;
      const pct = Math.max(0, Math.min(1, scrolled / Math.max(max, 1)));
      saveReadingPosition(meta, pct, window.scrollY);
    }
  };
  document.addEventListener('visibilitychange', flushOnHide);

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    document.removeEventListener('visibilitychange', flushOnHide);
    ring.remove();
    document.querySelectorAll('.confetti').forEach((n) => n.remove());
  };
}

let audioCtx = null;
function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    // Layered bells: C major triad, then a gentle sustain
    const motifs = [
      [523.25, 659.25, 783.99, 1046.50], // C5 E5 G5 C6
      [783.99, 987.77, 1318.51],          // G5 B5 E6 — a happy lift
    ];
    const start = ctx.currentTime;
    motifs.forEach((notes, m) => {
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = m === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.connect(gain).connect(ctx.destination);
        const t0 = start + m * 0.45 + i * 0.07;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        osc.start(t0);
        osc.stop(t0 + 1.7);
      });
    });
  } catch (e) { /* audio failure is non-critical */ }
}

const COLOR_VARS = [
  'var(--bulletin-primary)', 'var(--bulletin-secondary)',
  'var(--joy-pink)', 'var(--joy-yellow)', 'var(--joy-coral)', 'var(--joy-sky)',
];
const SOLID_COLORS = ['#ff7ab6', '#ffd166', '#ff8b5a', '#6ec5ff', '#52b788', '#a78bfa', '#ff5a8b'];

function celebrate() {
  // Honor reduced-motion preference: keep the chime as a subtle audio cue,
  // skip confetti + balloons (they would all freeze in place via the global
  // motion override and look like clutter on the page).
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  playChime();
  if (reduce) return;

  const confettiLayer = document.createElement('div');
  confettiLayer.className = 'confetti';
  document.body.appendChild(confettiLayer);

  const balloonLayer = document.createElement('div');
  balloonLayer.className = 'confetti';
  document.body.appendChild(balloonLayer);

  // Three confetti waves over 3s for a sustained shower
  const waves = [0, 700, 1400];
  waves.forEach((delay) => {
    setTimeout(() => spawnConfetti(confettiLayer, 70), delay);
  });
  // Balloons rising in a steady stream
  spawnBalloons(balloonLayer, 14);

  setTimeout(() => {
    confettiLayer.remove();
    balloonLayer.remove();
  }, 6500);
}

function spawnConfetti(layer, count) {
  const shapes = ['', 'shape-circle', 'shape-strip'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece ' + shapes[i % shapes.length];
    const left = Math.random() * 100;
    const drift = Math.random() * 320 - 160;
    const dur = 2.4 + Math.random() * 1.8;
    const delay = Math.random() * 0.3;
    piece.style.left = left + 'vw';
    piece.style.setProperty('--drift', drift + 'px');
    piece.style.setProperty('--dur', dur + 's');
    piece.style.animationDelay = delay + 's';
    piece.style.background = COLOR_VARS[i % COLOR_VARS.length];
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(piece);
  }
}

function spawnBalloons(layer, count) {
  for (let i = 0; i < count; i++) {
    const b = document.createElement('div');
    b.className = 'balloon';
    const left = 4 + (i / count) * 92 + (Math.random() * 6 - 3);
    const drift = Math.random() * 80 - 40;
    const dur = 3.6 + Math.random() * 1.8;
    const delay = Math.random() * 1.2;
    const color = SOLID_COLORS[i % SOLID_COLORS.length];
    b.style.left = left + 'vw';
    b.style.setProperty('--drift', drift + 'px');
    b.style.setProperty('--dur', dur + 's');
    b.style.setProperty('--balloon-color', color);
    b.style.background = `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${color} 70%, white), ${color})`;
    b.style.animationDelay = delay + 's';
    layer.appendChild(b);
  }
}
