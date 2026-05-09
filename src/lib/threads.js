// Public discussion-threads client. Wraps the Worker's /discuss/* endpoints.
// Each bulletin can have many threads; each thread has a title, an opening
// message, and a chronological list of replies.

import { apiBase } from './api.js';
import { ensureFp } from './fp.js';

async function call(path, opts = {}) {
  const base = await apiBase();
  if (!base) throw new Error('API not configured');
  const r = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    const e = new Error(data.error || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

const q = (obj) => new URLSearchParams(obj).toString();

export async function listThreads({ year, slug }) {
  return call('/discuss/threads?' + q({ year, slug }));
}

export async function getThread({ year, slug, threadId }) {
  return call('/discuss/threads/' + encodeURIComponent(threadId) + '?' + q({ year, slug }));
}

export async function createThread({ year, slug, title, body, displayName }) {
  return call('/discuss/threads', {
    method: 'POST',
    body: { year, slug, title, body, displayName, fp: ensureFp(), honeypot: '' },
  });
}

export async function postReply({ year, slug, threadId, body, displayName }) {
  return call('/discuss/threads/' + encodeURIComponent(threadId) + '/reply', {
    method: 'POST',
    body: { year, slug, body, displayName, fp: ensureFp(), honeypot: '' },
  });
}

export async function editThread({ year, slug, threadId, title, body }) {
  const payload = { year, slug, fp: ensureFp() };
  if (title !== undefined) payload.title = title;
  if (body !== undefined) payload.body = body;
  return call('/discuss/threads/' + encodeURIComponent(threadId), {
    method: 'PUT', body: payload,
  });
}

export async function editReply({ year, slug, threadId, replyId, body }) {
  return call('/discuss/replies/' + encodeURIComponent(replyId), {
    method: 'PUT', body: { year, slug, threadId, body, fp: ensureFp() },
  });
}

export async function reactThread({ year, slug, threadId, emoji }) {
  return call('/discuss/threads/' + encodeURIComponent(threadId) + '/react', {
    method: 'POST', body: { year, slug, emoji, fp: ensureFp() },
  });
}

export async function reactReply({ year, slug, threadId, replyId, emoji }) {
  return call('/discuss/replies/' + encodeURIComponent(replyId) + '/react', {
    method: 'POST', body: { year, slug, threadId, emoji, fp: ensureFp() },
  });
}

export async function reportThread({ year, slug, threadId, reason = '' }) {
  return call('/discuss/threads/' + encodeURIComponent(threadId) + '/report', {
    method: 'POST', body: { year, slug, reason, fp: ensureFp() },
  });
}

export async function reportReply({ year, slug, threadId, replyId, reason = '' }) {
  return call('/discuss/replies/' + encodeURIComponent(replyId) + '/report', {
    method: 'POST', body: { year, slug, threadId, reason, fp: ensureFp() },
  });
}
