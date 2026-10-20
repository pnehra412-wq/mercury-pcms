import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, key);

const ALLOWED_ORIGINS = new Set([
  "https://hmtcnatqowokeyrdjujq.supabase.co",
  "https://mercuryandroid.vercel.app"
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

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

function clean(s: string) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function findCino(text: string) {
  const m = text.toUpperCase().match(/\b[A-Z]{2,8}[A-Z0-9]*\s*[-/]\s*[A-Z0-9]+\s*[-/]\s*\d{3,8}\b/g);
  if (!m) return null;
  return m.map(x => x.replace(/[\s\/]/g, "-").replace(/-+/g, "-"))[0];
}
function findDates(text: string) {
  const out: string[] = [];
  const re = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g;
  for (const m of text.matchAll(re)) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)
      out.push(`${y.toString().padStart(4,"0")}-${mo.toString().padStart(2,"0")}-${d.toString().padStart(2,"0")}`);
  }
  return [...new Set(out)];
}
function likelyNextDate(text: string, dates: string[]) {
  const upper = text.toUpperCase();
  const nextIdx = Math.max(upper.lastIndexOf("NEXT DATE"), upper.lastIndexOf("NEXT HEARING"), upper.lastIndexOf("LISTED ON"), upper.lastIndexOf("LIST ON"));
  if (nextIdx >= 0) {
    const tail = text.slice(nextIdx, nextIdx + 300);
    const ds = findDates(tail);
    if (ds.length) return ds[0];
  }
  return null;
}
function purpose(text: string) {
  const u = text.toUpperCase();
  const pairs: [RegExp,string][] = [
    [/FOR\s+EVIDENCE|EVIDENCE\s+OF/i, "Evidence"],
    [/FOR\s+ARGUMENT|FINAL\s+ARGUMENT/i, "Arguments"],
    [/FOR\s+HEARING/i, "Hearing"],
    [/FOR\s+NOTICE/i, "Notice"],
    [/FOR\s+REPLY|FOR\s+REJOINDER/i, "Reply/Rejoinder"],
    [/FOR\s+FILING/i, "Filing"],
    [/FOR\s+ORDERS/i, "Orders"],
    [/FOR\s+BAIL/i, "Bail"],
    [/FOR\s+CONSIDERATION/i, "Consideration"]
  ];
  for (const [r,v] of pairs) if (r.test(u)) return v;
  return null;
}
function outcome(text: string) {
  const u = text.toUpperCase();
  const hits = [
    ["DISPOSED OF", "Disposed of"], ["DISMISSED", "Dismissed"],
    ["ALLOWED", "Allowed"], ["ACCEPTED", "Accepted"],
    ["ADJOURNED", "Adjourned"], ["GRANTED", "Granted"],
    ["REJECTED", "Rejected"], ["WITHDRAWN", "Withdrawn"]
  ] as const;
  for (const [needle,val] of hits) if (u.includes(needle)) return val;
  return "Order captured";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method Not Allowed" }, 405);
  const origin = req.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Unauthorized origin" }, 403);
  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return json(req, { error: auth.message }, auth.status);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json(req, { error: "file required" }, 400);
    if (file.size < 5 || file.size > 25 * 1024 * 1024) return json(req, { error: "PDF must be between 5 bytes and 25 MB" }, 413);
    if (file.type && file.type !== "application/pdf") return json(req, { error: "Only PDF files are accepted" }, 415);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) return json(req, { error: "The uploaded file is not a valid PDF" }, 415);
    const dig = await crypto.subtle.digest("SHA-256", bytes);
    const fingerprint = Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2,"0")).join("");

    const old = await db.from("documents").select("id,cino,name,processing_status,ai_summary").eq("fingerprint", fingerprint).eq("owner_id", auth.user.id).maybeSingle();
    if (old.data) {
      // Re-uploading an identical PDF is treated as a safe AI refresh rather than
      // silently returning the old/stale analysis.
      const analyzerUrl = url + "/functions/v1/analyze-court-document";
      const analyzed = await fetch(analyzerUrl, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "", "Authorization": req.headers.get("Authorization") || "" },
        body:JSON.stringify({ document_id:old.data.id })
      });
      const analysisBody = await analyzed.json().catch(()=>({}));
      if (analyzed.ok && analysisBody?.next_date && (analysisBody?.case_identified || old.data.cino)) {
        const cino = analysisBody?.case_identified || old.data.cino;
        await db.from("cases").update({
          date_next_list:analysisBody.next_date,
          purpose_name:analysisBody?.purpose || null,
          latest_order_crux:analysisBody?.crux || null,
          latest_order_date:analysisBody?.order_date || null,
          latest_order_document_id:old.data.id,
          latest_order_action:analysisBody?.advocate_action || analysisBody?.purpose || null
        }).eq("cino",cino).eq("owner_id", auth.user.id);
        await db.from("documents").update({cino,processing_status:"AI Complete - Review",review_status:"needs_review"}).eq("id",old.data.id).eq("owner_id", auth.user.id);
      }
      return json(req, {
        ok:analyzed.ok, duplicate:true, refreshed:true, document_id:old.data.id,
        next_date:analysisBody?.next_date || null, purpose:analysisBody?.purpose || null,
        order_date:analysisBody?.order_date || null,
        advocate_action:analysisBody?.advocate_action || null,
        cino:analysisBody?.case_identified || analysisBody?.cino || old.data.cino || null,
        analysis:analysisBody
      }, analyzed.ok ? 200 : 502);
    }

    const path = "Mobile-Inbox/" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const up = await db.storage.from("case-files").upload(path, bytes, { contentType:"application/pdf", upsert:false });
    if (up.error) {
      console.error("capture-mobile-order: Storage upload failed");
      return json(req, { error: "Could not store the uploaded document" }, 500);
    }

    const ins = await db.from("documents").insert({
      name:file.name, size:file.size, mime_type:"application/pdf", doc_type:String(form.get("doc_type")||"Order"),
      storage_bucket:"case-files", storage_path:path, source:"eCourts Mobile Share", fingerprint,
      owner_id:auth.user.id, processing_status:"Processing"
    }).select("id,name,storage_path,processing_status").single();
    if (ins.error) {
      await db.storage.from("case-files").remove([path]);
      console.error("capture-mobile-order: document metadata insert failed");
      return json(req, { error:"Could not save the uploaded document" },500);
    }

    const documentId = ins.data.id;

    const analyzerUrl = url + "/functions/v1/analyze-court-document";
    const analyzed = await fetch(analyzerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
        "Authorization": req.headers.get("Authorization") || ""
      },
      body: JSON.stringify({ document_id: documentId })
    });
    const analysisBody = await analyzed.json().catch(() => ({}));
    // The analyzer intentionally stops at needs_review. For Mercury's capture pipeline,
    // also write the AI-extracted next date/purpose to the matched case so the diary is
    // immediately current. Hearing-history confirmation remains a separate review action.
    if (analyzed.ok && analysisBody?.next_date) {
      const cino = analysisBody?.case_identified || analysisBody?.cino || null;
      if (cino) {
        const caseUpdate:any = {
          date_next_list: analysisBody.next_date,
          purpose_name: analysisBody?.purpose || null,
          latest_order_crux: analysisBody?.crux || null,
          latest_order_date: analysisBody?.order_date || null,
          latest_order_document_id: documentId,
          latest_order_action: analysisBody?.purpose || null
        };
        await db.from("cases").update(caseUpdate).eq("cino", cino).eq("owner_id", auth.user.id);
        await db.from("documents").update({
          cino,
          processing_status:"AI Complete - Review",
          review_status:"needs_review"
        }).eq("id", documentId).eq("owner_id", auth.user.id);
      }
    }
    return json(req, {
      ok: analyzed.ok,
      document_id: documentId,
      processing_status: analyzed.ok ? "AI Complete - Review" : "AI Analysis Failed",
      next_date: analysisBody?.next_date || null,
      purpose: analysisBody?.purpose || null,
      cino: analysisBody?.case_identified || null,
      analysis: analysisBody
    }, analyzed.ok ? 200 : 502);
  } catch {
    console.error("capture-mobile-order: request failed");
    return json(req, { error:"Could not process the shared court order" },500);
  }
});
