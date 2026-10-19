import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

async function db(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#111827"><title>Mercury — AI Legal Office</title><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js" crossorigin></script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7fb;color:#172033}
header{background:#111827;color:white;padding:18px 20px;position:sticky;top:0;z-index:5}h1{margin:0;font-size:22px}.sub{opacity:.7;font-size:12px;margin-top:3px}
.wrap{max-width:1250px;margin:auto;padding:18px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.card{background:white;border:1px solid #e5e7eb;border-radius:14px;padding:15px;box-shadow:0 2px 8px #00000008}.stat b{font-size:25px;display:block}.stat span{font-size:12px;color:#667085}
.tools{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:15px}input,select,button{border:1px solid #d0d5dd;border-radius:10px;padding:10px 12px;background:white;font:inherit}input{flex:1;min-width:220px}button{cursor:pointer;background:#111827;color:white;border-color:#111827}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}.case h3{font-size:15px;margin:0 0 8px}.meta{font-size:12px;color:#667085;line-height:1.55}.date{font-weight:700;color:#111827}.tag{display:inline-block;padding:4px 7px;border-radius:999px;background:#eef2ff;font-size:11px;margin-top:7px}.empty{padding:30px;text-align:center;color:#667085}
@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.wrap{padding:12px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>⚖️ Mercury</h1><div class="sub">AI Legal Office · Pending Cases Desk</div></header>
<div class="wrap"><form id="login" class="card" style="display:none;max-width:420px;margin:0 auto 16px"><h2>Sign in to Mercury</h2><label for="email">Email</label><input id="email" type="email" autocomplete="username" required style="width:100%;min-width:0;margin:8px 0"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required style="width:100%;min-width:0;margin:8px 0"><button type="submit">Sign in</button><p id="login-error" role="alert"></p></form><div class="stats" id="stats"></div>
<div class="tools"><input id="q" placeholder="Search CNR, party, client, court…"><select id="range"><option value="all">All pending</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select><button onclick="load()">Refresh</button></div>
<div id="list" class="grid"></div></div>
<script>
let cases=[];
const SB_URL="https://hmtcnatqowokeyrdjujq.supabase.co";
const SB_KEY=\${JSON.stringify(PUBLIC_KEY)};
const supa=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let session=null;
const login=document.getElementById("login"),loginError=document.getElementById("login-error");
function showLogin(message){login.style.display="block";loginError.textContent=message||"Sign in to view your cases.";}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function iso(d){return d.toISOString().slice(0,10)}
function fmt(s){if(!s)return "—";let d=new Date(s+"T00:00:00");return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
async function load(){const current=await supa.auth.getSession();session=current.data?.session||session;if(!session?.access_token){showLogin("Sign in to view your cases.");return}login.style.display="none";let r=await fetch("?api=cases",{headers:{Authorization:"Bearer "+session.access_token}});let j=await r.json().catch(()=>({}));if(!r.ok){document.getElementById("list").innerHTML='<div class="card empty">Access denied or session expired. Please sign in again.</div>';if(r.status===401)showLogin("Your session expired. Sign in again.");return}cases=j.cases||[];render()}
function render(){let q=document.getElementById("q").value.toLowerCase(),range=document.getElementById("range").value,today=new Date(),t=iso(today),tom=iso(new Date(today.getTime()+86400000)),end=new Date(today.getTime()+86400000*Number(range==="30"?30:7));
let f=cases.filter(c=>{let text=[c.cino,c.petparty_name,c.resparty_name,c.client_name,c.establishment_name,c.court_no_desg_name,c.purpose_name].join(" ").toLowerCase();if(q&&!text.includes(q))return false;if(range==="today"&&c.date_next_list!==t)return false;if(range==="tomorrow"&&c.date_next_list!==tom)return false;if(range==="7"&&(!c.date_next_list||c.date_next_list<t||c.date_next_list>iso(end)))return false;if(range==="30"&&(!c.date_next_list||c.date_next_list<t||c.date_next_list>iso(end)))return false;return true}).sort((a,b)=>(a.date_next_list||"9999").localeCompare(b.date_next_list||"9999"));
let counts={today:cases.filter(c=>c.date_next_list===t).length,tomorrow:cases.filter(c=>c.date_next_list===tom).length,week:cases.filter(c=>c.date_next_list&&c.date_next_list>=t&&c.date_next_list<=iso(new Date(today.getTime()+86400000*7))).length};
document.getElementById("stats").innerHTML='<div class="card stat"><b>'+cases.length+'</b><span>Pending cases</span></div><div class="card stat"><b>'+counts.today+'</b><span>Today</span></div><div class="card stat"><b>'+counts.tomorrow+'</b><span>Tomorrow</span></div><div class="card stat"><b>'+counts.week+'</b><span>Next 7 days</span></div>';
document.getElementById("list").innerHTML=f.length?f.map(c=>'<div class="card case"><h3>'+esc(c.petparty_name||"")+" <span style='font-weight:400'>vs.</span> "+esc(c.resparty_name||"")+'</h3><div class="meta"><b>CNR:</b> '+esc(c.cino)+'<br><b>Case:</b> '+esc(c.type_name)+'<br><b>Court:</b> '+esc(c.court_no_desg_name)+' · '+esc(c.district_name)+'<br><b>Next date:</b> <span class="date">'+fmt(c.date_next_list)+'</span><br><b>Purpose:</b> '+esc(c.purpose_name||"—")+'<br><b>Client:</b> '+esc(c.client_name||"—")+'</div><div class="tag">PENDING</div></div>').join(""):'<div class="card empty">No pending cases match this view.</div>'}
document.getElementById("q").oninput=render;document.getElementById("range").onchange=render;
login.addEventListener("submit",async e=>{e.preventDefault();loginError.textContent="";const button=login.querySelector("button");button.disabled=true;try{const {data,error}=await supa.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});if(error||!data?.session){showLogin("Sign-in failed. Check your credentials and account verification.");return}session=data.session;document.getElementById("password").value="";await load()}catch(_){showLogin("Sign-in failed. Check your connection and retry.")}finally{button.disabled=false}});
supa.auth.onAuthStateChange((_event,current)=>{session=current;if(!current)showLogin("Sign in to view your cases.");else setTimeout(()=>load(),0)});
supa.auth.getSession().then(({data,error})=>{session=error?null:data?.session||null;if(session)load();else showLogin("Sign in to view your cases.")});
</script></body></html>`;

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("api")==="cases") {
    const auth = await authenticateMercuryRequest(req);
    if (!auth.ok) return new Response(JSON.stringify({error:auth.message}), {status:auth.status,headers});
    try {
      const cases = await db("cases?owner_id=eq."+encodeURIComponent(auth.user.id)+"&case_status=eq.Pending&select=id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,court_no_desg_name,purpose_name,note,notes_adv,case_status,client_name,client_phone,advocate_notes&order=date_next_list.asc.nullslast");
      return new Response(JSON.stringify({cases}),{headers});
    } catch { return new Response(JSON.stringify({error:"Could not retrieve case dashboard"}),{status:500,headers}); }
  }
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
});
