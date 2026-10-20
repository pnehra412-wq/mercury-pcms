import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const analysisId = Number(body?.analysis_id);
    const approved = body?.approved === true;
    if (!Number.isSafeInteger(analysisId) || analysisId <= 0 || !approved) {
      return json(req, { error: "analysis_id and approved=true are required" }, 400);
    }

    // owner_id is added by the companion, un-applied RLS migration. Do not
    // deploy this function until that schema migration has been tested/applied.
    const { data: analysis, error: analysisError } = await auth.admin
      .from("document_analysis")
      .select("id,document_id,cino,matched_case_id,status,order_date,next_date,next_purpose,outcome,crux,advocate_action")
      .eq("id", analysisId)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    if (analysisError) {
      console.error("confirm-document-analysis: analysis lookup failed");
      return json(req, { error: "Could not retrieve analysis" }, 500);
    }
    if (!analysis) return json(req, { error: "Analysis not found" }, 404);
    if (analysis.status === "confirmed") return json(req, { ok: true, already_confirmed: true });

    if (!analysis.matched_case_id) {
      return json(req, { error: "No case match is attached to this analysis. Select the correct case first." }, 409);
    }

    const { data: caseRow, error: caseError } = await auth.admin
      .from("cases")
      .select("id,cino,date_next_list,purpose_name")
      .eq("id", analysis.matched_case_id)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    if (caseError) {
      console.error("confirm-document-analysis: case lookup failed");
      return json(req, { error: "Could not verify matched case" }, 500);
    }
    if (!caseRow) return json(req, { error: "Matched case not found" }, 404);

    // Verify the linked document belongs to the same owner before any writes.
    const { data: document, error: documentError } = await auth.admin
      .from("documents")
      .select("id")
      .eq("id", analysis.document_id)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (documentError || !document) return json(req, { error: "Document not found" }, 404);

    const now = new Date().toISOString();
    const hearing = {
      cino: caseRow.cino,
      owner_id: auth.user.id,
      source_document_analysis_id: analysis.id,
      hearing_date: analysis.order_date,
      purpose: analysis.next_purpose,
      outcome: analysis.outcome,
      next_date: analysis.next_date,
      notes: analysis.crux,
    };
    const { error: hearingError } = await auth.admin.from("hearing_history").insert(hearing);
    if (hearingError) {
      if (hearingError.code !== "23505") {
        console.error("confirm-document-analysis: hearing history insert failed");
        return json(req, { error: "Could not record the hearing history" }, 500);
      }
      const { data: existingHearing, error: duplicateCheckError } = await auth.admin
        .from("hearing_history")
        .select("id")
        .eq("source_document_analysis_id", analysis.id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      if (duplicateCheckError || !existingHearing) {
        console.error("confirm-document-analysis: duplicate hearing could not be verified");
        return json(req, { error: "Could not verify hearing history status" }, 500);
      }
    }

    const caseUpdate: Record<string, unknown> = {
      latest_order_crux: analysis.crux,
      latest_order_date: analysis.order_date,
      latest_order_document_id: analysis.document_id,
      latest_order_action: analysis.advocate_action,
    };
    if (analysis.next_date) caseUpdate.date_next_list = analysis.next_date;
    if (analysis.next_purpose) caseUpdate.purpose_name = analysis.next_purpose;
    if (analysis.crux) caseUpdate.note = String(analysis.crux).slice(0, 2000);

    const { error: caseUpdateError } = await auth.admin.from("cases")
      .update(caseUpdate)
      .eq("id", caseRow.id)
      .eq("owner_id", auth.user.id);
    if (caseUpdateError) {
      console.error("confirm-document-analysis: case update failed");
      return json(req, { error: "Could not update the case record" }, 500);
    }

    if (analysis.advocate_action && analysis.advocate_action !== "No specific action stated.") {
      const task = {
        cino: caseRow.cino,
        owner_id: auth.user.id,
        source_document_analysis_id: analysis.id,
        title: "Review action from order: " + String(analysis.advocate_action).slice(0, 180),
        due: analysis.next_date,
        priority: "High",
        done: false,
      };
      const { error: taskError } = await auth.admin.from("tasks").insert(task);
      if (taskError) {
        if (taskError.code !== "23505") {
          console.error("confirm-document-analysis: task insert failed");
          return json(req, { error: "Case was updated, but the follow-up task could not be created" }, 500);
        }
        const { data: existingTask, error: duplicateTaskError } = await auth.admin
          .from("tasks")
          .select("id")
          .eq("source_document_analysis_id", analysis.id)
          .eq("owner_id", auth.user.id)
          .maybeSingle();
        if (duplicateTaskError || !existingTask) {
          console.error("confirm-document-analysis: duplicate task could not be verified");
          return json(req, { error: "Could not verify follow-up task status" }, 500);
        }
      }
    }

    const { error: documentUpdateError } = await auth.admin.from("documents")
      .update({
        cino: caseRow.cino,
        processing_status: "Confirmed",
        review_status: "confirmed",
        confirmed_at: now,
        confirmed_by: auth.user.id,
      })
      .eq("id", analysis.document_id)
      .eq("owner_id", auth.user.id);
    if (documentUpdateError) {
      console.error("confirm-document-analysis: document update failed");
      return json(req, { error: "Case was updated, but the document confirmation could not be saved" }, 500);
    }

    const { data: updated, error: updateError } = await auth.admin.from("document_analysis")
      .update({ status: "confirmed", reviewed_at: now, reviewed_by: auth.user.id })
      .eq("id", analysisId)
      .eq("owner_id", auth.user.id)
      .select("id,status,reviewed_at,reviewed_by")
      .single();
    if (updateError || !updated) {
      console.error("confirm-document-analysis: confirmation status update failed");
      return json(req, { error: "The case was updated, but analysis confirmation status could not be saved" }, 500);
    }

    return json(req, {
      ok: true,
      case_cino: caseRow.cino,
      next_date: analysis.next_date,
      purpose: analysis.next_purpose,
      analysis: updated,
    });
  } catch {
    return json(req, { error: "Invalid request or analysis confirmation failed" }, 400);
  }
});
