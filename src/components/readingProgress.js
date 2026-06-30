// Reading progress ring.
// Tracks scroll progress through a target element and updates a circular
// indicator; fires onComplete (and persists "finished") once at ~100%.

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
  document.querySelectorAll('.reading-progress').forEach((n) => n.remove());

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
  };
}

