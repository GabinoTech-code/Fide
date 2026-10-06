#!/usr/bin/env node
// Fails on high/critical npm advisories in production dependencies,
// except the ones explicitly accepted in audit-allowlist.json (with a reason).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allowlist = JSON.parse(readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8'));
const accepted = new Map(allowlist.advisories.map((a) => [a.id, a]));

let raw;
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}
const report = JSON.parse(raw);

const blocking = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue; // transitive pointer, the root advisory is listed separately
    if (!['high', 'critical'].includes(via.severity)) continue;
    const id = via.url?.split('/').pop();
    if (accepted.has(id)) continue;
    blocking.set(id, `${via.severity.toUpperCase()} ${pkg}: ${via.title} (${via.url})`);
  }
}

for (const [id, entry] of accepted) {
  console.log(`accepted ${id}: ${entry.reason}`);
}
if (blocking.size > 0) {
  console.error(`\n${blocking.size} unaccepted high/critical advisories:`);
  for (const line of blocking.values()) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('\nNo unaccepted high/critical advisories.');
