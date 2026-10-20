import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const PROJECT = "https://hmtcnatqowokeyrdjujq.supabase.co";
const BUCKET = "mercury-web";
const OWNER_USER_ID = Deno.env.get("MERCURY_OWNER_USER_ID") || "";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  if (!OWNER_USER_ID || auth.user.id !== OWNER_USER_ID) {
    return new Response("Not found", { status: 404 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return new Response("Missing server configuration", { status: 500 });

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const published: string[] = [];

  for (const name of ["index.html", "manifest.json", "sw.js"]) {
    const source = `${PROJECT}/functions/v1/mercury-app/${name}`;
    const response = await fetch(source, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) {
      console.error("publish-mercury-web: source asset fetch failed");
      return new Response("Failed to fetch a required public asset", { status: 502 });
    }

    const body = await response.arrayBuffer();
    const contentType = name === "index.html"
      ? "text/html; charset=utf-8"
      : name === "manifest.json"
      ? "application/manifest+json"
      : "application/javascript";

    const put = await fetch(`${PROJECT}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "no-store" },
      body,
    });
    if (!put.ok) {
      console.error("publish-mercury-web: asset publish failed");
      return new Response("Failed to publish a public asset", { status: 502 });
    }
    published.push(name);
  }

  const url = `${PROJECT}/storage/v1/object/public/${BUCKET}/index.html`;
  return Response.json({ ok: true, published, url });
});
