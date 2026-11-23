import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

async function db(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#111827"><title>Mercury — AI Legal Office</title><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7fb;color:#172033}
header{background:#111827;color:white;padding:18px 20px;position:sticky;top:0;z-index:5}h1{margin:0;font-size:22px}.sub{opacity:.7;font-size:12px;margin-top:3px}
.wrap{max-width:1250px;margin:auto;padding:18px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.card{background:white;border:1px solid #e5e7eb;border-radius:14px;padding:15px;box-shadow:0 2px 8px #00000008}.stat b{font-size:25px;display:block}.stat span{font-size:12px;color:#667085}
.tools{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:15px}#authBox{margin-bottom:14px}#loginForm[hidden],#signout[hidden]{display:none}input,select,button{border:1px solid #d0d5dd;border-radius:10px;padding:10px 12px;background:white;font:inherit}input{flex:1;min-width:220px}button{cursor:pointer;background:#111827;color:white;border-color:#111827}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}.case h3{font-size:15px;margin:0 0 8px}.meta{font-size:12px;color:#667085;line-height:1.55}.date{font-weight:700;color:#111827}.tag{display:inline-block;padding:4px 7px;border-radius:999px;background:#eef2ff;font-size:11px;margin-top:7px}.empty{padding:30px;text-align:center;color:#667085}
@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.wrap{padding:12px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>⚖️ Mercury</h1><div class="sub">AI Legal Office · Pending Cases Desk</div></header>
<div class="wrap"><div class="card" id="authBox"><form id="loginForm" class="tools"><input id="email" type="email" autocomplete="username" required placeholder="Mercury account email"><input id="password" type="password" autocomplete="current-password" required placeholder="Password"><button type="submit" id="loginBtn">Sign in</button></form><button id="signout" hidden type="button">Sign out</button></div><div class="stats" id="stats"></div>
<div class="tools"><input id="q" placeholder="Search CNR, party, client, court…"><select id="range"><option value="all">All pending</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select><button onclick="load()">Refresh</button></div>
<div id="list" class="grid"></div></div>
<script>
let cases=[];
const SUPABASE_URL="https://hmtcnatqowokeyrdjujq.supabase.co",SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGNuYXRxb3dva2V5cmRqdWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNzY0NDYsImV4cCI6MjA5Mzk1MjQ0Nn0.7ClED1zmFuAJoQ7bXIg6DrQ4hlddrqPcfvGB0SiT0fo";
const auth=window.supabase.createClient(SUPABASE_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});let session=null;
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function iso(d){return d.toISOString().slice(0,10)}
function fmt(s){if(!s)return "—";let d=new Date(s+"T00:00:00");return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
async function load(){if(!session){document.getElementById("list").innerHTML='<div class="card empty">Sign in with your Mercury account to view office cases.</div>';return}let r=await fetch("?api=cases",{headers:{Authorization:"Bearer "+session.access_token}});let j=await r.json();if(!r.ok){document.getElementById("list").innerHTML='<div class="card empty">Access denied. Please sign in again.</div>';return}cases=j.cases||[];render()}
function render(){let q=document.getElementById("q").value.toLowerCase(),range=document.getElementById("range").value,today=new Date(),t=iso(today),tom=iso(new Date(today.getTime()+86400000)),end=new Date(today.getTime()+86400000*Number(range==="30"?30:7));
let f=cases.filter(c=>{let text=[c.cino,c.petparty_name,c.resparty_name,c.client_name,c.establishment_name,c.court_no_desg_name,c.purpose_name].join(" ").toLowerCase();if(q&&!text.includes(q))return false;if(range==="today"&&c.date_next_list!==t)return false;if(range==="tomorrow"&&c.date_next_list!==tom)return false;if(range==="7"&&(!c.date_next_list||c.date_next_list<t||c.date_next_list>iso(end)))return false;if(range==="30"&&(!c.date_next_list||c.date_next_list<t||c.date_next_list>iso(end)))return false;return true}).sort((a,b)=>(a.date_next_list||"9999").localeCompare(b.date_next_list||"9999"));
let counts={today:cases.filter(c=>c.date_next_list===t).length,tomorrow:cases.filter(c=>c.date_next_list===tom).length,week:cases.filter(c=>c.date_next_list&&c.date_next_list>=t&&c.date_next_list<=iso(new Date(today.getTime()+86400000*7))).length};
document.getElementById("stats").innerHTML='<div class="card stat"><b>'+cases.length+'</b><span>Pending cases</span></div><div class="card stat"><b>'+counts.today+'</b><span>Today</span></div><div class="card stat"><b>'+counts.tomorrow+'</b><span>Tomorrow</span></div><div class="card stat"><b>'+counts.week+'</b><span>Next 7 days</span></div>';
document.getElementById("list").innerHTML=f.length?f.map(c=>'<div class="card case"><h3>'+esc(c.petparty_name||"")+" <span style='font-weight:400'>vs.</span> "+esc(c.resparty_name||"")+'</h3><div class="meta"><b>CNR:</b> '+esc(c.cino)+'<br><b>Case:</b> '+esc(c.type_name)+'<br><b>Court:</b> '+esc(c.court_no_desg_name)+' · '+esc(c.district_name)+'<br><b>Next date:</b> <span class="date">'+fmt(c.date_next_list)+'</span><br><b>Purpose:</b> '+esc(c.purpose_name||"—")+'<br><b>Client:</b> '+esc(c.client_name||"—")+'</div><div class="tag">PENDING</div></div>').join(""):'<div class="card empty">No pending cases match this view.</div>'}
document.getElementById("q").oninput=render;document.getElementById("range").onchange=render;
const loginForm=document.getElementById("loginForm"),loginBtn=document.getElementById("loginBtn"),signout=document.getElementById("signout");
function syncAuth(){loginForm.hidden=!!session;signout.hidden=!session;}
loginForm.addEventListener("submit",async e=>{e.preventDefault();loginBtn.disabled=true;try{const {data,error}=await auth.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});if(error)throw error;session=data.session;document.getElementById("password").value="";syncAuth();await load();}catch(error){document.getElementById("list").innerHTML='<div class="card empty">Sign-in failed: '+esc(error.message)+'</div>';}finally{loginBtn.disabled=false;}});
signout.addEventListener("click",async()=>{await auth.auth.signOut();session=null;syncAuth();cases=[];render();});
auth.auth.onAuthStateChange((_event,next)=>{session=next;syncAuth();});
auth.auth.getSession().then(({data})=>{session=data.session;syncAuth();load();});
</script></body></html>`;

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("api")==="cases") {
    try {
      const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
      if(!jwt||!PUBLIC_KEY)return new Response(JSON.stringify({error:"Authentication required"}),{status:401,headers});
      const authResponse=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+jwt}});
      if(!authResponse.ok)return new Response(JSON.stringify({error:"Invalid session"}),{status:401,headers});
      const user=await authResponse.json();
      const ownerRows=await db("cases?select=user_id&limit=1");const ownerId=Array.isArray(ownerRows)?ownerRows[0]?.user_id:null;
      if(!ownerId||user.id!==ownerId)return new Response(JSON.stringify({error:"Not authorised for this Mercury workspace"}),{status:403,headers});
      const cases = await db("cases?case_status=eq.Pending&user_id=eq."+encodeURIComponent(user.id)+"&select=id,cino,type_name,petparty_name,resparty_name,establishment_name,district_name,date_next_list,court_no_desg_name,purpose_name,note,notes_adv,case_status,client_name,client_phone,advocate_notes&order=date_next_list.asc.nullslast");
      return new Response(JSON.stringify({cases}),{headers});
    } catch(e) { return new Response(JSON.stringify({error:String(e)}),{status:500,headers}); }
  }
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
});
