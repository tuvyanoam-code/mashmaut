import { icon } from '../icons.js';
import { shareLink } from '../lib/shareLinks.js';

export function shareButtonsHtml(ctx) {
  return `
    <div class="share-buttons" role="group" aria-label="שיתוף">
      <a class="share-btn" data-channel="whatsapp" href="${shareLink('whatsapp', ctx)}" target="_blank" rel="noopener" aria-label="שתף בוואטסאפ">${icon('whatsapp', { size: 20 })}</a>
      <a class="share-btn" data-channel="telegram" href="${shareLink('telegram', ctx)}" target="_blank" rel="noopener" aria-label="שתף בטלגרם">${icon('telegram', { size: 20 })}</a>
      <a class="share-btn" data-channel="email" href="${shareLink('email', ctx)}" aria-label="שלח במייל">${icon('email', { size: 20 })}</a>
      <a class="share-btn" data-channel="sms" href="${shareLink('sms', ctx)}" aria-label="שלח ב-SMS">${icon('sms', { size: 20 })}</a>
      <button class="share-btn" data-channel="copy" data-url="${ctx.url}" aria-label="העתק קישור">${icon('copy', { size: 20 })}</button>
    </div>
  `;
}

export function bindShareButtons(root, ctx) {
  const copyBtn = root.querySelector('.share-btn[data-channel="copy"]');
  if (!copyBtn) return;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ctx.url);
      copyBtn.classList.add('copied');
      showToast('הקישור הועתק');
      setTimeout(() => copyBtn.classList.remove('copied'), 1200);
    } catch (e) {
      showToast('לא הצלחנו להעתיק');
    }
  });
}

let toastEl = null;
let toastTimer = null;
export function showToast(text) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1800);
}
