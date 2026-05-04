import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig } from '../lib/store.js';
import { searchAll } from '../lib/searchIndex.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';

export async function renderSearch({ query }) {
  const app = document.getElementById('app');
  const [config, nav] = await Promise.all([loadConfig(), navHtml()]);
  const initial = query?.q || '';

  app.innerHTML = `
    <div class="fade-in">
      ${nav}
      <main class="search-page">
        <h1>חיפוש בעלונים</h1>
        <form class="search-bar" id="searchForm">
          ${icon('search', { size: 20 })}
          <input id="searchInput" type="text" name="q" placeholder="מילה, פרשה או כותרת" value="${escapeHtml(initial)}" autocomplete="off" autofocus />
          <button class="btn" type="submit">חפש</button>
        </form>
        <div id="searchResults"></div>
      </main>
      ${footerHtml(config)}
    </div>
  `;

  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    navigate('/search?q=' + encodeURIComponent(q));
  });

  if (initial) {
    runSearch(initial, results);
  } else {
    results.innerHTML = `<p class="muted center" style="padding:40px 0;">הקלד מילה כדי לחפש</p>`;
  }
  bindNav();
}

async function runSearch(q, container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const found = await searchAll(q);
    if (!found.length) {
      container.innerHTML = `<p class="muted center" style="padding:40px 0;">לא נמצאו תוצאות עבור "${escapeHtml(q)}"</p>`;
      return;
    }
    container.innerHTML = found.map((r) => `
      <div class="search-result">
        <a href="/y/${r.week.yearId}/${r.week.slug}">
          <h3>פרשת ${r.week.parshaName}</h3>
          <div class="search-result-meta">${r.week.yearDisplay || ''}${r.week.dateLabel ? ' · ' + r.week.dateLabel : ''}</div>
          <div class="search-result-snippet">${r.snippet || r.docTeaser || ''}</div>
        </a>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="muted center" style="padding:40px 0;">שגיאה בחיפוש</p>`;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
