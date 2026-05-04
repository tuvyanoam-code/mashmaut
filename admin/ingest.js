// Server-side processing for uploaded bulletins.
// Converts Word -> HTML with semantic structure, extracts plain text and headings.
// PDF color extraction is deferred to the client (uses pdf.js + canvas in browser).

import mammoth from 'mammoth';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

// Map common Hebrew/English Word style names to semantic HTML tags
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
  "p[style-name='כותרת 1'] => h1:fresh",
  "p[style-name='כותרת 2'] => h2:fresh",
  "p[style-name='כותרת 3'] => h3:fresh",
  "p[style-name='כותרת'] => h1:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Block Quote'] => blockquote:fresh",
  "p[style-name='ציטוט'] => blockquote:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

export async function convertWordToHtml(wordPath) {
  const result = await mammoth.convertToHtml(
    { path: wordPath },
    { styleMap: STYLE_MAP }
  );
  const html = result.value;
  const messages = result.messages || [];
  const plainResult = await mammoth.extractRawText({ path: wordPath });
  const plainText = plainResult.value;

  // Parse out headings using a regex (light-weight, no jsdom)
  const headings = [];
  const re = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    const level = parseInt(m[1].slice(1), 10);
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text) {
      const id = 'h-' + i++;
      headings.push({ level, text, id });
    }
  }

  // Inject IDs into the HTML so anchors work
  i = 0;
  const htmlWithIds = html.replace(/<(h[1-3])([^>]*)>/gi, (full, tag, attrs) => {
    const h = headings[i++];
    if (!h) return full;
    if (/id\s*=/.test(attrs)) return full;
    return `<${tag}${attrs} id="${h.id}">`;
  });

  return { html: htmlWithIds, plainText, headings, messages };
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveBuffer(targetPath, buffer) {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, buffer);
}

export async function readJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function gitPushScript(repoRoot) {
  // Build a short script that adds public/data, commits, and pushes.
  return async () => {
    const opts = { cwd: repoRoot, env: process.env };
    try {
      await execFileP('git', ['add', 'public/data'], opts);
    } catch (e) { /* nothing to add is fine */ }
    try {
      await execFileP('git', [
        'commit', '-m', `update bulletins (${new Date().toISOString()})`,
      ], opts);
    } catch (e) {
      // Commit fails if nothing staged — treat as already-up-to-date
      if (!/nothing to commit/i.test(e.stderr || '')) throw e;
    }
    await execFileP('git', ['push'], opts);
  };
}
