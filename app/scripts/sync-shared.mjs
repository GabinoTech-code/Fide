#!/usr/bin/env node
// Copies shared protocol code into supabase/functions/_shared, because Edge
// Functions are bundled from supabase/functions only.
//   node scripts/sync-shared.mjs          write the copies
//   node scripts/sync-shared.mjs --check  fail if a copy is stale (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = [['app/packages/shared/src/protocol.ts', 'supabase/functions/_shared/protocol.ts']];
const check = process.argv.includes('--check');

let stale = 0;
for (const [from, to] of files) {
  // Compare with LF endings: a Windows checkout (core.autocrlf) turns both files to CRLF.
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const source = lf(readFileSync(path.join(root, from), 'utf8'));
  const expected = `// GENERATED from ${from} by app/scripts/sync-shared.mjs — do not edit.\n\n${source}`;
  const target = path.join(root, to);
  let current = null;
  try {
    current = lf(readFileSync(target, 'utf8'));
  } catch {
    // Not generated yet.
  }
  if (current === expected) continue;
  if (check) {
    console.error(`${to} is out of date: run "npm run sync-shared" in app/`);
    stale++;
  } else {
    writeFileSync(target, expected);
    console.log(`wrote ${to}`);
  }
}
process.exit(stale ? 1 : 0);
