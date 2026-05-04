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
        <div class="nav-actions">
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
