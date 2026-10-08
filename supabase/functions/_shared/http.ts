// HTTP plumbing shared by the Edge Functions (Deno only).
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

// Browsers (portal, kiosk page) need CORS; the mobile app does not.
const allowedOrigins = (Deno.env.get('FIDE_ALLOWED_ORIGINS') ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

/** Wraps a POST handler with CORS preflight, JSON parsing and error mapping. */
export function handler(fn: (req: Request, body: Record<string, unknown>) => unknown) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, 'invalid_json');
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'invalid_json');
      return json(req, await fn(req, body as Record<string, unknown>));
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.code }, err.status);
      // Never leak internals; the function log has the details.
      console.error(err);
      return json(req, { error: 'internal_error' }, 500);
    }
  };
}

const url = () => Deno.env.get('SUPABASE_URL')!;

/** Client acting as the caller, so RLS and RPC authorisation apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(url(), (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client, for svc_* functions and signed Storage URLs only. */
export function serviceClient(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'not_authenticated');
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'not_authenticated');
  return data.user;
}

/** Calls an RPC and maps its `raise exception '<code>'` to a 4xx with that code. */
export async function rpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  expected: Record<string, number> = {},
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const known = Object.keys(expected).find((code) => error.message.includes(code));
    if (known) throw new HttpError(expected[known], known);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new HttpError(400, `invalid_${field}`);
  }
  return value;
}
