import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateMercuryRequest } from "../_shared/mercury-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

 // Bound legacy inline-file migration even when metadata claims a smaller size.
const MAX_LEGACY_FILE_BYTES = 25 * 1024 * 1024;

function safeFileName(value: unknown, fallback: string) {
  const name = String(value || fallback).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  return name || fallback;
}

function digestHex(bytes: Uint8Array) {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const auth = await authenticateMercuryRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  try {
    const body = await req.json();
    const supplied = body?.document_ids;
    if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 50) {
      return json({ error: "document_ids must contain 1-50 document IDs" }, 400);
    }
    if (!supplied.every((value: unknown) =>
      (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) &&
      Number.isSafeInteger(Number(value)) && Number(value) > 0
    )) {
      return json({ error: "Every document ID must be a positive integer" }, 400);
    }
    const ids = [...new Set(supplied.map((value: unknown) => Number(value)))];
    if (ids.length !== supplied.length) return json({ error: "Duplicate document IDs are not allowed" }, 400);

    // owner_id is added by the companion, un-applied RLS migration. Do not
    // deploy this function until that schema migration has been tested/applied.
    const { data: docs, error: readError } = await auth.admin
      .from("documents")
      .select("id,cino,name,mime_type,size,storage_bucket,storage_path,file_data,owner_id")
      .in("id", ids)
      .eq("owner_id", auth.user.id);

    if (readError) {
      console.error("prepare-document-share: document lookup failed");
      return json({ error: "Could not retrieve requested documents" }, 500);
    }
    if (!docs || docs.length !== ids.length) {
      return json({ error: "One or more documents were not found" }, 404);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const doc of docs) {
      const bucket = doc.storage_bucket || "case-files";
      if (bucket !== "case-files") {
        return json({ error: "A requested document is not in the private case-files bucket" }, 422);
      }

      let path = doc.storage_path || null;
      let mime = doc.mime_type || "application/octet-stream";

      if (!path && doc.file_data) {
        const raw = String(doc.file_data);
        const match = raw.match(/^data:([^;,]+)?;base64,([\s\S]*)$/i);
        const base64 = (match ? match[2] : raw).replace(/\s/g, "");
        if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
          return json({ error: "A legacy document has an invalid encoded file" }, 422);
        }
        // Base64 is roughly 4/3 the byte size; reject oversized input before
        // allocating the decoded Uint8Array to avoid memory exhaustion.
        const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
        const estimatedBytes = Math.floor(base64.length * 3 / 4) - padding;
        if (estimatedBytes > MAX_LEGACY_FILE_BYTES) {
          return json({ error: "Legacy document exceeds the 25 MB migration limit" }, 413);
        }
        mime = doc.mime_type || match?.[1] || "application/octet-stream";

        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        } catch {
          return json({ error: "A legacy document could not be decoded" }, 422);
        }

        const safeCino = safeFileName(doc.cino, "Unlinked");
        const safeName = safeFileName(doc.name, `document-${doc.id}`);
        path = `Migrated/${safeCino}/${doc.id}_${safeName}`;

        const { error: uploadError } = await auth.admin.storage.from("case-files").upload(path, bytes, {
          contentType: mime,
          upsert: true,
          cacheControl: "3600",
        });
        if (uploadError) {
          console.error("prepare-document-share: legacy upload failed");
          return json({ error: "Could not store a legacy document; original data was retained" }, 500);
        }

        // Verify stored bytes before changing the database reference or clearing
        // file_data. Storage and Postgres are separate systems, not one transaction.
        const { data: downloaded, error: verifyError } = await auth.admin.storage.from("case-files").download(path);
        if (verifyError || !downloaded) {
          console.error("prepare-document-share: uploaded object verification failed");
          return json({ error: "Stored document verification failed; original data was retained" }, 500);
        }
        const storedBytes = new Uint8Array(await downloaded.arrayBuffer());
        const [sourceHash, storedHash] = await Promise.all([digestHex(bytes), digestHex(storedBytes)]);
        if (storedBytes.length !== bytes.length || sourceHash !== storedHash) {
          console.error("prepare-document-share: uploaded object checksum mismatch");
          return json({ error: "Stored document verification failed; original data was retained" }, 500);
        }

        const { data: updated, error: updateError } = await auth.admin
          .from("documents")
          .update({
            storage_bucket: "case-files",
            storage_path: path,
            file_data: null,
            mime_type: mime,
            size: bytes.length,
          })
          .eq("id", doc.id)
          .eq("owner_id", auth.user.id)
          .select("id")
          .maybeSingle();

        if (updateError || !updated) {
          // Do not delete the source object. If the database update failed,
          // the inline file remains available and this operation is retryable.
          console.error("prepare-document-share: document reference update failed");
          return json({ error: "Could not finalize document storage; retry is safe" }, 500);
        }
      }

      if (!path) {
        results.push({ id: doc.id, name: doc.name, error: "No stored file" });
        continue;
      }

      const { data: signed, error: signError } = await auth.admin.storage
        .from("case-files")
        .createSignedUrl(path, 900, { download: String(doc.name || "document") });
      if (signError || !signed?.signedUrl) {
        console.error("prepare-document-share: signed URL creation failed");
        return json({ error: "Could not create a document link" }, 500);
      }

      results.push({
        id: doc.id,
        name: doc.name,
        mime_type: mime,
        url: signed.signedUrl,
      });
    }

    return json({ ok: true, documents: results });
  } catch {
    return json({ error: "Invalid request or document-sharing failure" }, 400);
  }
});
