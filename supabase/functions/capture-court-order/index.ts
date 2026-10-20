import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const ALLOWED_ORIGINS = new Set([
  "https://hmtcnatqowokeyrdjujq.supabase.co",
  "https://mercuryandroid.vercel.app",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const responseHeaders: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) responseHeaders["Access-Control-Allow-Origin"] = origin;
  return responseHeaders;
}

function respond(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), ...(init.headers || {}) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return respond(req, { error: "Method Not Allowed" }, { status: 405 });

  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return respond(req, { error: auth.message }, { status: auth.status });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const cino = String(form.get("cino") ?? "").trim();
    const docType = String(form.get("doc_type") ?? "Order").trim().slice(0, 80);
    const source = String(form.get("source") ?? "eCourts").trim().slice(0, 80);
    const orderDateRaw = String(form.get("order_date") ?? "").trim();
    if (!(file instanceof File) || !cino || cino.length > 128) {
      return respond(req, { error: "file and a valid cino are required" }, { status: 400 });
    }
    if (file.size < 5 || file.size > 25 * 1024 * 1024) {
      return respond(req, { error: "PDF must be between 5 bytes and 25 MB" }, { status: 413 });
    }
    if (file.type && file.type !== "application/pdf") {
      return respond(req, { error: "Only PDF files are accepted" }, { status: 415 });
    }

    const { data: caseRow, error: caseError } = await admin
      .from("cases")
      .select("cino")
      .eq("cino", cino)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (caseError) {
      console.error("capture-court-order: case lookup failed");
      return respond(req, { error: "Could not verify case access" }, { status: 500 });
    }
    if (!caseRow) return respond(req, { error: "Case not found" }, { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder().decode(bytes.slice(0, 1024));
    if (!header.includes("%PDF-")) return respond(req, { error: "The uploaded file is not a valid PDF" }, { status: 415 });

    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const fingerprint = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: existing, error: existingError } = await admin
      .from("documents")
      .select("id,cino,name")
      .eq("fingerprint", fingerprint)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (existingError) {
      console.error("capture-court-order: duplicate lookup failed");
      return respond(req, { error: "Could not verify document status" }, { status: 500 });
    }
    if (existing) return respond(req, { ok: true, duplicate: true, document: existing });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "court-order.pdf";
    const path = cino.replace(/[^a-zA-Z0-9._-]/g, "_") + "/Orders/" + Date.now() + "_" + safeName;
    const { error: uploadError } = await admin.storage.from("case-files").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      console.error("capture-court-order: storage upload failed");
      return respond(req, { error: "Could not store the PDF" }, { status: 500 });
    }

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        owner_id: auth.user.id,
        cino,
        name: file.name.slice(0, 255),
        size: file.size,
        mime_type: "application/pdf",
        doc_type: docType || "Order",
        file_data: null,
        storage_bucket: "case-files",
        storage_path: path,
        source,
        order_date: /^\d{4}-\d{2}-\d{2}$/.test(orderDateRaw) ? orderDateRaw : null,
        fingerprint,
        processing_status: "Pending",
        case_match_confidence: 1,
      })
      .select("id,cino,name,storage_bucket,storage_path,order_date,processing_status")
      .single();

    if (docError) {
      const { error: cleanupError } = await admin.storage.from("case-files").remove([path]);
      if (cleanupError) console.error("capture-court-order: orphan object cleanup failed");
      console.error("capture-court-order: document insert failed");
      return respond(req, { error: "Could not save the document record" }, { status: 500 });
    }

    return respond(req, { ok: true, duplicate: false, document: doc });
  } catch {
    return respond(req, { error: "Invalid upload request" }, { status: 400 });
  }
});
