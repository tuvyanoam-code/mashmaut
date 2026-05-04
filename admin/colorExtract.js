// Server-side dominant-color extraction from a PDF's first page.
// Uses pdfjs-dist with the node canvas backend.

import { promises as fs } from 'fs';

let pdfjs;
let canvasModule;

async function loadDeps() {
  if (!pdfjs) {
    // Use the legacy build for Node compatibility
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  if (!canvasModule) {
    try {
      canvasModule = await import('canvas');
    } catch (_) {
      canvasModule = null;
    }
  }
  return { pdfjs, canvasModule };
}

class NodeCanvasFactory {
  constructor(canvas) { this.canvas = canvas; }
  create(width, height) {
    const c = this.canvas.createCanvas(width, height);
    return { canvas: c, context: c.getContext('2d') };
  }
  reset(ctx, width, height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  destroy(ctx) {
    ctx.canvas.width = 0;
    ctx.canvas.height = 0;
  }
}

const FALLBACK_PALETTES = [
  { primary: '#2d6a4f', secondary: '#52b788', accent: '#95d5b2', background: '#f6fbf8', text: '#1a1a1a' },
  { primary: '#7b3f00', secondary: '#bc6c25', accent: '#dda15e', background: '#fdf8f3', text: '#1a1a1a' },
  { primary: '#5a189a', secondary: '#9d4edd', accent: '#c77dff', background: '#fbf7fd', text: '#1a1a1a' },
  { primary: '#1d4e89', secondary: '#3066be', accent: '#5b9eed', background: '#f4f8fd', text: '#1a1a1a' },
  { primary: '#9d0208', secondary: '#d00000', accent: '#dc2f02', background: '#fdf6f5', text: '#1a1a1a' },
];

export async function extractPdfPalette(pdfPath) {
  try {
    const { pdfjs, canvasModule } = await loadDeps();
    if (!canvasModule) {
      // Fall back to a deterministic palette based on file size
      const stat = await fs.stat(pdfPath);
      const idx = stat.size % FALLBACK_PALETTES.length;
      return FALLBACK_PALETTES[idx];
    }
    const data = await fs.readFile(pdfPath);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const targetWidth = 240;
    const scale = targetWidth / viewport.width;
    const v = page.getViewport({ scale });
    const factory = new NodeCanvasFactory(canvasModule);
    const { canvas, context } = factory.create(Math.ceil(v.width), Math.ceil(v.height));
    await page.render({ canvasContext: context, viewport: v, canvasFactory: factory }).promise;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return paletteFromImageData(imageData);
  } catch (e) {
    console.warn('Color extraction failed, using fallback:', e.message);
    const stat = await fs.stat(pdfPath).catch(() => ({ size: 0 }));
    const idx = stat.size % FALLBACK_PALETTES.length;
    return FALLBACK_PALETTES[idx];
  }
}

function paletteFromImageData(imageData) {
  const { data, width, height } = imageData;
  const buckets = new Map();
  const total = width * height;
  // Sample every Nth pixel for speed
  const step = Math.max(1, Math.floor(total / 4000));
  for (let i = 0; i < total; i += step) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
    if (a < 200) continue;
    // Skip near-white and near-black
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 230) continue;
    if (max < 28) continue;
    // Quantize to 5-bit per channel for grouping similar shades
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

  const bg = lighten(primary, 0.92);
  const bgEnd = lighten(primary, 0.85);
  return {
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    accent: rgbToHex(accent),
    background: rgbToHex(bg),
    bgEnd: rgbToHex(bgEnd),
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
