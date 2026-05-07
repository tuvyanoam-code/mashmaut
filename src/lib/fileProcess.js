// Browser-side file processing: Word → semantic HTML and PDF → dominant colors.
// Replaces the previous local-server processing so the admin can run anywhere.

import * as mammoth from 'mammoth/mammoth.browser.js';

const STYLE_MAP = [
  "p[style-name='Title'] => h1.bulletin-title:fresh",
  "p[style-name='Subtitle'] => h2.bulletin-subtitle:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='Heading'] => h2:fresh",
  "p[style-name='כותרת 1'] => h1:fresh",
  "p[style-name='כותרת 2'] => h2:fresh",
  "p[style-name='כותרת 3'] => h3:fresh",
  "p[style-name='כותרת'] => h1:fresh",
  // Custom Hebrew styles seen in real bulletins:
  "p[style-name='כותרת ראשית'] => h1:fresh",
  "p[style-name='כותר שם פרשה'] => h1:fresh",
  "p[style-name='כותרת משנה'] => h2:fresh",
  "p[style-name='כותר משנה'] => h2:fresh",
  "p[style-name='תת כותרת'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Block Quote'] => blockquote:fresh",
  "p[style-name='ציטוט'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

// Heuristic heading detector — promotes paragraphs that look like headings
// even when the author used direct formatting (bold/larger font) instead of
// applying Word's "Heading" styles. Common with Hebrew docs.
function promoteVisualHeadings(rawHtml) {
  // Match <p>...</p> where the entire visible content is wrapped in a single
  // <strong>. Skip paragraphs with multiple runs or trailing text.
  return rawHtml.replace(/<p\b([^>]*)>\s*<strong>([^<]+)<\/strong>\s*<\/p>/g, (match, attrs, inner) => {
    const text = inner.trim();
    if (!text) return match;
    // Heuristic guards — keep heading-like only:
    if (text.length > 90) return match;          // long lines aren't headings
    if (/[.!?״:][\s)]*$/.test(text)) {
      // Headings often end without a period. But Hebrew "?" (question heading
      // like "קידוש ה׳ – הכיצד?") is fine, and ":" can mark a heading too.
      if (!/[?:]$/.test(text)) return match;
    }
    return `<h2${attrs}>${text}</h2>`;
  });
}

export async function convertWordToHtml(arrayBuffer) {
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer }, { styleMap: STYLE_MAP }),
    mammoth.extractRawText({ arrayBuffer }),
  ]);
  let rawHtml = htmlResult.value;
  const plainText = textResult.value;

  // If mammoth returned no headings, run the heuristic to recover visually-
  // styled headings (bold-only short lines).
  if (!/<h[1-3]\b/i.test(rawHtml)) {
    rawHtml = promoteVisualHeadings(rawHtml);
  }

  const headings = [];
  const re = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(rawHtml)) !== null) {
    const level = parseInt(m[1].slice(1), 10);
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text) headings.push({ level, text, id: 'h-' + (i++) });
  }

  i = 0;
  const html = rawHtml.replace(/<(h[1-3])([^>]*)>/gi, (full, tag, attrs) => {
    const h = headings[i++];
    if (!h || /id\s*=/.test(attrs)) return full;
    return `<${tag}${attrs} id="${h.id}">`;
  });

  return { html, plainText, headings };
}

// PDF color extraction using pdf.js + canvas in the browser
let _pdfjs;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  // Use the bundled worker via Vite's worker import
  const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;
  _pdfjs = pdfjsLib;
  return pdfjsLib;
}

const FALLBACK_PALETTES = [
  { primary: '#2d6a4f', secondary: '#52b788', accent: '#95d5b2', background: '#f6fbf8', bgEnd: '#e3f1e9', text: '#1a1a1a' },
  { primary: '#7b3f00', secondary: '#bc6c25', accent: '#dda15e', background: '#fdf8f3', bgEnd: '#f4e7d4', text: '#1a1a1a' },
  { primary: '#5a189a', secondary: '#9d4edd', accent: '#c77dff', background: '#fbf7fd', bgEnd: '#f0e2f8', text: '#1a1a1a' },
  { primary: '#1d4e89', secondary: '#3066be', accent: '#5b9eed', background: '#f4f8fd', bgEnd: '#dee9f8', text: '#1a1a1a' },
  { primary: '#9d0208', secondary: '#d00000', accent: '#dc2f02', background: '#fdf6f5', bgEnd: '#f7d8d4', text: '#1a1a1a' },
];

/**
 * Extract plain text from every page of a PDF (browser-side via pdf.js).
 * Used at upload time so PDF-only bulletins (no Word file) are still
 * searchable. Returns "" on failure — search just falls back to title +
 * teaser as before.
 */
export async function extractPdfText(arrayBuffer) {
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableFontFace: true,
    }).promise;
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // pdf.js returns each text fragment as an item with `.str`. Joining
      // with spaces is good enough for search; we don't need perfect prose.
      const pageText = content.items.map((it) => it.str || '').join(' ');
      parts.push(pageText);
    }
    return parts.join('\n\n').replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.warn('PDF text extraction failed:', e.message);
    return '';
  }
}

export async function extractPdfPalette(arrayBuffer) {
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableFontFace: true,
    }).promise;
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = 240 / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return paletteFromImageData(imageData);
  } catch (e) {
    console.warn('Color extraction failed:', e.message);
    return FALLBACK_PALETTES[Math.floor(Math.random() * FALLBACK_PALETTES.length)];
  }
}

function paletteFromImageData(imageData) {
  const { data, width, height } = imageData;
  const buckets = new Map();
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 4000));
  for (let i = 0; i < total; i += step) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
    if (a < 200) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 240 && min > 230) continue;
    if (max < 28) continue;
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
    buckets.set(key, bucket);
  }
  const sorted = [...buckets.values()]
    .map((b) => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }))
    .sort((a, b) => b.count - a.count);

  const top = sorted.slice(0, 8);
  const score = (c) => {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const sat = max === 0 ? 0 : (max - min) / max;
    return sat * Math.log10(c.count + 10);
  };
  top.sort((a, b) => score(b) - score(a));
  const primary = top[0] || { r: 45, g: 106, b: 79 };
  const secondary = top[1] || lighten(primary, 0.2);
  const accent = top[2] || lighten(primary, 0.4);
  return {
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    accent: rgbToHex(accent),
    background: rgbToHex(lighten(primary, 0.92)),
    bgEnd: rgbToHex(lighten(primary, 0.85)),
    text: '#1a1a1a',
  };
}

function lighten(c, amt) {
  return {
    r: Math.round(c.r + (255 - c.r) * amt),
    g: Math.round(c.g + (255 - c.g) * amt),
    b: Math.round(c.b + (255 - c.b) * amt),
  };
}

function rgbToHex(c) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}

// Helper to convert a File to base64 (without data: prefix) for the Worker
export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
