import './styles/base.css';
import './styles/components.css';
import './styles/admin.css';

import { defineRoute, startRouter } from './router.js';
import { renderHome } from './pages/home.js';
import { renderYears } from './pages/years.js';
import { renderYear } from './pages/year.js';
import { renderBulletin } from './pages/bulletin.js';
import { renderPdf } from './pages/pdfView.js';
import { renderSearch } from './pages/search.js';
import { renderAdmin } from './pages/admin.js';

defineRoute('/', renderHome);
defineRoute('/years', renderYears);
defineRoute('/y/:year', renderYear);
defineRoute('/y/:year/:slug', renderBulletin);
defineRoute('/y/:year/:slug/pdf', renderPdf);
defineRoute('/search', renderSearch);
defineRoute('/admin', renderAdmin);
defineRoute('/admin/:section', renderAdmin);

startRouter();

// Warm up the search index in the background a couple of seconds after the
// initial route renders, so the user's first /search query is instant.
const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
idle(() => {
  import('./lib/searchIndex.js').then((m) => m.warmupSearch && m.warmupSearch());
});
