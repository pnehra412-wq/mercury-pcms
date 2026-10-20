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
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MODEL = Deno.env.get("MERCURY_GEMINI_MODEL") || "gemini-3.8-flash";
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const schema = {
  type: "OBJECT",
  properties: {
    cino: { type: "STRING", nullable: true },
    case_title: { type: "STRING", nullable: true },
    court: { type: "STRING", nullable: true },
    judge: { type: "STRING", nullable: true },
    order_date: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    next_date: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    purpose: { type: "STRING", nullable: true },
    document_type: { type: "STRING", nullable: true },
    outcome: { type: "STRING", nullable: true },
    crux: { type: "STRING", nullable: true },
    court_directions: { type: "STRING", nullable: true },
    advocate_action: { type: "STRING", nullable: true },
    important_points: { type: "ARRAY", items: { type: "STRING" } },
    source_pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING" },
          page: { type: "INTEGER" },
          note: { type: "STRING" }
        },
        required: ["field","page","note"]
      }
    },
    confidence: { type: "NUMBER" }
  },
  required: ["important_points","source_pages","confidence"]
};

const prompt = "You are Mercury, a conservative legal-office document intelligence engine for an Indian advocate.\n" +
"You are analysing Indian eCourts orders/proceedings sheets. These documents often contain a short order followed by a final line such as 'Fresh notice ... for 02.11.2026', 'Put up on ...', 'Next date ...', or a date/purpose table.\n\n" +
"Rules:\n" +
"1. Extract facts from the document; do not invent missing information.\n" +
"2. Distinguish the ORDER DATE (usually labelled Date of order / Date of decision or shown at the end) from the NEXT HEARING DATE. Never use the order date as next_date merely because it is the latest date visible.\n" +
"3. NEXT DATE: actively inspect the entire document, especially the final 20% of each page, the last paragraph, the date/purpose table, and phrases including 'Next Date', 'Next date of hearing', 'Date of hearing', 'for', 'on date fixed', 'adjourned to', 'put up on', 'list on', 'come up on', 'next date fixed as', 'fresh notice ... for [date]'. If a future date is expressly fixed for further proceedings, extract it as next_date.\n" +
"4. PURPOSE: extract the procedural purpose attached to that future date. If the order says 'fresh notice to remaining JDs be issued for 02.11.2026' and/or 'application for impleading LRs ... be filed on the date fixed', purpose should capture those stated proceedings, e.g. 'Fresh notice to remaining JDs; application for impleading LRs to be filed'. Do not leave purpose null merely because there is no formal 'Purpose' label when the proceeding is expressly stated. Do not invent a generic purpose.\n" +
"5. If there are multiple future dates, choose the date expressly fixed as the next date of the case, normally the final future date directing when the matter is to be taken up. Mention other dates only in important_points if material.\n" +
"6. CRUX must explain what materially happened in this order in 3-6 precise sentences, including the next date and material directions where available.\n" +
"7. COURT DIRECTIONS must state what the court actually directed, including fresh notice, impleadment/substitution applications, ex parte orders, etc.\n" +
"8. ADVOCATE ACTION must identify practical action required, but only when supported by the order. If the order directs an application to be filed on the next date, state that action.\n" +
"9. Preserve uncertainty: use null when a field cannot be reliably established, but do not use null when the next date/purpose is expressly stated in the document.\n" +
"10. Source pages are PDF page numbers (1-based). For next_date and purpose, cite the page containing the direction/date. Do not fabricate page numbers.\n" +
"11. Do not give legal advice beyond the contents of the document.\n" +
"12. Return only the requested JSON structure.\n\n" +
"FINAL CHECK BEFORE RETURNING JSON: identify the order date, independently identify the next hearing date, and identify the stated procedural purpose for that future date. If the document contains an explicit future date in the operative/final directions, next_date must not be null.";

async function geminiAnalyze(pdfBytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode(...pdfBytes.subarray(i, Math.min(i + chunk, pdfBytes.length)));
  }
  const base64 = btoa(binary);
  const body = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: "application/pdf", data: base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1
    }
  };
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
  let r:any = null;
  let raw = "";
  let lastStatus = 503;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify(body)
      });
      raw = await r.text();
      lastStatus = r.status;
      if (r.ok) break;
      if (![408,429,500,502,503,504].includes(r.status)) break;
    } catch (e) {
      raw = String(e?.message || e);
      lastStatus = 503;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(8000, 1000 * Math.pow(2, attempt))));
  }
  if (!r?.ok) throw new Error("Gemini " + lastStatus + ": " + raw.slice(0,1000));
  const j = JSON.parse(raw);
  const text = j?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("") || "";
  if (!text) throw new Error("Gemini returned no structured analysis");
  return JSON.parse(text);
}

function validDate(v:any) {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

Deno.serve(async (req) => {  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  if (req.method !== "POST") return respond(req, {error:"Method Not Allowed"}, {status:405});
  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return respond(req, {error:auth.message}, {status:auth.status});
  try {
    if (!GEMINI_KEY) return respond(req, {error:"GEMINI_API_KEY is not configured"}, {status:503});
    const body = await req.json();
    const documentId = Number(body?.document_id);
    if (!Number.isInteger(documentId)) return respond(req, {error:"document_id required"}, {status:400});

    const { data: doc, error: de } = await db.from("documents")
      .select("id,cino,name,mime_type,storage_bucket,storage_path,processing_status,owner_id")
      .eq("id", documentId).eq("owner_id", auth.user.id).single();
    if (de || !doc) return respond(req, {error:"Document not found"}, {status:404});
    if (doc.storage_bucket !== "case-files" || !doc.storage_path) return respond(req, {error:"Document has no accessible stored file"}, {status:422});

    const { data: file, error: fe } = await db.storage.from(doc.storage_bucket).download(doc.storage_path);
    if (fe || !file) return respond(req, {error:"Could not read stored document"}, {status:500});
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 25 * 1024 * 1024) return respond(req, {error:"Document exceeds Mercury analysis limit"}, {status:413});

    await db.from("documents").update({
      processing_status:"AI Processing",
      review_status:"pending",
      last_analyzed_at:new Date().toISOString()
    }).eq("id", documentId).eq("owner_id", auth.user.id);

    let analysis:any;
    try {
      analysis = await geminiAnalyze(bytes);
    } catch (e) {
      await db.from("documents").update({processing_status:"AI Failed",review_status:"needs_review"}).eq("id", documentId).eq("owner_id", auth.user.id);
      await db.from("document_analysis").upsert({
        document_id:documentId, owner_id:auth.user.id, cino:doc.cino, ai_provider:"Gemini",
        ai_model:MODEL, status:"failed", error_message:"AI analysis failed"
      }, {onConflict:"document_id,analysis_version"});
      console.error("analyze-court-document: model analysis failed");
      return respond(req, {ok:false, queued:true, retryable:true, error:"AI analysis failed; safe to retry"}, {status:200});
    }

    const orderDate = validDate(analysis.order_date);
    const nextDate = validDate(analysis.next_date);
    const confidence = Number.isFinite(Number(analysis.confidence)) ? Math.max(0,Math.min(1,Number(analysis.confidence))) : null;

    const normalize = (s:any) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g," ").replace(/\\s+/g," ").trim();
    const wantedCino = normalize(doc.cino || analysis.cino);
    const { data: caseRows } = await db.from("cases")
      .select("id,cino,petparty_name,resparty_name,establishment_name,district_name")
      .eq("owner_id", auth.user.id)
      .limit(500);

    let matchedCase:any = null;
    let matchMethod = null;
    let matchConfidence = 0;
    if (wantedCino) {
      matchedCase = (caseRows || []).find((c:any) => normalize(c.cino) === wantedCino) || null;
      if (matchedCase) { matchMethod = "CNR"; matchConfidence = 1; }
    }
    if (!matchedCase && analysis.case_title) {
      const title = normalize(analysis.case_title);
      for (const c of (caseRows || [])) {
        const p = normalize(c.petparty_name), r = normalize(c.resparty_name);
        if (p && r && title.includes(p) && title.includes(r)) {
          matchedCase = c; matchMethod = "Party names"; matchConfidence = 0.94; break;
        }
      }
    }

    const row = {
      document_id:documentId,
      owner_id:auth.user.id,
      cino:matchedCase?.cino || doc.cino || analysis.cino || null,
      matched_case_id:matchedCase?.id || null,
      match_method:matchMethod,
      match_confidence:matchConfidence || null,
      analysis_version:"v1",
      ai_provider:"Gemini",
      ai_model:MODEL,
      status:"needs_review",
      confidence,
      order_date:orderDate,
      next_date:nextDate,
      next_purpose:analysis.purpose || null,
      document_type:analysis.document_type || null,
      crux:analysis.crux || null,
      court_directions:analysis.court_directions || null,
      advocate_action:analysis.advocate_action || null,
      outcome:analysis.outcome || null,
      important_points:Array.isArray(analysis.important_points) ? analysis.important_points : [],
      source_pages:Array.isArray(analysis.source_pages) ? analysis.source_pages : [],
      raw_json:analysis
    };
    const { data: saved, error: ae } = await db.from("document_analysis")
      .upsert(row, {onConflict:"document_id,analysis_version"}).select().single();
    if (ae) throw ae;

    await db.from("documents").update({
      cino: matchedCase?.cino || doc.cino || analysis.cino || null,
      order_date: orderDate,
      document_category: analysis.document_type || "Court Order",
      ai_summary: analysis.crux || null,
      processing_status:"AI Complete - Review",
      review_status:"needs_review"
    }).eq("id",documentId).eq("owner_id",auth.user.id);

    return respond(req, {
      ok:true, document_id:documentId, analysis_id:saved.id,
      provider:"Gemini", model:MODEL, status:"needs_review",
      case_identified:matchedCase?.cino || doc.cino || analysis.cino || null,
      cino:matchedCase?.cino || doc.cino || analysis.cino || null,
      order_date:orderDate, next_date:nextDate, purpose:analysis.purpose || null,
      advocate_action:analysis.advocate_action || null, crux:analysis.crux || null
    });
  } catch (e) {
    console.error("analyze-court-document: request failed");
    return respond(req, {error:"Document analysis failed"}, {status:500});
  }
});