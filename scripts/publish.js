#!/usr/bin/env node
// Add, commit, and push the data folder. The user can call this directly,
// or it's invoked from the admin UI's "publish" button.

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, allowFail = false) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    if (!allowFail) throw e;
    return null;
  }
}

run('git', ['add', 'public/data']);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
run('git', ['commit', '-m', `update bulletins (${stamp})`], true);
run('git', ['push']);
console.log('\n✓ Published. The site will refresh in about a minute.\n');
