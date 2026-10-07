// Test harness: a fresh in-process Postgres (PGlite) with a Supabase stub, all of
// supabase/migrations and supabase/seed.sql applied. Each test runs inside a
// transaction that is rolled back, switching between API roles the same way
// PostgREST does (SET ROLE + request.jwt.claims).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.resolve(here, '../../../../supabase');

/** Fixed ids from supabase/seed.sql. */
export const seed = {
  aurora: 'a0000000-0000-4000-8000-000000000001',
  bellavista: 'b0000000-0000-4000-8000-000000000001',
  users: {
    mario: 'a1000000-0000-4000-8000-000000000001', // Aurora owner
    giulia: 'a1000000-0000-4000-8000-000000000002', // Aurora HR
    luca: 'a1000000-0000-4000-8000-000000000003', // Aurora manager of Marco and Anna
    marco: 'a1000000-0000-4000-8000-000000000004', // Aurora employee
    anna: 'a1000000-0000-4000-8000-000000000005', // Aurora employee
    paolo: 'a1000000-0000-4000-8000-000000000006', // invited to Aurora, not linked
    francesca: 'b1000000-0000-4000-8000-000000000001', // Bellavista owner
    sara: 'b1000000-0000-4000-8000-000000000002', // Bellavista employee
    founder: 'c1000000-0000-4000-8000-000000000001', // allowlisted, no company
    stranger: 'c1000000-0000-4000-8000-000000000002', // not allowlisted
  },
  members: {
    mario: 'a2000000-0000-4000-8000-000000000001',
    giulia: 'a2000000-0000-4000-8000-000000000002',
    luca: 'a2000000-0000-4000-8000-000000000003',
    marco: 'a2000000-0000-4000-8000-000000000004',
    anna: 'a2000000-0000-4000-8000-000000000005',
    paolo: 'a2000000-0000-4000-8000-000000000006',
    francesca: 'b2000000-0000-4000-8000-000000000001',
    sara: 'b2000000-0000-4000-8000-000000000002',
  },
  sites: {
    milano: 'a3000000-0000-4000-8000-000000000001',
    magazzino: 'a3000000-0000-4000-8000-000000000002',
    firenze: 'b3000000-0000-4000-8000-000000000001',
  },
  kiosk: 'a4000000-0000-4000-8000-000000000001',
  keys: {
    marco: 'a5000000-0000-4000-8000-000000000004',
    anna: 'a5000000-0000-4000-8000-000000000005',
    sara: 'b5000000-0000-4000-8000-000000000002',
  },
} as const;

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await run(db, 'supabase-stub.sql', readFileSync(path.join(here, 'supabase-stub.sql'), 'utf8'));
  const migrationsDir = path.join(supabaseDir, 'migrations');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await run(db, file, readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await run(db, 'seed.sql', readFileSync(path.join(supabaseDir, 'seed.sql'), 'utf8'));
  return db;
}

async function run(db: PGlite, name: string, sql: string) {
  try {
    await db.exec(sql);
  } catch (err) {
    throw new Error(`${name}: ${(err as Error).message}`, { cause: err });
  }
}

type Row = Record<string, unknown>;

export class Session {
  constructor(private readonly db: PGlite) {}

  /** Act as a signed-in user (role `authenticated`). */
  async as(authUserId: string) {
    await this.setRole('authenticated', { sub: authUserId, role: 'authenticated' });
  }

  async anon() {
    await this.setRole('anon', { role: 'anon' });
  }

  async service() {
    await this.setRole('service_role', { role: 'service_role' });
  }

  async superuser() {
    await this.db.exec('reset role');
  }

  async rows<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.query<T>(sql, params)).rows;
  }

  async one<T = Row>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.rows<T>(sql, params);
    if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}: ${sql}`);
    return rows[0];
  }

  async value<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    const row = await this.one<Row>(sql, params);
    return Object.values(row)[0] as T;
  }

  /** Runs `fn` inside a savepoint: on error the savepoint is rolled back and the error rethrown. */
  async savepoint<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.exec('savepoint call');
    try {
      const result = await fn();
      await this.db.exec('release savepoint call');
      return result;
    } catch (err) {
      await this.db.exec('rollback to savepoint call');
      throw err;
    }
  }

  /** Runs `sql` expecting it to fail; returns the error. Keeps the transaction usable. */
  async error(sql: string, params: unknown[] = []): Promise<{ code?: string; message: string; detail?: string }> {
    await this.db.exec('savepoint expect_error');
    try {
      await this.db.query(sql, params);
    } catch (err) {
      await this.db.exec('rollback to savepoint expect_error');
      const e = err as { code?: string; message: string; detail?: string };
      return { code: e.code, message: e.message, detail: e.detail };
    }
    await this.db.exec('rollback to savepoint expect_error');
    throw new Error(`expected an error from: ${sql}`);
  }

  private async setRole(role: string, claims: Record<string, string>) {
    await this.db.exec('reset role');
    await this.db.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify(claims), claims.sub ?? ''],
    );
    await this.db.exec(`set local role ${role}`);
  }
}

/** Runs `fn` in a transaction that is always rolled back. */
export async function inTx(db: PGlite, fn: (s: Session) => Promise<void>) {
  await db.exec('begin');
  try {
    await fn(new Session(db));
  } finally {
    await db.exec('rollback');
  }
}
