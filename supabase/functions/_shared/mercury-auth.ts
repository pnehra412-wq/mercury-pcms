import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.57.4";

export type MercuryAuthResult =
  | { ok: true; user: User; admin: SupabaseClient }
  | { ok: false; status: number; message: string };

/**
 * Authenticate a real Supabase Auth access token, then return a server-side
 * service-role client for narrowly scoped operations. Callers MUST still
 * authorize the exact case/document/analysis row before using admin access.
 */
export async function authenticateMercuryRequest(req: Request): Promise<MercuryAuthResult> {
  const authorization = req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return { ok: false, status: 500, message: "Server authentication is not configured" };
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data.user) {
      return { ok: false, status: 401, message: "Invalid or expired session" };
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    return { ok: true, user: data.user, admin };
  } catch {
    // Do not return JWTs, provider errors, or server configuration to callers.
    return { ok: false, status: 503, message: "Authentication service unavailable" };
  }
}
