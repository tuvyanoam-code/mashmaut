/**
 * Delayed loading helper. Eliminates the "flash" between fast page transitions
 * by NOT blanking the screen up-front. The spinner is only shown if the caller
 * hasn't rendered within `delay` ms. If the caller renders sooner, it calls
 * the returned cancel fn and the previous page's content stays visible the
 * entire time.
 *
 * Usage:
 *   const cancel = delayedLoading(app);
 *   const data = await fetchSomething();
 *   cancel();
 *   app.innerHTML = renderActual(data);
 */
export function delayedLoading(root, delay = 250) {
  const t = setTimeout(() => {
    root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }, delay);
  return () => clearTimeout(t);
}
