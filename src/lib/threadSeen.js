// Per-thread "how much have I read" tracker, kept in localStorage so the
// bulletin thread-list can show an unread count for every conversation —
// not just the ones the user is following (that's myDiscussions.js).
//
// We store the total message count (opening post + replies) the browser has
// seen for each thread. Unread = current total − seen total. A thread the
// user has never opened has no entry, so all of its messages count as unread.

const STORAGE_KEY = 'mashmaut.threadSeen';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch (_) { return {}; }
}

/** Total messages seen in a thread, or null if never opened. */
export function getSeenCount(threadId) {
  if (!threadId) return null;
  const v = read()[threadId];
  return typeof v === 'number' ? v : null;
}

/** Record that the browser has now seen `count` messages in this thread.
 *  Only writes when the number actually grew, so re-renders are cheap and
 *  we never lower a previously-seen high-water mark. */
export function setSeenCount(threadId, count) {
  if (!threadId || typeof count !== 'number' || count < 0) return;
  const map = read();
  if (map[threadId] === count) return;
  map[threadId] = count;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (_) {}
}

/** Unread messages in a thread given its current total. A thread that was
 *  never opened returns its full total (nothing read yet). */
export function unreadFor(threadId, total) {
  const t = typeof total === 'number' ? total : 0;
  const seen = getSeenCount(threadId);
  if (seen === null) return t;
  return Math.max(0, t - seen);
}
