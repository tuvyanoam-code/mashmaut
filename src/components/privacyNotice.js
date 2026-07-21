// First-visit privacy / tracking notice. The site stores data in localStorage
// and measures usage + email opens, so visitors are told once and pointed at
// the full privacy policy. Dismissed permanently per browser.
//
// It's a gentle floating card that pops up — deliberately NOT shown over the
// home splash (the "opening screen"): on the home page it waits until the
// reader scrolls past the splash; elsewhere it appears after a short beat.

const KEY = 'mashmaut.privacyNotice';

export function initPrivacyNotice() {
  if (typeof document === 'undefined') return;
  try { if (localStorage.getItem(KEY) === 'ack') return; } catch (_) { return; }

  let shown = false;
  let poll = null;

  const teardown = () => {
    window.removeEventListener('scroll', tryShow);
    if (poll) clearInterval(poll);
  };

  function tryShow() {
    if (shown) return;
    const path = location.pathname;
    if (path.startsWith('/admin') || path === '/privacy') return; // not here
    // Never cover the opening splash: on the home hero, hold until the reader
    // has scrolled past it.
    const onSplash = document.body.classList.contains('is-home')
      && window.scrollY < window.innerHeight * 0.5;
    if (onSplash) return;
    shown = true;
    teardown();
    show();
  }

  function show() {
    if (document.querySelector('.privacy-notice')) return;
    const bar = document.createElement('div');
    bar.className = 'privacy-notice';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'הודעת פרטיות');
    bar.innerHTML = `
      <p class="privacy-notice-text">
        אנו שומרים העדפות במכשירך ומודדים שימוש כדי לשפר את האתר.
        פרטים ב<a href="/privacy">מדיניות הפרטיות</a>.
      </p>
      <button type="button" class="privacy-notice-btn" data-ack>הבנתי</button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('visible'));

    const dismiss = () => {
      try { localStorage.setItem(KEY, 'ack'); } catch (_) {}
      bar.classList.remove('visible');
      setTimeout(() => bar.remove(), 300);
    };
    bar.querySelector('[data-ack]').addEventListener('click', dismiss);
    // Following the policy link also counts as acknowledgement.
    bar.querySelector('a').addEventListener('click', () => {
      try { localStorage.setItem(KEY, 'ack'); } catch (_) {}
    });
  }

  window.addEventListener('scroll', tryShow, { passive: true });
  // Poll catches SPA route changes (pushState fires no scroll/popstate here).
  poll = setInterval(tryShow, 800);
  setTimeout(tryShow, 1200);
}
