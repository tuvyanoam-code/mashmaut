// First-visit privacy / tracking notice. The site stores data in
// localStorage and measures usage + email opens, so visitors are told once
// and pointed at the full privacy policy. Dismissed permanently per browser.
// Deliberately lightweight: a slim bottom bar, never a blocking modal.

const KEY = 'mashmaut.privacyNotice';

export function initPrivacyNotice() {
  if (typeof document === 'undefined') return;
  try { if (localStorage.getItem(KEY) === 'ack') return; } catch (_) { return; }
  // Don't show on the admin panel or on the privacy page itself.
  const path = location.pathname;
  if (path.startsWith('/admin') || path === '/privacy') return;

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
    setTimeout(() => bar.remove(), 250);
  };
  bar.querySelector('[data-ack]').addEventListener('click', dismiss);
  // Following the policy link also counts as acknowledgement.
  bar.querySelector('a').addEventListener('click', () => {
    try { localStorage.setItem(KEY, 'ack'); } catch (_) {}
  });
}
