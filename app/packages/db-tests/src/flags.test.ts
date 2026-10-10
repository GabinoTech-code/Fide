// Every flag a punch can carry (set by the punch-sync function or by the
// database) must have a label in the portal's three languages: the presence
// page showed the raw key "flag.hr_entry" in production. Reads the sources,
// like nginx.test.ts, so a new flag without a label fails here.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(repo(p), 'utf8');

function serverFlags(): Set<string> {
  const flags = new Set<string>();
  const punch = read('supabase/functions/_shared/punch.ts');
  for (const m of punch.matchAll(/flags\.push\('([a-z_]+)'\)/g)) flags.add(m[1]!);
  for (const m of punch.match(/CLIENT_FLAGS = new Set\(\[([^\]]*)\]\)/)?.[1]?.matchAll(/'([a-z_]+)'/g) ?? []) flags.add(m[1]!);
  for (const file of readdirSync(repo('supabase/migrations'))) {
    const sql = read(`supabase/migrations/${file}`);
    for (const m of sql.matchAll(/array_append\(v_flags, '([a-z_]+)'\)/g)) flags.add(m[1]!);
    // Literal flag arrays written into punches (lines that also write a receipt or the flags column).
    for (const line of sql.split('\n').filter((l) => /receipt_code|flags/.test(l))) {
      for (const m of line.matchAll(/'\{([a-z_]+(?:,[a-z_]+)*)\}'/g)) for (const f of m[1]!.split(',')) flags.add(f);
    }
  }
  return flags;
}

describe('punch flags', () => {
  const flags = serverFlags();

  it('finds the flags the server sets', () => {
    for (const f of ['clock_skew', 'late_sync', 'outside_geofence', 'mock_location', 'sequence', 'hr_entry', 'manual_correction']) {
      expect(flags, f).toContain(f);
    }
  });

  it.each(['it', 'es', 'en'])('has a portal label for each one in %s', (lang) => {
    const locale = read(`app/apps/web-portal/src/locales/${lang}.ts`);
    for (const f of flags) expect(locale, `flag.${f}`).toContain(`'flag.${f}':`);
  });
});
