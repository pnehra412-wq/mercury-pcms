import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const ALLOWED_ORIGINS=new Set(["https://hmtcnatqowokeyrdjujq.supabase.co","https://mercuryandroid.vercel.app","https://pnehra412-wq.github.io"]);
function cors(req:Request){const origin=req.headers.get("Origin")||"";return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://mercuryandroid.vercel.app","Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json"};}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"POST required"}),{status:405,headers:cors(req)});
 const origin=req.headers.get("Origin")||"";
 if(!ALLOWED_ORIGINS.has(origin))return new Response(JSON.stringify({error:"Origin not allowed"}),{status:403,headers:cors(req)});
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization)return new Response(JSON.stringify({error:"Authentication required"}),{status:401,headers:cors(req)});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??Deno.env.get("SUPABASE_ANON_KEY")??"";
 if(!url||!key)return new Response(JSON.stringify({error:"Server configuration unavailable"}),{status:503,headers:cors(req)});
 const upstream=await fetch(url+"/functions/v1/capture-mobile-order",{method:"POST",headers:{apikey:key,Authorization:authorization,"Content-Type":req.headers.get("Content-Type")||"application/octet-stream"},body:await req.arrayBuffer()});
 const body=await upstream.arrayBuffer();
 return new Response(body,{status:upstream.status,headers:{...cors(req),"Content-Type":upstream.headers.get("Content-Type")||"application/json"}});
});