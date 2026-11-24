Deno.serve(async (_req: Request) => {
  const u = new URL(_req.url);
  const requested = u.pathname.split("/").pop() || "index.html";
  const name = ["mercury-app", "receive-files", ""].includes(requested) ? "index.html" : requested;
  if (!["index.html", "manifest.json", "sw.js", "icon.svg"].includes(name)) return new Response("Not found", {status:404});
  const r = await fetch("https://raw.githubusercontent.com/pnehra412-wq/mercury-pcms/main/" + name + "?mercury_deploy=15");
  if (!r.ok) return new Response("Mercury source unavailable", {status:502});
  const body = await r.text();
  const mime = name === "manifest.json" ? "application/manifest+json" : name === "sw.js" ? "application/javascript" : name === "icon.svg" ? "image/svg+xml" : "text/html";
  const response = new Response(new Blob([body], {type:mime + "; charset=utf-8"}));
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("X-Mercury-Version", "15");
  console.log("MERCURY_V15", JSON.stringify({name, length:body.length, mime:response.headers.get("content-type")}));
  return response;
});