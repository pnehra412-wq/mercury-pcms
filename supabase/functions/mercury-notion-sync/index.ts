import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOTION_VERSION = "2025-09-03";
const DATA_SOURCE_ID = "6ee38f90-7484-47e8-b127-e550bf06a51f";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
}
function richText(value: unknown) {
  const s = String(value ?? "").trim();
  return { rich_text: s ? [{ type: "text", text: { content: s.slice(0, 2000) } }] : [] };
}
function title(value: unknown) {
  const s = String(value ?? "").trim() || "Untitled case";
  return { title: [{ type: "text", text: { content: s.slice(0, 2000) } }] };
}
function caseTitle(c: any) {
  const p = String(c.petparty_name ?? "").trim();
  const r = String(c.resparty_name ?? "").trim();
  return p && r ? `${p} vs ${r}` : p || r || String(c.cino ?? "Untitled case");
}
async function notionRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch("https://api.notion.com/v1" + path, {
    ...init,
    headers: { "Authorization": `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}
Deno.serve(async (req: Request) => {
  // The Supabase gateway verifies the JWT signature; restrict this function to the single-user owner as well.
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Missing server configuration." }, 500);
  const bearer = req.headers.get("Authorization") || "";
  const jwt = bearer.replace(/^Bearer\s+/i, "");
  try {
    const part = jwt.split(".")[1];
    if (!part) return json({ error: "Authentication required" }, 401);
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const ownerResponse=await fetch(`${supabaseUrl}/rest/v1/cases?select=user_id&limit=1`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}});
    if(!ownerResponse.ok)return json({error:"Could not verify Mercury workspace owner."},503);
    const ownerRows=await ownerResponse.json();
    if(!ownerRows?.[0]?.user_id||payload.sub!==ownerRows[0].user_id)return json({error:"Not authorized for this single-user Mercury workspace"},403);
  } catch { return json({ error: "Invalid authentication token" }, 401); }
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const notionToken = Deno.env.get("NOTION_API_KEY");
    if (!notionToken) return json({ error: "Missing server configuration. Required secret: NOTION_API_KEY." }, 500);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = body.action === "sync" ? "sync" : "preview";
    const afterId = Number.isFinite(Number(body.after_id)) ? Number(body.after_id) : 0;

    const sb = await fetch(`${supabaseUrl}/rest/v1/cases?select=id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,court_no_desg_name,purpose_name,case_status&case_status=eq.Pending&id=gt.${afterId}&order=id.asc&limit=1000`, {
      headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
    });
    if (!sb.ok) throw new Error(`Supabase query failed: ${sb.status} ${(await sb.text()).slice(0, 300)}`);
    const cases = await sb.json();

    const notionRows: any[] = [];
    let startCursor: string | undefined;
    do {
      const payload: any = { page_size: 100 };
      if (startCursor) payload.start_cursor = startCursor;
      const result = await notionRequest(`/data_sources/${DATA_SOURCE_ID}/query`, notionToken, { method: "POST", body: JSON.stringify(payload) });
      notionRows.push(...(result.results || []));
      startCursor = result.has_more ? result.next_cursor : undefined;
    } while (startCursor && notionRows.length < 2000);

    const existingByCino = new Map<string, any>();
    for (const page of notionRows) {
      const cino = page.properties?.CINO?.rich_text?.map((x: any) => x.plain_text ?? x.text?.content ?? "").join("").trim();
      if (cino && !existingByCino.has(cino)) existingByCino.set(cino, page);
    }
    const matched = cases.filter((c: any) => c.cino && existingByCino.has(String(c.cino).trim()));
    const unmatched = cases.filter((c: any) => !c.cino || !existingByCino.has(String(c.cino).trim()));

    if (action === "preview") return json({
      mode: "preview_only", supabase_pending_cases_read: cases.length, notion_rows_read: notionRows.length,
      existing_cino_matches: matched.length, pending_cases_not_in_notion: unmatched.length,
      sample_matches: matched.slice(0, 5).map((c: any) => ({ cino: c.cino, case: caseTitle(c), next_date: c.date_next_list })),
      note: "Preview makes no changes. Sync updates matching existing Notion rows only; it never creates or deletes pages.",
    });

    const results: any[] = [];
    for (const c of matched) {
      const page = existingByCino.get(String(c.cino).trim());
      const properties: any = {
        "Case": title(caseTitle(c)), "CINO": richText(c.cino), "Case Type": richText(c.type_name),
        "Court": richText(c.court_no_desg_name), "District": richText(c.district_name),
        "Petitioner / Appellant": richText(c.petparty_name), "Respondent": richText(c.resparty_name),
        "Purpose": richText(c.purpose_name),
        "Next Date": { date: c.date_next_list ? { start: String(c.date_next_list).slice(0, 10) } : null },
      };
      const update = await notionRequest(`/pages/${page.id}`, notionToken, { method: "PATCH", body: JSON.stringify({ properties }) });
      results.push({ cino: c.cino, updated: Boolean(update.id) });
    }
    return json({
      mode: "sync", supabase_pending_cases_read: cases.length, notion_rows_read: notionRows.length,
      matched_existing_pages: matched.length, updated_pages: results.filter((x) => x.updated).length,
      pending_cases_not_in_notion: unmatched.length, created_pages: 0, deleted_pages: 0, results,
    });
  } catch (error) {
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});