#!/usr/bin/env node
// Bulk-import existing bulletins into the site.
// Usage:
//   npm run import -- --src "/path/to/folder" --year "תשפ״ו"
// The script scans the folder for PDFs and (optionally) matching Word files.
// PDF naming pattern expected (Hebrew): "<num>. משמעות פרשת <parsha>"
// Word files are matched by filename (with the same parsha name) if present
// in the same folder OR in a `--word-src` folder.

import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import {
  convertWordToHtml, ensureDir, saveBuffer, readJson, writeJson,
} from '../admin/ingest.js';
import { extractPdfPalette } from '../admin/colorExtract.js';
import { PARSHIOT, slugForHebrew, hebrewYearToNumber } from '../src/lib/parshiot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
if (!args.src) {
  console.error('Usage: npm run import -- --src "<folder>" [--year "תשפ״ו"] [--word-src "<folder>"]');
  process.exit(1);
}

const yearHe = args.year || 'תשפ״ו';
const yearId = hebrewYearToNumber(yearHe);
const srcDir = path.resolve(args.src);
const wordSrcDir = args['word-src'] ? path.resolve(args['word-src']) : srcDir;

console.log(`\n→ Importing from: ${srcDir}`);
console.log(`→ Year: ${yearHe} (${yearId})`);
if (wordSrcDir !== srcDir) console.log(`→ Word files from: ${wordSrcDir}`);

const allFiles = await fs.readdir(srcDir);
const pdfFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.pdf'));
const wordFiles = (await fs.readdir(wordSrcDir).catch(() => [])).filter((f) => f.toLowerCase().endsWith('.docx'));

console.log(`→ Found ${pdfFiles.length} PDFs, ${wordFiles.length} Word files\n`);

const targetDir = path.join(ROOT, 'public', 'data', 'bulletins', yearId);
await ensureDir(targetDir);

const idx = (await readJson(path.join(ROOT, 'public', 'data', 'index.json'))) || { years: [], weeks: [] };
if (!idx.years.find((y) => y.id === yearId)) {
  idx.years.push({ id: yearId, displayName: yearHe });
}

let imported = 0;
let skipped = 0;

for (const pdfFile of pdfFiles) {
  const parshaInfo = parseFilename(pdfFile);
  if (!parshaInfo) {
    console.log(`✗ skip (no parsha match): ${pdfFile}`);
    skipped++;
    continue;
  }
  const { slug, parshaName, issueNumber } = parshaInfo;

  const wordMatch = findWordMatch(wordFiles, parshaName, issueNumber);

  console.log(`→ ${parshaName} (${slug})${wordMatch ? ` + ${wordMatch}` : ' (PDF only)'}`);

  const pdfBuffer = await fs.readFile(path.join(srcDir, pdfFile));
  const pdfTarget = path.join(targetDir, `${slug}.pdf`);
  await saveBuffer(pdfTarget, pdfBuffer);

  let textHtml = '';
  let plainText = '';
  let headings = [];
  let wordRel = null;
  if (wordMatch) {
    const wordBuffer = await fs.readFile(path.join(wordSrcDir, wordMatch));
    const wordTarget = path.join(targetDir, `${slug}.docx`);
    await saveBuffer(wordTarget, wordBuffer);
    wordRel = path.relative(ROOT, wordTarget);
    try {
      const r = await convertWordToHtml(wordTarget);
      textHtml = r.html;
      plainText = r.plainText;
      headings = r.headings;
    } catch (e) {
      console.log(`  word convert failed: ${e.message}`);
    }
  }

  const colors = await extractPdfPalette(pdfTarget);

  const week = {
    yearId,
    yearDisplay: yearHe,
    slug,
    parshaName,
    issueNumber: issueNumber || null,
    dateLabel: null,
    teaser: null,
    publishedAt: new Date(2025, 0, 1 + (issueNumber || 0)).toISOString(),
    pdfUrl: `data/bulletins/${yearId}/${slug}.pdf`,
    wordPath: wordRel,
    textHtml,
    plainText,
    headings,
    colors,
    styleOverrides: {},
  };
  await writeJson(path.join(targetDir, `${slug}.json`), week);

  const summary = {
    yearId, yearDisplay: yearHe, slug, parshaName,
    issueNumber: week.issueNumber, dateLabel: null, teaser: null,
    publishedAt: week.publishedAt, colors,
  };
  const i = idx.weeks.findIndex((w) => w.yearId === yearId && w.slug === slug);
  if (i >= 0) idx.weeks[i] = summary;
  else idx.weeks.push(summary);

  imported++;
}

await writeJson(path.join(ROOT, 'public', 'data', 'index.json'), idx);
console.log(`\n✓ Imported ${imported}, skipped ${skipped}\n`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

function parseFilename(filename) {
  // Strip extension
  let name = filename.replace(/\.(pdf|docx)$/i, '');
  // Try to capture leading number "22. " or "22 - "
  let issueNumber = null;
  const numMatch = name.match(/^(\d+)\s*[.\-–—]\s*/);
  if (numMatch) {
    issueNumber = parseInt(numMatch[1], 10);
    name = name.slice(numMatch[0].length);
  }
  // Strip "_למסך" / "_print" / variants
  name = name.replace(/[_\s]+(?:למסך|למסך\s*חופש|print|web|ל[א-ת]+).*/i, '').trim();
  // Strip leading "משמעות פרשת" / "משמעות"
  name = name.replace(/^משמעות\s+/, '').trim();
  name = name.replace(/^פרשת\s+/, '').trim();
  // Strip trailing dot, space
  name = name.replace(/[.\s_-]+$/, '').trim();
  // Try to find a parsha by Hebrew name
  const slug = slugForHebrew(name);
  if (!slug) return null;
  const parshaName = PARSHIOT.find((p) => p.slug === slug).he;
  return { slug, parshaName, issueNumber };
}

function findWordMatch(wordFiles, parshaName, issueNumber) {
  // Direct prefix match
  const candidates = wordFiles.filter((f) => f.includes(parshaName));
  if (candidates.length === 1) return candidates[0];
  if (issueNumber) {
    const byNum = candidates.find((f) => new RegExp(`^${issueNumber}[\\s.\\-]`).test(f));
    if (byNum) return byNum;
  }
  // Try fuzzy: split parsha name into words and require all
  const words = parshaName.split(/\s+/);
  const fuzzy = wordFiles.find((f) => words.every((w) => f.includes(w)));
  return fuzzy || null;
}
