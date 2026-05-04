// Simple, reliable Hebrew search.
// Iterates all weeks and matches normalized terms against parsha name, headings,
// teaser, and full text. Lunr was abandoned because its English-centric pipeline
// silently drops Hebrew tokens; for our small corpus, linear scan is plenty fast.

import { loadIndex, loadBulletin } from './store.js';

const NIKUD_REGEX = /[֑-ׇ]/g;

function normalize(s) {
  return (s || '')
    .replace(NIKUD_REGEX, '')
    .replace(/[׳״״׳"'`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

let _docCache = null;

async function buildDocs() {
  if (_docCache) return _docCache;
  const idx = await loadIndex();
  const weeks = idx.weeks || [];
  const docs = [];
  for (const w of weeks) {
    let bulletin = null;
    try { bulletin = await loadBulletin(w.yearId, w.slug); } catch (_) {}
    const headingsText = (bulletin?.headings || []).map((h) => h.text).join(' • ');
    const text = bulletin?.plainText || '';
    docs.push({
      week: w,
      parshaN: normalize(w.parshaName),
      yearN: normalize(w.yearDisplay),
      headingsN: normalize(headingsText),
      textN: normalize(text),
      teaserN: normalize(w.teaser || bulletin?.teaser || ''),
      headingsRaw: headingsText,
      textRaw: text,
      teaserRaw: w.teaser || bulletin?.teaser || '',
    });
  }
  _docCache = docs;
  return docs;
}

export async function searchAll(query) {
  const q = normalize(query);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const docs = await buildDocs();

  const results = [];
  for (const d of docs) {
    let score = 0;
    let matchSource = '';
    let matchSourceText = '';

    // Exact phrase in parsha name
    if (d.parshaN.includes(q)) {
      score += 100;
      matchSource = 'parsha';
    }

    for (const t of terms) {
      if (d.parshaN.includes(t)) score += 40;
      if (d.headingsN.includes(t)) { score += 20; if (!matchSource) { matchSource = 'headings'; matchSourceText = d.headingsRaw; } }
      if (d.teaserN.includes(t)) { score += 10; if (!matchSource) { matchSource = 'teaser'; matchSourceText = d.teaserRaw; } }
      if (d.textN.includes(t)) { score += 5; if (!matchSource) { matchSource = 'text'; matchSourceText = d.textRaw; } }
      if (d.yearN.includes(t)) score += 3;
    }

    if (score > 0) {
      const snippet = matchSource === 'parsha'
        ? d.teaserRaw || ''
        : extractSnippet(matchSourceText, terms);
      results.push({ score, week: d.week, snippet, matchSource });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function extractSnippet(text, terms) {
  if (!text) return '';
  const lower = normalize(text);
  let best = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  // Map index back from normalized to raw using char offset (close enough since
  // normalization is mostly stripping zero-width nikud + lowercasing)
  const start = Math.max(0, (best < 0 ? 0 : best) - 60);
  const end = Math.min(text.length, start + 240);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '… ' + snippet;
  if (end < text.length) snippet = snippet + ' …';
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    snippet = snippet.replace(re, '<mark>$1</mark>');
  }
  return snippet;
}
