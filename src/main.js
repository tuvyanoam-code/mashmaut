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
import { renderGuide } from './pages/guide.js';
import { renderAdmin } from './pages/admin.js';
import { renderDiscussNew } from './pages/discussNew.js';
import { renderDiscussThread } from './pages/discussThread.js';
import { renderAccessibility, renderPrivacy } from './pages/legal.js';

defineRoute('/', renderHome);
defineRoute('/years', renderYears);
defineRoute('/y/:year', renderYear);
defineRoute('/y/:year/:slug', renderBulletin);
defineRoute('/y/:year/:slug/pdf', renderPdf);
defineRoute('/y/:year/:slug/discuss/new', renderDiscussNew);
defineRoute('/y/:year/:slug/discuss/:threadId', renderDiscussThread);
defineRoute('/search', renderSearch);
defineRoute('/guide', renderGuide);
defineRoute('/accessibility', renderAccessibility);
defineRoute('/privacy', renderPrivacy);
defineRoute('/admin', renderAdmin);
defineRoute('/admin/:section', renderAdmin);

startRouter();

// Accessibility toolbar (text size / contrast / stop motion / underline links).
// Mounted once, persists across route changes; required by IS 5568.
import('./components/a11yWidget.js').then((m) => m.initA11yWidget());

// Auto-hide the top nav on scroll-down (reveal on scroll-up) so it doesn't
// crowd the reading view. Skips the home splash + PDF view.
import('./components/navAutoHide.js').then((m) => m.initNavAutoHide());

// First-visit privacy/tracking notice — links to the privacy policy.
import('./components/privacyNotice.js').then((m) => m.initPrivacyNotice());

// Timed "subscribe to the weekly bulletin" invite — slides up after ~2 minutes
// on the site (once per browser, unless dismissed / already subscribed).
import('./components/subscribeBanner.js').then((m) => m.initSubscribeBanner());

// First-visit invite pointing at the usage guide — slides up ~7s after arrival,
// once per browser.
import('./components/guideBanner.js').then((m) => m.initGuideBanner());

// Warm up the search index in the background a couple of seconds after the
// initial route renders, so the user's first /search query is instant.
// Also opportunistically prune stale (>30d) reading-position entries.
const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
idle(() => {
  import('./lib/searchIndex.js').then((m) => m.warmupSearch && m.warmupSearch());
  import('./lib/readingPosition.js').then((m) => m.pruneStalePositions && m.pruneStalePositions());
});
