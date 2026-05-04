// Local admin server. Only run on the user's machine via `npm run admin`.
// Provides a small REST API for upload, edit, delete, config, and publish.
// Files are written directly into public/data so they're picked up by Vite dev,
// and end up in git for deployment.

import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import open from 'open';
import { spawn } from 'child_process';

import {
  convertWordToHtml, ensureDir, saveBuffer, readJson, writeJson, gitPushScript,
} from './ingest.js';
import { extractPdfPalette } from './colorExtract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const BULLETIN_DIR = path.join(DATA_DIR, 'bulletins');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.get('/api/index', async (req, res) => {
  const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
  res.json(idx);
});

app.get('/api/config', async (req, res) => {
  const cfg = (await readJson(CONFIG_PATH)) || {};
  res.json(cfg);
});

app.post('/api/config', async (req, res) => {
  try {
    const cur = (await readJson(CONFIG_PATH)) || {};
    const next = { ...cur, ...req.body };
    await writeJson(CONFIG_PATH, next);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/year', async (req, res) => {
  try {
    const { id, displayName } = req.body;
    if (!id || !displayName) return res.status(400).json({ ok: false, error: 'missing fields' });
    const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
    if (idx.years.find((y) => y.id === id)) return res.json({ ok: true });
    idx.years.push({ id, displayName });
    idx.years.sort((a, b) => a.id.localeCompare(b.id));
    await writeJson(INDEX_PATH, idx);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/upload', upload.fields([{ name: 'word' }, { name: 'pdf' }]), async (req, res) => {
  try {
    const { yearId, yearDisplay, parsha, issueNumber, dateLabel, teaser } = req.body;
    const wordFile = req.files?.word?.[0];
    const pdfFile = req.files?.pdf?.[0];

    if (!yearId || !parsha) return res.status(400).json({ ok: false, error: 'חסרים שדות' });
    if (!pdfFile) return res.status(400).json({ ok: false, error: 'חסר קובץ PDF' });

    const slug = parsha; // already a slug from the dropdown
    const targetDir = path.join(BULLETIN_DIR, yearId);
    await ensureDir(targetDir);

    const pdfPath = path.join(targetDir, `${slug}.pdf`);
    await saveBuffer(pdfPath, pdfFile.buffer);

    let textHtml = '';
    let plainText = '';
    let headings = [];
    let wordRelativePath = null;

    if (wordFile) {
      const wordPath = path.join(targetDir, `${slug}.docx`);
      await saveBuffer(wordPath, wordFile.buffer);
      wordRelativePath = path.relative(ROOT, wordPath);
      const result = await convertWordToHtml(wordPath);
      textHtml = result.html;
      plainText = result.plainText;
      headings = result.headings;
    }

    const colors = await extractPdfPalette(pdfPath);

    const parshaMeta = (await import('../src/lib/parshiot.js')).PARSHA_BY_SLUG[slug];
    const parshaName = parshaMeta?.he || slug;

    const week = {
      yearId,
      yearDisplay,
      slug,
      parshaName,
      issueNumber: issueNumber ? parseInt(issueNumber, 10) : null,
      dateLabel: dateLabel || null,
      teaser: teaser || null,
      publishedAt: new Date().toISOString(),
      pdfUrl: `data/bulletins/${yearId}/${slug}.pdf`,
      wordPath: wordRelativePath,
      textHtml,
      plainText,
      headings,
      colors,
      styleOverrides: {},
    };

    // Update index — and bump every existing week's displayOrder so this new
    // bulletin floats to the top (= "this week's bulletin"). The user can
    // override via the admin drag-reorder.
    const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
    if (!idx.years.find((y) => y.id === yearId)) {
      idx.years.push({ id: yearId, displayName: yearDisplay });
    }
    idx.weeks = idx.weeks.map((w) => ({
      ...w,
      displayOrder: typeof w.displayOrder === 'number' ? w.displayOrder + 1 : (idx.weeks.indexOf(w) + 1),
    }));
    week.displayOrder = 0;

    const existing = idx.weeks.findIndex((w) => w.yearId === yearId && w.slug === slug);
    const summary = {
      yearId,
      yearDisplay,
      slug,
      parshaName,
      issueNumber: week.issueNumber,
      dateLabel: week.dateLabel,
      teaser: week.teaser,
      publishedAt: week.publishedAt,
      displayOrder: 0,
      colors,
    };
    if (existing >= 0) idx.weeks[existing] = summary;
    else idx.weeks.unshift(summary);
    await writeJson(INDEX_PATH, idx);

    // Now write the per-bulletin JSON with displayOrder included
    await writeJson(path.join(targetDir, `${slug}.json`), week);

    // Mirror new displayOrder onto every other bulletin file so direct edits stay consistent
    for (const w of idx.weeks) {
      if (w.yearId === yearId && w.slug === slug) continue;
      const f = path.join(BULLETIN_DIR, w.yearId, `${w.slug}.json`);
      const cur = await readJson(f);
      if (cur && cur.displayOrder !== w.displayOrder) {
        cur.displayOrder = w.displayOrder;
        await writeJson(f, cur);
      }
    }

    res.json({ ok: true, week });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/bulletin', async (req, res) => {
  try {
    const { yearId, slug, colors, styleOverrides, meta } = req.body;
    const filePath = path.join(BULLETIN_DIR, yearId, `${slug}.json`);
    const cur = await readJson(filePath);
    if (!cur) return res.status(404).json({ ok: false, error: 'not found' });
    if (colors) cur.colors = colors;
    if (styleOverrides) cur.styleOverrides = styleOverrides;
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        cur[k] = v;
      }
    }
    await writeJson(filePath, cur);
    // Update index summary
    const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
    const i = idx.weeks.findIndex((w) => w.yearId === yearId && w.slug === slug);
    if (i >= 0) {
      idx.weeks[i] = {
        ...idx.weeks[i],
        colors: cur.colors,
        issueNumber: cur.issueNumber,
        dateLabel: cur.dateLabel,
        teaser: cur.teaser,
      };
      await writeJson(INDEX_PATH, idx);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete('/api/bulletin', async (req, res) => {
  try {
    const { yearId, slug } = req.body;
    const targetDir = path.join(BULLETIN_DIR, yearId);
    for (const ext of ['json', 'pdf', 'docx']) {
      const f = path.join(targetDir, `${slug}.${ext}`);
      try { await fs.unlink(f); } catch (_) {}
    }
    const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
    idx.weeks = idx.weeks.filter((w) => !(w.yearId === yearId && w.slug === slug));
    await writeJson(INDEX_PATH, idx);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/reorder', async (req, res) => {
  try {
    const { order } = req.body; // array of "yearId/slug"
    if (!Array.isArray(order)) return res.status(400).json({ ok: false, error: 'order must be array' });
    const idx = (await readJson(INDEX_PATH)) || { years: [], weeks: [] };
    const map = new Map(order.map((k, i) => [k, i]));
    idx.weeks = idx.weeks.map((w) => {
      const k = `${w.yearId}/${w.slug}`;
      if (map.has(k)) return { ...w, displayOrder: map.get(k) };
      return w;
    });
    await writeJson(INDEX_PATH, idx);
    // Mirror displayOrder onto each per-bulletin file too (so direct edits stay in sync)
    for (const k of order) {
      const [yearId, slug] = k.split('/');
      const f = path.join(BULLETIN_DIR, yearId, `${slug}.json`);
      const cur = await readJson(f);
      if (cur) {
        cur.displayOrder = map.get(k);
        await writeJson(f, cur);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/publish', async (req, res) => {
  try {
    const push = gitPushScript(ROOT);
    await push();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message + (e.stderr ? `\n${e.stderr}` : '') });
  }
});

const PORT = 5175;
const VITE_PORT = 5173;

app.listen(PORT, () => {
  console.log(`\n✓ Admin API:  http://localhost:${PORT}`);

  // Start Vite dev server alongside
  const vite = spawn('npx', ['vite', '--port', String(VITE_PORT)], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  vite.on('exit', (code) => process.exit(code));
  process.on('SIGINT', () => { vite.kill('SIGINT'); process.exit(0); });

  setTimeout(() => {
    open(`http://localhost:${VITE_PORT}/admin`).catch(() => {});
    console.log(`✓ Admin UI:   http://localhost:${VITE_PORT}/admin\n`);
  }, 1500);
});
