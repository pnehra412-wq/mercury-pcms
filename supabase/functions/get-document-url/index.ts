import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const ALLOWED_ORIGINS = new Set([
  "https://hmtcnatqowokeyrdjujq.supabase.co",
  "https://mercuryandroid.vercel.app",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://mercuryandroid.vercel.app",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method Not Allowed" }, 405);

  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return json(req, { error: auth.message }, auth.status);

  try {
    const body = await req.json();
    const documentId = Number(body?.document_id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return json(req, { error: "A valid document_id is required" }, 400);
    }

    // owner_id is added by the companion, un-applied RLS migration. Do not
    // deploy this function until that schema migration has been tested/applied.
    const { data: doc, error } = await auth.admin
      .from("documents")
      .select("id,name,mime_type,storage_bucket,storage_path,cino,document_category,doc_type,owner_id")
      .eq("id", documentId)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("get-document-url: document lookup failed");
      return json(req, { error: "Could not retrieve document" }, 500);
    }
    // Same response for nonexistent and unauthorized IDs prevents enumeration.
    if (!doc) return json(req, { error: "Document not found" }, 404);
    if (doc.storage_bucket !== "case-files" || !doc.storage_path) {
      return json(req, { error: "Document has no accessible stored file" }, 422);
    }

    const { data, error: signError } = await auth.admin.storage
      .from("case-files")
      .createSignedUrl(doc.storage_path, 900, { download: false });

    if (signError || !data?.signedUrl) {
      console.error("get-document-url: signed URL creation failed");
      return json(req, { error: "Could not create document link" }, 500);
    }

    return json(req, {
      ok: true,
      document_id: doc.id,
      name: doc.name,
      mime_type: doc.mime_type,
      cino: doc.cino,
      url: data.signedUrl,
      expires_in: 900,
    });
  } catch {
    return json(req, { error: "Invalid request or document-link failure" }, 400);
  }
});
