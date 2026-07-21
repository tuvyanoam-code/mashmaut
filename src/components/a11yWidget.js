// Accessibility toolbar — required by IS 5568 (a widget alone is NOT enough,
// but the site must offer these controls). A floating button opens a panel
// with: text-size, high-contrast, underline-links and stop-motion toggles.
// State persists in localStorage and is applied to <html> so it survives
// route changes and reloads. The widget itself is fully keyboard-operable.

const STORAGE_KEY = 'mashmaut.a11y';
const MIN_SCALE = 1;
const MAX_SCALE = 1.6;
const STEP = 0.1;

const DEFAULTS = { scale: 1, contrast: false, underline: false, stopMotion: false };

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) { return { ...DEFAULTS }; }
}
function write(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

let state = { ...DEFAULTS };

function apply() {
  const root = document.documentElement;
  // Text scale — scaling the root font-size scales every rem/em-based size.
  root.style.fontSize = state.scale === 1 ? '' : `${Math.round(state.scale * 100)}%`;
  root.classList.toggle('a11y-contrast', !!state.contrast);
  root.classList.toggle('a11y-underline', !!state.underline);
  root.classList.toggle('a11y-stop-motion', !!state.stopMotion);
}

export function initA11yWidget() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('a11yFab')) return; // mount once
  state = read();
  apply();

  const host = document.createElement('div');
  host.className = 'a11y-root';
  // The "+ / −" glyphs sit right after an aleph; buTactica ligates that into an
  // elongated aleph, so a zero-width non-joiner (‌) separates them.
  host.innerHTML = `
    <button type="button" class="a11y-reveal" data-a11y-reveal aria-label="הצג כפתור נגישות" aria-expanded="false">
      ${chevronIcon()}
    </button>
    <button type="button" id="a11yFab" class="a11y-fab" aria-haspopup="dialog" aria-expanded="false" aria-controls="a11yPanel" aria-label="תפריט נגישות">
      ${accessibilityIcon()}
    </button>
    <div id="a11yPanel" class="a11y-panel" role="dialog" aria-modal="false" aria-label="הגדרות נגישות" hidden>
      <div class="a11y-panel-head" style="--i:6">
        <h2 class="a11y-panel-title">נגישות</h2>
        <button type="button" class="a11y-panel-close" aria-label="סגור תפריט נגישות">✕</button>
      </div>

      <div class="a11y-group" role="group" aria-label="גודל טקסט" style="--i:5">
        <span class="a11y-group-label">גודל טקסט</span>
        <div class="a11y-textsize">
          <button type="button" class="a11y-btn" data-act="dec" aria-label="הקטן טקסט">א‌−</button>
          <span class="a11y-scale-val" data-scale-val aria-live="polite">100%</span>
          <button type="button" class="a11y-btn" data-act="inc" aria-label="הגדל טקסט">א‌+</button>
        </div>
      </div>

      <button type="button" class="a11y-toggle" data-act="contrast" aria-pressed="false" style="--i:4">
        <span>ניגודיות גבוהה</span><span class="a11y-toggle-state" aria-hidden="true"></span>
      </button>
      <button type="button" class="a11y-toggle" data-act="underline" aria-pressed="false" style="--i:3">
        <span>הדגשת קישורים</span><span class="a11y-toggle-state" aria-hidden="true"></span>
      </button>
      <button type="button" class="a11y-toggle" data-act="stopMotion" aria-pressed="false" style="--i:2">
        <span>עצירת אנימציות</span><span class="a11y-toggle-state" aria-hidden="true"></span>
      </button>

      <button type="button" class="a11y-reset" data-act="reset" style="--i:1">איפוס הגדרות</button>
      <a class="a11y-statement-link" href="/accessibility" style="--i:0">להצהרת הנגישות</a>
    </div>
  `;
  document.body.appendChild(host);

  const fab = host.querySelector('#a11yFab');
  const panel = host.querySelector('#a11yPanel');
  const closeBtn = host.querySelector('.a11y-panel-close');
  const revealBtn = host.querySelector('[data-a11y-reveal]');
  let hideTimer = null;

  // On mobile the widget collapses to a tiny corner arrow; tapping it reveals
  // the full accessibility button (CSS handles the show/hide per breakpoint).
  const reveal = () => {
    host.classList.add('a11y-revealed');
    revealBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => fab.focus());
  };
  const collapse = () => {
    host.classList.remove('a11y-revealed');
    revealBtn.setAttribute('aria-expanded', 'false');
  };
  revealBtn.addEventListener('click', () => {
    host.classList.contains('a11y-revealed') ? collapse() : reveal();
  });

  const openPanel = () => {
    clearTimeout(hideTimer);
    panel.hidden = false;
    host.classList.add('a11y-open');
    // Force a reflow so the collapsed→open transition plays even when rAF is
    // throttled (inactive/background tabs).
    void panel.offsetWidth;
    panel.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    // Focus the first control for keyboard users.
    panel.querySelector('button, a')?.focus();
  };
  const closePanel = ({ focusFab = true } = {}) => {
    panel.classList.remove('open');
    host.classList.remove('a11y-open');
    fab.setAttribute('aria-expanded', 'false');
    hideTimer = setTimeout(() => { panel.hidden = true; }, 420);
    const wasRevealed = host.classList.contains('a11y-revealed');
    collapse(); // return to the minimal arrow on mobile
    // Move focus to whatever stays visible (the arrow on mobile, the FAB on desktop).
    if (focusFab) (wasRevealed ? revealBtn : fab).focus();
  };
  const togglePanel = () => (panel.hidden ? openPanel() : closePanel());

  fab.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', () => closePanel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });
  document.addEventListener('click', (e) => {
    if (host.contains(e.target)) return;
    if (!panel.hidden) closePanel({ focusFab: false });
    else if (host.classList.contains('a11y-revealed')) collapse();
  });

  host.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => onAction(btn.dataset.act, host));
  });

  syncUI(host);
}

function onAction(act, host) {
  switch (act) {
    case 'inc': state.scale = Math.min(MAX_SCALE, +(state.scale + STEP).toFixed(2)); break;
    case 'dec': state.scale = Math.max(MIN_SCALE, +(state.scale - STEP).toFixed(2)); break;
    case 'contrast': state.contrast = !state.contrast; break;
    case 'underline': state.underline = !state.underline; break;
    case 'stopMotion': state.stopMotion = !state.stopMotion; break;
    case 'reset': state = { ...DEFAULTS }; break;
    default: return;
  }
  apply();
  write(state);
  syncUI(host);
}

function syncUI(host) {
  host.querySelector('[data-scale-val]').textContent = `${Math.round(state.scale * 100)}%`;
  const setPressed = (act, on) => {
    const b = host.querySelector(`[data-act="${act}"]`);
    if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-on', !!on); }
  };
  setPressed('contrast', state.contrast);
  setPressed('underline', state.underline);
  setPressed('stopMotion', state.stopMotion);
  // Disable the size buttons at their limits.
  const dec = host.querySelector('[data-act="dec"]');
  const inc = host.querySelector('[data-act="inc"]');
  if (dec) dec.disabled = state.scale <= MIN_SCALE;
  if (inc) inc.disabled = state.scale >= MAX_SCALE;
}

function accessibilityIcon() {
  // Universal accessibility figure.
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="12" cy="4" r="2"/>
    <path d="M12 7.5c-1.6 0-3.2.5-5.2 1.2a1.1 1.1 0 0 0 .7 2.1c1.2-.4 2.3-.7 3.1-.85V13l-2.1 6.1a1.15 1.15 0 0 0 2.17.76L12.05 15h-.02l1.35 4.86a1.15 1.15 0 0 0 2.17-.76L13.4 13v-3.1c.85.15 2 .45 3.1.85a1.1 1.1 0 0 0 .7-2.1C15.2 8 13.6 7.5 12 7.5z"/>
  </svg>`;
}

function chevronIcon() {
  // Small chevron pointing out from the edge — the "reveal" affordance on mobile.
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <polyline points="9 6 15 12 9 18"/>
  </svg>`;
}
