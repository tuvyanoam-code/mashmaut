// Builders for share-link URLs across channels.
// Each builder accepts ({ url, parshaName, year }) and returns a string URL.

const baseText = ({ parshaName, year }) =>
  `עלון משמעות פרשת ${parshaName} (${year}) — מומלץ בחום, קריאה קצרה ומעוררת:`;

export function shareLink(channel, ctx) {
  const text = baseText(ctx);
  const fullText = `${text}\n${ctx.url}`;
  switch (channel) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodeURIComponent(fullText)}`;
    case 'telegram':
      return `https://t.me/share/url?url=${encodeURIComponent(ctx.url)}&text=${encodeURIComponent(text)}`;
    case 'email':
      return `mailto:?subject=${encodeURIComponent('עלון משמעות — פרשת ' + ctx.parshaName)}&body=${encodeURIComponent(fullText)}`;
    case 'sms':
      // sms: scheme uses ?body= on iOS, ?body= on Android (with separator) — both accept '?'
      return `sms:?body=${encodeURIComponent(fullText)}`;
    default:
      return ctx.url;
  }
}
