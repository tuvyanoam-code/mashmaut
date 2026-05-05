import { icon } from '../icons.js';
import { loadConfig } from '../lib/store.js';
import { openSubscribeModal, openContactModal } from './subscribeModal.js';

export async function navHtml() {
  const config = await loadConfig();
  return `
    <nav class="nav">
      <div class="nav-inner">
        <a href="/" class="nav-brand">
          <span class="brand-mark">מ</span>
          <span>${config.siteName || 'משמעות'}</span>
        </a>
        <button class="nav-toggle" id="navToggle" type="button" aria-label="פתח תפריט" aria-expanded="false" aria-controls="navActions">
          ${icon('menu', { size: 22 })}
        </button>
        <div class="nav-actions" id="navActions">
          <a href="/years">${icon('archive', { size: 18 })} <span>ארכיון</span></a>
          <a href="/search">${icon('search', { size: 18 })} <span>חיפוש</span></a>
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

export function footerHtml(config) {
  return `
    <footer class="footer">
      <div class="container">${config?.footer || 'עלון משמעות'}</div>
    </footer>
  `;
}
