import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT = "https://hmtcnatqowokeyrdjujq.supabase.co";
const BUCKET = "mercury-web";

Deno.serve(async (req) => {
  const bearer=req.headers.get("Authorization")||"";
  const jwt=bearer.replace(/^Bearer\s+/i,"");
  const publicKey=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??Deno.env.get("SUPABASE_ANON_KEY");
  if(!jwt||!publicKey)return new Response("Authentication required",{status:401});
  const authResponse=await fetch(PROJECT+"/auth/v1/user",{headers:{apikey:publicKey,Authorization:"Bearer "+jwt}});
  if(!authResponse.ok)return new Response("Invalid session",{status:401});
  const user=await authResponse.json();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return new Response("Missing server configuration", { status: 500 });
  const ownerResponse=await fetch(PROJECT+"/rest/v1/cases?select=user_id&limit=1",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
  if(!ownerResponse.ok)return new Response("Could not verify Mercury owner",{status:503});
  const ownerRows=await ownerResponse.json();const ownerId=ownerRows?.[0]?.user_id;
  if(!ownerId||user.id!==ownerId)return new Response("Not authorised",{status:403});

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`
  };

  for (const name of ["index.html", "manifest.json", "sw.js", "icon.svg"]) {
    const source = `${PROJECT}/functions/v1/mercury-app/${name}`;
    const r = await fetch(source, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!r.ok) return new Response(`Failed to fetch ${name}: ${r.status}`, { status: 502 });
    const body = await r.arrayBuffer();
    const contentType = name === "index.html" ? "text/html; charset=utf-8" : name === "manifest.json" ? "application/manifest+json" : name === "icon.svg" ? "image/svg+xml" : "application/javascript";
    const put = await fetch(`${PROJECT}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "no-store" },
      body
    });
    if (!put.ok) return new Response(`Failed to publish ${name}: ${put.status} ${await put.text()}`, { status: 502 });
  }

  const url = `${PROJECT}/storage/v1/object/public/${BUCKET}/index.html`;
  return Response.redirect(url, 302);
});
