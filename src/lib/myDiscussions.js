// Tracks the discussion threads the current browser has participated in.
// "Participated" = either started the thread or posted a reply. Stored in
// localStorage so it survives across visits.
//
// Used by the user menu to show "you have N new replies in conversations
// you're following".

const STORAGE_KEY = 'mashmaut.followedThreads';

/** Returns the most-recently-touched followed thread (or null). "Touched"
 *  here means lastSeenAt — i.e. the last one the user actually visited or
 *  posted in. Used by the nav's "שיחות" link to deep-link into the most
 *  current conversation in one click. */
export function getLatestFollow() {
  const list = getFollows();
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''))[0];
}

/** Read the current follow list. Always returns an array. */
export function getFollows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function save(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
}

/** Mark a thread as followed. Idempotent — won't duplicate. Updates lastSeenAt
 *  to now (the act of posting/visiting the thread is itself an "I've seen the
 *  current state"). */
export function follow({ year, slug, threadId, title, parshaName }) {
  if (!year || !slug || !threadId) return;
  const list = getFollows();
  const i = list.findIndex((f) => f.threadId === threadId);
  const now = new Date().toISOString();
  const entry = {
    year, slug, threadId,
    title: title || (i >= 0 ? list[i].title : ''),
    parshaName: parshaName || (i >= 0 ? list[i].parshaName : ''),
    followedAt: i >= 0 ? list[i].followedAt : now,
    lastSeenAt: now,
  };
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.unshift(entry);
  save(list.slice(0, 50)); // cap to last 50
}

/** Bring a follow's lastSeenAt up to the given timestamp (or now). */
export function markSeen(threadId, ts) {
  const list = getFollows();
  const i = list.findIndex((f) => f.threadId === threadId);
  if (i < 0) return;
  list[i].lastSeenAt = ts || new Date().toISOString();
  save(list);
}

/** Stop following a thread. */
export function unfollow(threadId) {
  const list = getFollows().filter((f) => f.threadId !== threadId);
  save(list);
}

/** For each followed thread, fetch its current meta and compute newRepliesCount.
 *  Uses the existing /discuss/threads/:id endpoint which returns thread + replies.
 *  In a separate file (the user menu) we cache the result for ~30s. */
import { getThread } from './threads.js';

export async function checkUpdates({ concurrency = 4 } = {}) {
  const follows = getFollows();
  if (!follows.length) return [];
  const results = [];
  // Concurrency-limited fetch — typical user has < 10 follows so this is fine.
  let i = 0;
  async function worker() {
    while (i < follows.length) {
      const idx = i++;
      const f = follows[idx];
      try {
        const data = await getThread({ year: f.year, slug: f.slug, threadId: f.threadId });
        const thread = data.thread;
        const replies = data.replies || [];
        const liveLastAt = thread.lastAt || thread.createdAt;
        // Count replies created STRICTLY after lastSeenAt that aren't your own.
        // (We don't have the user's fp here — the menu can pass it in if needed.)
        const newReplies = replies.filter((r) => (r.createdAt || '') > (f.lastSeenAt || ''));
        const lastReplyAuthor = newReplies.length ? newReplies[newReplies.length - 1].author : null;
        results.push({
          ...f,
          liveTitle: thread.title || f.title,
          liveLastAt,
          newRepliesCount: newReplies.length,
          lastReplyAuthor,
          deleted: !!thread.deleted,
        });
      } catch (_) {
        // Thread might have been deleted or network failed. Keep the entry so
        // the user can still navigate / clear it manually.
        results.push({ ...f, newRepliesCount: 0, error: true });
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, follows.length) }, () => worker());
  await Promise.all(workers);
  // Newest activity first.
  results.sort((a, b) => (b.liveLastAt || '').localeCompare(a.liveLastAt || ''));
  return results;
}
