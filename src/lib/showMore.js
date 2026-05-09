// Tiny utility: take a UL or TBODY that already contains all rows, hide
// everything past the first N, and add a "הצג עוד (N)" button after it.
// Click expands; click again collapses. Pure DOM, zero state tracking — call
// this once after rendering each list and forget it.
//
// Usage:
//   applyShowMore(tbody, { initial: 10, label: 'הצג עוד', after: tableElement });

export function applyShowMore(container, opts = {}) {
  if (!container) return;
  const initial = opts.initial || 10;
  const labelMore = opts.label || 'הצג עוד';
  const labelLess = opts.labelLess || 'הצג פחות';
  // Insert the toggle button after the table/list, not inside it (would break
  // table structure for tbody case).
  const after = opts.after || container.parentElement || container;
  const items = Array.from(container.children);
  if (items.length <= initial) return;

  let expanded = false;
  const apply = () => {
    items.forEach((el, i) => {
      el.style.display = (expanded || i < initial) ? '' : 'none';
    });
  };

  apply();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'show-more-btn';
  const remaining = items.length - initial;
  btn.textContent = `${labelMore} (${remaining})`;
  btn.addEventListener('click', () => {
    expanded = !expanded;
    apply();
    btn.textContent = expanded ? labelLess : `${labelMore} (${remaining})`;
  });

  // Insert immediately after `after` element.
  if (after.nextSibling) after.parentNode.insertBefore(btn, after.nextSibling);
  else after.parentNode.appendChild(btn);
}
