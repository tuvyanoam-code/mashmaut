import { icon } from '../icons.js';
import { loadConfig } from '../lib/store.js';
import { openSubscribeModal, openContactModal } from './subscribeModal.js';
import { getLatestFollow } from '../lib/myDiscussions.js';
import { withBase } from '../router.js';

export async function navHtml() {
  const config = await loadConfig();
  const siteName = config.siteName || 'משמעות';
  // When a logo is set, render only the image (no circle, no sibling text).
  // The image's alt attribute carries the site name for accessibility.
  const brandInner = config.logo
    ? `<img class="brand-logo" src="${config.logo}" alt="${siteName}" />`
    : `<span class="brand-mark">${siteName.charAt(0)}</span><span>${siteName}</span>`;
  return `
    <nav class="nav">
      <div class="nav-inner">
        <a href="/" class="nav-brand ${config.logo ? 'nav-brand--logo' : ''}">
          ${brandInner}
        </a>
        <button class="nav-toggle" id="navToggle" type="button" aria-label="פתח תפריט" aria-expanded="false" aria-controls="navActions">
          ${icon('menu', { size: 22 })}
        </button>
        <div class="nav-actions" id="navActions">
          <a href="/years">${icon('archive', { size: 18 })} <span>ארכיון</span></a>
          <a href="/search">${icon('search', { size: 18 })} <span>חיפוש</span></a>
          ${conversationsLinkHtml()}
          <button class="nav-cta" id="navSubscribe" type="button">${icon('email', { size: 18 })} <span>קבל למייל</span></button>
        </div>
      </div>
    </nav>
  `;
}

// Bind nav buttons (call after navHtml is rendered)
export function bindNav() {
  if (typeof document === 'undefined') return;
  const toggle = document.getElementById('navToggle');
  const sheet = document.getElementById('navActions');
  if (toggle && sheet) {
    const close = () => {
      sheet.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = sheet.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    sheet.addEventListener('click', (e) => {
      // Close after tapping a nav link or the subscribe button on mobile.
      if (e.target.closest('a, button')) close();
    });
    document.addEventListener('click', (e) => {
      if (!sheet.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) close();
    });
  }
  document.querySelectorAll('#navSubscribe').forEach((b) => {
    b.addEventListener('click', () => openSubscribeModal());
  });
  document.querySelectorAll('[data-action="contact"]').forEach((b) => {
    b.addEventListener('click', async () => {
      const cfg = await loadConfig();
      openContactModal(cfg.adminEmail || cfg.contactEmail || 'gjlevitt@gmail.com');
    });
  });
  document.querySelectorAll('[data-action="subscribe"]').forEach((b) => {
    b.addEventListener('click', () => openSubscribeModal());
  });
}

/** "שיחות" link in the nav. Renders only when the visitor has at least one
 *  followed thread, and points straight at the most recently visited one
 *  so a single click resumes their last conversation. */
function conversationsLinkHtml() {
  const last = getLatestFollow();
  if (!last) return '';
  const href = `/y/${encodeURIComponent(last.year)}/${encodeURIComponent(last.slug)}/discuss/${encodeURIComponent(last.threadId)}`;
  return `<a href="${href}" class="nav-conversations-link">${icon('dialog', { size: 18 })} <span>שיחות</span></a>`;
}

export function footerHtml(config) {
  const tagline = config?.footer || 'עלון משמעות · פרשת השבוע';
  const year = new Date().getFullYear();
  return `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span>${tagline}</span>
        </div>
        <nav class="footer-nav" aria-label="קישורים בפוטר">
          <a href="/years">ארכיון</a>
          <a href="/search">חיפוש</a>
          <a href="/guide">מדריך</a>
          <button type="button" data-action="subscribe">קבל למייל</button>
          <button type="button" data-action="contact">צור קשר</button>
          <a href="/accessibility">הצהרת נגישות</a>
          <a href="/privacy">מדיניות פרטיות</a>
        </nav>
        <div class="footer-meta">© ${year}</div>
      </div>
    </footer>
  `;
}
