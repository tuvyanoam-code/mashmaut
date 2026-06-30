import './styles/base.css';
import './styles/components.css';
import './styles/admin.css';

import { loadBrandFont } from './lib/fontLoader.js';
// Kick off the (obfuscated) brand-font load immediately, in parallel with
// routing. Fire-and-forget: text renders in the system fallback first, then
// swaps to buTactica once it's decoded + registered.
loadBrandFont();

import { defineRoute, startRouter } from './router.js';
import { renderHome } from './pages/home.js';
import { renderYears } from './pages/years.js';
import { renderYear } from './pages/year.js';
import { renderBulletin } from './pages/bulletin.js';
import { renderPdf } from './pages/pdfView.js';
import { renderSearch } from './pages/search.js';
import { renderAdmin } from './pages/admin.js';
import { renderDiscussNew } from './pages/discussNew.js';
import { renderDiscussThread } from './pages/discussThread.js';

defineRoute('/', renderHome);
defineRoute('/years', renderYears);
defineRoute('/y/:year', renderYear);
defineRoute('/y/:year/:slug', renderBulletin);
defineRoute('/y/:year/:slug/pdf', renderPdf);
defineRoute('/y/:year/:slug/discuss/new', renderDiscussNew);
defineRoute('/y/:year/:slug/discuss/:threadId', renderDiscussThread);
defineRoute('/search', renderSearch);
defineRoute('/admin', renderAdmin);
defineRoute('/admin/:section', renderAdmin);

startRouter();

// Warm up the search index in the background a couple of seconds after the
// initial route renders, so the user's first /search query is instant.
// Also opportunistically prune stale (>30d) reading-position entries.
const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
idle(() => {
  import('./lib/searchIndex.js').then((m) => m.warmupSearch && m.warmupSearch());
  import('./lib/readingPosition.js').then((m) => m.pruneStalePositions && m.pruneStalePositions());
});
