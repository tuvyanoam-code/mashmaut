// Tiny contenteditable rich editor with a single "highlight" action.
// Returns sanitized HTML containing only <mark>, <strong>, and <br>.

import { icon } from '../icons.js';

export function mountRichEditor(container, initialHtml = '') {
  container.classList.add('rich-editor');
  container.innerHTML = `
    <div class="rich-editor-toolbar">
      <button type="button" data-cmd="highlight">${icon('edit', { size: 14 })} הדגש</button>
      <button type="button" data-cmd="bold"><b>B</b> מודגש</button>
      <button type="button" data-cmd="clear">נקה</button>
    </div>
    <div class="rich-editor-content" contenteditable="true" dir="rtl"></div>
  `;
  const content = container.querySelector('.rich-editor-content');
  content.innerHTML = sanitizeTeaser(initialHtml);

  const updateButtons = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const isHighlighted = !!findAncestor(range.startContainer, 'MARK');
    const isBold = !!findAncestor(range.startContainer, 'STRONG') || document.queryCommandState('bold');
    container.querySelectorAll('.rich-editor-toolbar button').forEach((b) => {
      const cmd = b.dataset.cmd;
      b.classList.toggle('active', (cmd === 'highlight' && isHighlighted) || (cmd === 'bold' && isBold));
    });
  };

  container.querySelector('.rich-editor-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    content.focus();
    const cmd = btn.dataset.cmd;
    if (cmd === 'highlight') toggleHighlight();
    else if (cmd === 'bold') document.execCommand('bold', false, null);
    else if (cmd === 'clear') {
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed) {
        document.execCommand('removeFormat', false, null);
        unwrapMarksInSelection();
      } else {
        content.innerHTML = '';
      }
    }
    updateButtons();
  });
  content.addEventListener('keyup', updateButtons);
  content.addEventListener('mouseup', updateButtons);

  return {
    get value() { return sanitizeTeaser(content.innerHTML); },
    set value(html) { content.innerHTML = sanitizeTeaser(html); },
    focus() { content.focus(); },
  };
}

function toggleHighlight() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const ancestor = findAncestor(range.startContainer, 'MARK');
  if (ancestor && range.toString().trim() === ancestor.textContent.trim()) {
    // Unwrap: replace <mark> with its children
    const parent = ancestor.parentNode;
    while (ancestor.firstChild) parent.insertBefore(ancestor.firstChild, ancestor);
    parent.removeChild(ancestor);
    return;
  }
  // Wrap: surround selected range with <mark>
  const mark = document.createElement('mark');
  try {
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    // Restore selection on the mark contents
    const newRange = document.createRange();
    newRange.selectNodeContents(mark);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } catch (_) { /* selection spans non-trivially */ }
}

function unwrapMarksInSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const marks = [];
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.tagName === 'MARK' && range.intersectsNode(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  let n;
  while ((n = walker.nextNode())) marks.push(n);
  for (const m of marks) {
    const parent = m.parentNode;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  }
}

function findAncestor(node, tagName) {
  while (node) {
    if (node.nodeType === 1 && node.tagName === tagName) return node;
    node = node.parentNode;
  }
  return null;
}

const ALLOWED = { MARK: [], STRONG: [], B: 'STRONG', BR: [], EM: [], I: 'EM' };

export function sanitizeTeaser(html) {
  if (!html) return '';
  // Server-side safe: parse via DOMParser
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const root = doc.body.firstChild;
  walk(root);
  return root.innerHTML.replace(/\s+/g, ' ').trim();

  function walk(node) {
    const children = Array.from(node.childNodes);
    for (const c of children) {
      if (c.nodeType === 3) continue; // text
      if (c.nodeType !== 1) { c.remove(); continue; }
      const map = ALLOWED[c.tagName];
      if (map === undefined) {
        // Unknown tag: replace with its children
        while (c.firstChild) node.insertBefore(c.firstChild, c);
        c.remove();
        walk(node);
        return;
      }
      // Strip all attributes
      [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      // Rename if mapped to canonical tag
      if (typeof map === 'string') {
        const renamed = doc.createElement(map);
        while (c.firstChild) renamed.appendChild(c.firstChild);
        c.replaceWith(renamed);
        walk(renamed);
      } else {
        walk(c);
      }
    }
  }
}
