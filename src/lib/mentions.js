// @mention support for the discuss composer.
//
// The flow:
//   1. User types `@` in the textarea → findMentionTrigger() returns a
//      { start, query } object describing the trigger.
//   2. The composer renders a dropdown of matching participants pulled
//      from the current thread (collectParticipants()).
//   3. User picks one → insertMention() replaces "@query" with the full
//      "@Full Name " text.
//   4. On submit, extractMentions(body, participants) returns the list
//      of names mentioned, which is sent to the worker so it can decide
//      who to notify by email.
//   5. When rendering a message body, highlightMentions() wraps known
//      @Name spans in a styled element.
//
// Names can include Hebrew letters AND a space (e.g. "ישראל ישראלי"),
// so we can't tokenize on whitespace. Instead, every participant gets
// added as an exact match against the body text.

// Allowed characters in an autocomplete *query* (after typing `@`).
// Hebrew letters, latin, digits, underscore — single word at this
// stage. Multi-word names enter via autocomplete selection.
const MENTION_QUERY_CHAR = /[֐-׿a-zA-Z0-9_]/;

/** Look back from the cursor for an active "@…" trigger.
 *  Returns { start, query } or null. */
export function findMentionTrigger(textarea) {
  if (!textarea) return null;
  const text = textarea.value;
  const cursor = textarea.selectionStart;
  // Walk back from cursor, collecting query chars until we hit '@' or break.
  let i = cursor;
  let queryChars = [];
  while (i > 0) {
    const c = text[i - 1];
    if (c === '@') {
      // Require that '@' is at start-of-line or preceded by whitespace,
      // so we don't match emails like foo@bar.com.
      const prev = i >= 2 ? text[i - 2] : '';
      if (i === 1 || /\s/.test(prev)) {
        return { start: i - 1, query: queryChars.reverse().join('') };
      }
      return null;
    }
    if (!MENTION_QUERY_CHAR.test(c)) return null;
    queryChars.push(c);
    i--;
  }
  return null;
}

/** Replace the current "@query" with "@Full Name " and reposition the
 *  cursor right after the inserted text. */
export function insertMention(textarea, fullName, trigger) {
  const text = textarea.value;
  const cursor = textarea.selectionStart;
  const before = text.slice(0, trigger.start);
  const after = text.slice(cursor);
  const insert = `@${fullName} `;
  textarea.value = before + insert + after;
  const pos = before.length + insert.length;
  textarea.setSelectionRange(pos, pos);
  // Fire input so any listeners (auto-resize, char count, etc.) update.
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Collect unique author display-names from a thread + its replies.
 *  Excludes `self` so the user doesn't @-mention themselves. */
export function collectParticipants(thread, replies, { self } = {}) {
  const seen = new Set();
  const out = [];
  const consider = (m) => {
    if (!m || m.deleted) return;
    const name = (m.author || '').trim();
    if (!name) return;
    const norm = name.toLowerCase();
    if (seen.has(norm)) return;
    if (self && norm === String(self).toLowerCase()) return;
    seen.add(norm);
    out.push({ name, isAdmin: !!m.isAdmin });
  };
  consider(thread);
  (replies || []).forEach(consider);
  return out;
}

/** Filter participants by a typed query (case-insensitive, prefix-match
 *  on words). Empty query returns all. */
export function filterParticipants(participants, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return participants;
  return participants.filter((p) => {
    const name = p.name.toLowerCase();
    // Prefix match on the full string OR on any word inside it.
    if (name.startsWith(q)) return true;
    return name.split(/\s+/).some((w) => w.startsWith(q));
  });
}

/** From a finished message body + the known participant list, return
 *  the unique names that appear as `@Full Name` mentions. */
export function extractMentions(body, participants) {
  if (!body) return [];
  const text = String(body);
  const found = new Set();
  for (const p of participants || []) {
    // Word-boundary-ish: '@' preceded by start/whitespace, followed by
    // exact name and then end/whitespace/punctuation.
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\s)@${escaped}(?=$|\\s|[.,!?;:])`);
    if (re.test(text)) found.add(p.name);
  }
  return [...found];
}

/** Get viewport coordinates of the caret inside a textarea, using a
 *  hidden mirror div. Used to anchor the mention autocomplete to the
 *  current typing position (instead of to the textarea's edges). */
export function getCaretXY(input, position) {
  const div = document.createElement('div');
  const computed = window.getComputedStyle(input);
  const style = div.style;
  // Match every property that affects text layout — without this the
  // mirror wraps differently than the textarea and the coords drift.
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.overflow = 'hidden';
  const PROPS = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration',
    'letterSpacing', 'wordSpacing',
  ];
  PROPS.forEach((p) => { style[p] = computed[p]; });
  document.body.appendChild(div);
  div.textContent = input.value.substring(0, position);
  const marker = document.createElement('span');
  // Trailing '.' so the marker has a non-empty layout box.
  marker.textContent = input.value.substring(position) || '.';
  div.appendChild(marker);
  const inputRect = input.getBoundingClientRect();
  const coords = {
    top: inputRect.top + marker.offsetTop - input.scrollTop,
    left: inputRect.left + marker.offsetLeft - input.scrollLeft,
    lineHeight: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10),
  };
  document.body.removeChild(div);
  return coords;
}

/** For rendering: wrap known `@Name` spans in <span class="discuss-mention">.
 *  Operates on already-escaped HTML, so we re-escape names too. */
export function highlightMentions(escapedHtml, participants) {
  if (!escapedHtml || !participants || !participants.length) return escapedHtml;
  let out = escapedHtml;
  for (const p of participants) {
    const escapedName = p.name.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
    const reSrc = `(^|\\s)@(${escapedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|\\s|[.,!?;:])`;
    const re = new RegExp(reSrc, 'g');
    out = out.replace(re, (_, prefix, name) => `${prefix}<span class="discuss-mention">@${name}</span>`);
  }
  return out;
}
