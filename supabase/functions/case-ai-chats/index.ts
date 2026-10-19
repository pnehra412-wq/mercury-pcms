import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const ALLOWED_ORIGINS = new Set([
  "https://hmtcnatqowokeyrdjujq.supabase.co",
  "https://mercuryandroid.vercel.app",
]);

function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://mercuryandroid.vercel.app",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

const PROVIDERS = new Set(["ChatGPT", "Claude", "Gemini", "Other"]);
const CHAT_URL_ALLOWED = /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai)\//i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, { error: "Method Not Allowed" }, 405);
  }

  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return json(req, { error: auth.message }, auth.status);

  try {
    if (req.method === "GET") {
      const cino = new URL(req.url).searchParams.get("cino")?.trim() || "";
      if (!cino || cino.length > 128) return json(req, { error: "A valid cino is required" }, 400);

      const { data: ownedCase, error: caseError } = await auth.admin
        .from("cases").select("cino").eq("cino", cino).eq("owner_id", auth.user.id).maybeSingle();
      if (caseError) {
        console.error("case-ai-chats: case authorization lookup failed");
        return json(req, { error: "Could not retrieve case chat links" }, 500);
      }
      if (!ownedCase) return json(req, { error: "Case not found" }, 404);

      const { data, error } = await auth.admin
        .from("case_ai_chats")
        .select("id,cino,provider,title,chat_url,chat_role,notes,created_at,updated_at")
        .eq("cino", cino)
        .eq("owner_id", auth.user.id)
        .order("provider");

      if (error) {
        console.error("case-ai-chats: chat lookup failed");
        return json(req, { error: "Could not retrieve case chat links" }, 500);
      }
      return json(req, { ok: true, chats: data || [] });
    }

    const body = await req.json();
    const cino = String(body?.cino || "").trim();
    const provider = String(body?.provider || "").trim();
    const chatUrl = String(body?.chat_url || "").trim();
    const title = String(body?.title || `${provider} Case Chat`).trim();

    if (!cino || cino.length > 128 || !PROVIDERS.has(provider) || !chatUrl || chatUrl.length > 2048 || title.length > 180) {
      return json(req, { error: "Valid cino, provider, title, and chat_url are required" }, 400);
    }
    if (!CHAT_URL_ALLOWED.test(chatUrl)) {
      return json(req, { error: "Only approved ChatGPT or Claude chat links are allowed" }, 400);
    }

    const { data: ownedCase, error: caseError } = await auth.admin
      .from("cases").select("cino").eq("cino", cino).eq("owner_id", auth.user.id).maybeSingle();
    if (caseError) {
      console.error("case-ai-chats: case authorization lookup failed");
      return json(req, { error: "Could not verify case access" }, 500);
    }
    if (!ownedCase) return json(req, { error: "Case not found" }, 404);

    const { data: existing, error: findError } = await auth.admin
      .from("case_ai_chats")
      .select("id")
      .eq("cino", cino)
      .eq("provider", provider)
      .eq("owner_id", auth.user.id)
      .limit(1)
      .maybeSingle();
    if (findError) {
      console.error("case-ai-chats: existing link lookup failed");
      return json(req, { error: "Could not save case chat link" }, 500);
    }

    const values = {
      cino,
      provider,
      title,
      chat_url: chatUrl,
      chat_role: "case",
      owner_id: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    const result = existing?.id
      ? await auth.admin.from("case_ai_chats").update(values)
          .eq("id", existing.id).eq("owner_id", auth.user.id).select("id,cino,provider,title,chat_url,chat_role,created_at,updated_at").single()
      : await auth.admin.from("case_ai_chats").insert(values)
          .select("id,cino,provider,title,chat_url,chat_role,created_at,updated_at").single();

    if (result.error || !result.data) {
      console.error("case-ai-chats: save failed");
      return json(req, { error: "Could not save case chat link" }, 500);
    }
    return json(req, { ok: true, chat: result.data });
  } catch {
    return json(req, { error: "Invalid request or case chat operation failed" }, 400);
  }
});
