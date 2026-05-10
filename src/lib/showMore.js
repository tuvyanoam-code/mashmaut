// Tiny utility: take a UL/TBODY/grid that already contains all items, hide
// everything past the first N, and add an elegant "הצג עוד (N)" toggle
// after it. Click expands; click again collapses. Pure DOM, zero state
// tracking — call this once after each render and forget it.
//
// Usage:
//   applyShowMore(tbody, { initial: 4, after: tableElement });

const CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

export function applyShowMore(container, opts = {}) {
  if (!container) return;
  const initial = opts.initial != null ? opts.initial : 4;
  const labelMore = opts.label || 'הצג עוד';
  const labelLess = opts.labelLess || 'הצג פחות';
  // The toggle goes after the table/list (not inside, which would break
  // table semantics).
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

  const remaining = items.length - initial;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'show-more-btn';
  btn.innerHTML = `<span class="show-more-label">${labelMore} (${remaining})</span><span class="show-more-icon">${CHEVRON_SVG}</span>`;
  btn.addEventListener('click', () => {
    expanded = !expanded;
    apply();
    btn.classList.toggle('expanded', expanded);
    btn.querySelector('.show-more-label').textContent = expanded ? labelLess : `${labelMore} (${remaining})`;
  });

  if (after.nextSibling) after.parentNode.insertBefore(btn, after.nextSibling);
  else after.parentNode.appendChild(btn);
}
