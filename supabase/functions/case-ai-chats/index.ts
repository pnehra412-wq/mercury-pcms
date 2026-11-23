import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY);
const ALLOWED_ORIGINS = new Set(["https://hmtcnatqowokeyrdjujq.supabase.co","https://mercuryandroid.vercel.app","https://pnehra412-wq.github.io"]);
function headers(req: Request) {
  const origin=req.headers.get("Origin")||"";
  return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://mercuryandroid.vercel.app","Access-Control-Allow-Headers":"content-type, authorization","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin","Content-Type":"application/json"};
}
function json(req: Request, body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)});}
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:{...headers(req),"Access-Control-Allow-Headers":"apikey, content-type, authorization"}});
  const bearer=req.headers.get("Authorization")||"";
  const jwt=bearer.replace(/^Bearer\s+/i,"");
  let userId="";
  try { const part=jwt.split(".")[1]; if(!part)return json(req,{error:"Authentication required"},401); const payload=JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/"))); userId=payload.sub||""; } catch { return json(req,{error:"Invalid authentication token"},401); }
  const {data:ownerRow,error:ownerError}=await db.from("cases").select("user_id").not("user_id","is",null).limit(1).maybeSingle();
  if(ownerError||!ownerRow?.user_id||userId!==ownerRow.user_id)return json(req,{error:"Not authorized for this Mercury workspace"},403);
  if(!ALLOWED_ORIGINS.has(req.headers.get("Origin")||"")) return json(req,{error:"Unauthorized origin"},403);
  try{
    if(req.method==="GET"){
      const cino=new URL(req.url).searchParams.get("cino");
      if(!cino)return json(req,{error:"cino required"},400);
      const {data,error}=await db.from("case_ai_chats").select("id,cino,provider,title,chat_url,chat_role,notes,created_at,updated_at").eq("cino",cino).eq("user_id",userId).order("provider");
      if(error)return json(req,{error:error.message},500);
      return json(req,{ok:true,chats:data||[]});
    }
    if(req.method==="POST"){
      const body=await req.json();
      const cino=String(body?.cino||"").trim(), provider=String(body?.provider||"").trim(), chat_url=String(body?.chat_url||"").trim(), title=String(body?.title||provider+" Case Chat").trim();
      if(!cino||!provider||!chat_url)return json(req,{error:"cino, provider and chat_url are required"},400);
      if(!/^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai)\//i.test(chat_url))return json(req,{error:"Only ChatGPT or Claude chat links are allowed"},400);
      const {data:existing,error:findError}=await db.from("case_ai_chats").select("id").eq("cino",cino).eq("provider",provider).eq("user_id",userId).maybeSingle();
      if(findError)return json(req,{error:findError.message},500);
      const values={user_id:userId,cino,provider,title,chat_url,chat_role:"case",updated_at:new Date().toISOString()};
      let data,error;
      if(existing?.id)({data,error}=await db.from("case_ai_chats").update(values).eq("id",existing.id).eq("user_id",userId).select().single());
      else({data,error}=await db.from("case_ai_chats").insert(values).select().single());
      if(error)return json(req,{error:error.message},500);
      return json(req,{ok:true,chat:data});
    }
    return json(req,{error:"Method Not Allowed"},405);
  }catch(e){return json(req,{error:String(e?.message||e)},500);}
});