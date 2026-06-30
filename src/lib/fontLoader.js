// Brand-font loader — deliberately NOT a plain @font-face.
//
// The font ships as an obfuscated blob (bt-2f9a.bin: the woff2 XOR-scrambled
// with KEY). At runtime we fetch it, un-scramble it in memory, and register it
// via the FontFace API. The upshot: DevTools → Sources/Network shows only an
// opaque .bin that won't open as a font, and there is no clean .woff2 URL to
// "Save as". This stops casual extraction.
//
// Honest scope: this is a speed bump, not DRM. A determined developer can still
// pull the bytes from the live FontFace or the network ArrayBuffer — no
// browser-delivered font can be truly un-extractable. The real protection is
// the font licence.

const SRC = '/fonts/bt-2f9a.bin';
const KEY = 'bt!2026~mEaNiNg';

export async function loadBrandFont() {
  // FontFace + the descriptors we need must exist; otherwise let the CSS
  // fallback stack (system-ui …) carry the page.
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  try {
    const res = await fetch(SRC, { cache: 'force-cache' });
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= KEY.charCodeAt(i % KEY.length);
    }
    const font = new FontFace('buTactica', bytes.buffer, {
      weight: '100 900',
      style: 'normal',
      display: 'swap',
    });
    await font.load();
    document.fonts.add(font);
  } catch (_) {
    /* network/parse failure → graceful fallback to system fonts */
  }
}
