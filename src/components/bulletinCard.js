import { icon } from '../icons.js';

export function bulletinCardHtml(week) {
  const colors = week.colors || {};
  const primary = colors.primary || '#2d6a4f';
  const secondary = colors.secondary || colors.accent || '#52b788';
  const dateText = week.dateLabel || '';
  const issue = week.issueNumber;
  return `
    <a class="bulletin-card" href="/y/${week.yearId}/${week.slug}"
       style="--card-accent:${primary}; --card-gradient: linear-gradient(135deg, ${primary}, ${secondary});">
      <span class="bulletin-card-strip" aria-hidden="true"></span>
      ${issue ? `<span class="bulletin-card-issue" aria-hidden="true">#${issue}</span>` : ''}
      <div class="bulletin-card-content">
        <div class="bulletin-card-eyebrow">פרשה</div>
        <div class="bulletin-card-title">${week.parshaName}</div>
        <div class="bulletin-card-meta">${week.yearDisplay || ''}${dateText ? ' · ' + dateText : ''}</div>
      </div>
      <div class="bulletin-card-arrow"><span>קרא</span> ${icon('arrowLeft', { size: 14 })}</div>
    </a>
  `;
}
