import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@1.8.1";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, key);

const ALLOWED_ORIGINS = new Set([
  "https://hmtcnatqowokeyrdjujq.supabase.co",
  "https://mercuryandroid.vercel.app"
]);
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://mercuryandroid.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
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
  if (!ALLOWED_ORIGINS.has(req.headers.get("Origin") || "")) return json(req, { error: "Unauthorized origin" }, 403);
  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return json(req, { error: auth.message }, auth.status);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json(req, { error: "file required" }, 400);
    if (file.size > 25 * 1024 * 1024) return json(req, { error: "PDF exceeds 25 MB" }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dig = await crypto.subtle.digest("SHA-256", bytes);
    const fingerprint = Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2,"0")).join("");

    const old = await db.from("documents").select("id,cino,name,processing_status,ai_summary").eq("fingerprint", fingerprint).eq("owner_id", auth.user.id).maybeSingle();
    if (old.data) {
      // Re-uploading an identical PDF is treated as a safe AI refresh rather than
      // silently returning the old/stale analysis.
      const analyzerUrl = url + "/functions/v1/analyze-court-document";
      const analyzed = await fetch(analyzerUrl, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization": req.headers.get("Authorization") || "" },
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
    if (up.error) return json(req, { error: up.error.message }, 500);

    const ins = await db.from("documents").insert({
      name:file.name, size:file.size, mime_type:"application/pdf", doc_type:String(form.get("doc_type")||"Order"),
      storage_bucket:"case-files", storage_path:path, source:"eCourts Mobile Share", fingerprint,
      owner_id:auth.user.id, processing_status:"Processing"
    }).select("id,name,storage_path,processing_status").single();
    if (ins.error) {
      await db.storage.from("case-files").remove([path]);
      return json(req, { error:ins.error.message },500);
    }

    const documentId = ins.data.id;

    const analyzerUrl = url + "/functions/v1/analyze-court-document";
    const analyzed = await fetch(analyzerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    let extracted = "";
    let totalPages = 0;
    try {
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      totalPages = pdf.numPages;
      if (totalPages > 100) throw new Error("PDF has more than 100 pages");
      const result = await extractText(pdf, { mergePages:true });
      extracted = String(result.text || "").slice(0, 500000);
    } catch (e) {
      await db.from("documents").update({ processing_status:"Extraction Failed", extracted_text:"Text extraction failed" }).eq("id",documentId).eq("owner_id", auth.user.id);
      return json(req, { ok:true, document_id:documentId, processing_status:"Extraction Failed", error:"Could not extract text. The PDF may be scanned/image-only." });
    }

    const cinoRaw = findCino(extracted);
    const dates = findDates(extracted);
    const orderDate = dates[0] || null;
    const nextDate = likelyNextDate(extracted, dates);
    const detectedPurpose = purpose(extracted);
    const detectedOutcome = outcome(extracted);

    const { data: cases, error: caseErr } = await db.from("cases")
      .select("id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,purpose_name,case_status")
      .eq("owner_id", auth.user.id)
      .limit(500);
    if (caseErr) throw caseErr;

    let match:any = null;
    let confidence = 0;
    let newCaseCreated = false;
    if (cinoRaw) {
      match = cases?.find((c:any) => clean(c.cino) === clean(cinoRaw));
      if (match) {
        confidence = 1;
      } else {
        const newCase:any = {
          owner_id: auth.user.id,
          cino: cinoRaw,
          type_name: "New Case - Auto Captured",
          establishment_name: /KARNAL/i.test(extracted) ? "Karnal" : null,
          district_name: /KARNAL/i.test(extracted) ? "Karnal" : null,
          date_next_list: nextDate,
          purpose_name: detectedPurpose,
          note: `Automatically created from uploaded court order. CINO: ${cinoRaw}.`,
          case_status: "Pending"
        };
        const created = await db.from("cases").insert(newCase).select("id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,purpose_name,case_status").single();
        if (created.error) {
          const retry = await db.from("cases").select("id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,purpose_name,case_status").eq("cino", cinoRaw).eq("owner_id", auth.user.id).maybeSingle();
          if (retry.data) { match = retry.data; confidence = 1; }
          else throw created.error;
        } else {
          match = created.data; confidence = 1; newCaseCreated = true;
        }
      }
    }
    if (!match && cases?.length) {
      const textClean = clean(extracted);
      let best = { c:null as any, score:0 };
      for (const c of cases) {
        const names = [c.petparty_name, c.resparty_name, c.establishment_name].filter(Boolean).map(clean);
        let score = 0;
        for (const n of names) {
          if (n && textClean.includes(n)) score += 0.28;
          const words = n.split(" ").filter((w:string)=>w.length >= 4);
          const hits = words.filter((w:string)=>textClean.includes(w)).length;
          if (words.length) score += Math.min(0.20, 0.20 * hits / words.length);
        }
        if (c.district_name && textClean.includes(clean(c.district_name))) score += 0.08;
        if (c.establishment_name && textClean.includes(clean(c.establishment_name))) score += 0.12;
        if (score > best.score) best = { c, score };
      }
      if (best.c && best.score >= 0.55) { match = best.c; confidence = Math.min(0.94, best.score); }
    }

    const aiKey = Deno.env.get("OPENAI_API_KEY");
    let aiSummary = null;
    if (aiKey && extracted.length > 20) {
      try {
        const aiRes = await fetch("https://api.openai.com/v1/responses", {
          method:"POST",
          headers:{ "Authorization":`Bearer ${aiKey}`, "Content-Type":"application/json" },
          body:JSON.stringify({
            model:Deno.env.get("MERCURY_AI_MODEL") || "gpt-5-mini",
            input:[{role:"system",content:"You are a legal-office document assistant. Summarize the court order conservatively. Do not invent facts. Return JSON with summary, order_date, next_date, purpose, outcome, cino. Dates must be YYYY-MM-DD or null."},
              {role:"user",content:extracted.slice(0,120000)}],
            text:{format:{type:"json_object"}}
          })
        });
        if (aiRes.ok) {
          const data = await aiRes.json();
          const raw = data.output_text || "";
          try { aiSummary = JSON.parse(raw); } catch {}
        }
      } catch {}
    }

    const finalOrderDate = aiSummary?.order_date || orderDate;
    const finalNextDate = aiSummary?.next_date || nextDate;
    const finalPurpose = aiSummary?.purpose || detectedPurpose;
    const finalOutcome = aiSummary?.outcome || detectedOutcome;

    const updates:any = {
      extracted_text: extracted,
      order_date: finalOrderDate,
      ai_summary: aiSummary?.summary || `Captured ${totalPages} page order. Outcome: ${finalOutcome}.`,
      processing_status: match && confidence >= 0.95 ? (newCaseCreated ? "New Case Created - Review" : "Matched - Review") : "Needs Verification",
      case_match_confidence: confidence
    };
    if (match && confidence >= 0.95) updates.cino = match.cino;

    await db.from("documents").update(updates).eq("id",documentId).eq("owner_id", auth.user.id);

    if (match && confidence >= 0.95) {
      const hearing = await db.from("hearing_history").insert({
        cino:match.cino, owner_id:auth.user.id, hearing_date:finalOrderDate, purpose:finalPurpose,
        outcome:finalOutcome, next_date:finalNextDate,
        notes:aiSummary?.summary || "Order captured from eCourts mobile share."
      });
      if (hearing.error) console.error("hearing_history:", hearing.error.message);

      const caseUpdate:any = {};
      if (finalNextDate) caseUpdate.date_next_list = finalNextDate;
      if (finalPurpose) caseUpdate.purpose_name = finalPurpose;
      const note = `Order captured ${finalOrderDate || ""}: ${aiSummary?.summary || finalOutcome}`.trim();
      if (note) caseUpdate.note = note.slice(0,2000);
      if (Object.keys(caseUpdate).length) await db.from("cases").update(caseUpdate).eq("cino",match.cino).eq("owner_id", auth.user.id);

      await db.from("court_watch").update({
        last_checked_at:new Date().toISOString(),
        last_order_date:finalOrderDate,
        last_order_fingerprint:fingerprint
      }).eq("cino",match.cino).eq("owner_id", auth.user.id);
    }

    return json(req, {
      ok:true, duplicate:false, document_id:documentId, pages:totalPages,
      cino:match?.cino || null, detected_cino:cinoRaw, confidence,
      new_case_created:newCaseCreated,
      processing_status:updates.processing_status,
      order_date:finalOrderDate, next_date:finalNextDate, purpose:finalPurpose,
      ai_enabled:Boolean(aiKey), matched_case:match ? {
        cino:match.cino, type_name:match.type_name,
        petitioner:match.petparty_name, respondent:match.resparty_name,
        court:match.establishment_name
      } : null
    });
  } catch (e) {
    return json(req, { error:String(e?.message || e) },500);
  }
});