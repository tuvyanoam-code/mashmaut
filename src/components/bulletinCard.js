import { icon } from '../icons.js';

export function bulletinCardHtml(week) {
  const colors = week.colors || {};
  const primary = colors.primary || '#2d6a4f';
  const secondary = colors.secondary || colors.accent || '#52b788';
  const dateText = week.dateLabel || '';
  return `
    <a class="bulletin-card" href="/y/${week.yearId}/${week.slug}"
       style="--card-accent:${primary}; --card-gradient: linear-gradient(135deg, ${primary}, ${secondary});">
      <div class="bulletin-card-content">
        <div class="bulletin-card-eyebrow">פרשת השבוע</div>
        <div class="bulletin-card-title">${week.parshaName}</div>
        <div class="bulletin-card-meta">${week.yearDisplay || ''} ${dateText ? '· ' + dateText : ''}</div>
      </div>
      <div class="bulletin-card-arrow">קרא את העלון ${icon('arrowLeft', { size: 16 })}</div>
    </a>
  `;
}
