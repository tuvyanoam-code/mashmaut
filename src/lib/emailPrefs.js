// Per-browser email notification preferences for discussions.
//
// Stored as a single JSON blob in localStorage. Four notification modes,
// mutually exclusive. The opt-in popup at first post writes a default mode
// of `mention` (least noisy reasonable default); the settings panel lets
// the user pick any other mode or turn notifications off entirely.
//
// Modes:
//   off      — no email notifications, but an address may still be stored
//   mention  — only when someone @mentions me or replies directly to me
//   admin    — only when the admin/moderator replies
//   all      — every new reply in any thread I've participated in

const STORAGE_KEY = 'mashmaut.emailPrefs';

export const MODES = ['off', 'mention', 'admin', 'all'];

const DEFAULTS = {
  email: '',
  mode: 'mention',
  // True once we've shown the opt-in popup at least once (whether the user
  // said yes or no), so the modal doesn't keep nagging on every reply.
  opted: false,
};

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function write(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {}
}

export function getEmailPrefs() { return read(); }

export function setEmailPrefs(patch) {
  const next = { ...read(), ...patch };
  // Normalize mode
  if (!MODES.includes(next.mode)) next.mode = 'mention';
  // Email must be present when mode is anything other than 'off'.
  if (next.mode !== 'off' && !next.email) next.mode = 'off';
  write(next);
  return next;
}

/** Has the user already been asked about email notifications? */
export function hasOpted() { return !!read().opted; }

/** Mark the user as opted (whether they said yes or no). */
export function markOpted() { write({ ...read(), opted: true }); }

export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}
