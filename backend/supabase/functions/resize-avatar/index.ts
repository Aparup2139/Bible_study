// supabase/functions/resize-avatar
//
// Phase 1, step 4 — resize avatars on upload.
//
// Deploy:   supabase functions deploy resize-avatar
// Invoke:   POST /functions/v1/resize-avatar  { "path": "<uid>/avatar.jpg" }
//           (Authorization: Bearer <user access token>)
//
// Flow: the client uploads the original to the `avatars` bucket, then calls this
// function with the object path. The function downloads the original, produces a
// square 256x256 webp thumbnail, and writes it back to "<uid>/avatar_256.webp".
// The profile's avatar_path should point at the resized object.
//
// Runs on Supabase Edge Runtime (Deno). ImageScript is pure-WASM so it needs no
// native deps.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const SIZE = 256;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let path: string | undefined;
  try {
    ({ path } = await req.json());
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!path || typeof path !== "string") {
    return json({ error: "missing 'path'" }, 400);
  }

  // Service-role client — trusted server-side context inside the Edge Function.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Download the original.
  const { data: original, error: dlErr } = await supabase.storage
    .from("avatars")
    .download(path);
  if (dlErr || !original) {
    return json({ error: `download failed: ${dlErr?.message ?? "not found"}` }, 404);
  }

  // 2. Resize to a centered square thumbnail, encode as webp.
  let outPath: string;
  try {
    const bytes = new Uint8Array(await original.arrayBuffer());
    const image = await Image.decode(bytes);
    const side = Math.min(image.width, image.height);
    image.crop(
      Math.floor((image.width - side) / 2),
      Math.floor((image.height - side) / 2),
      side,
      side,
    );
    image.resize(SIZE, SIZE);
    const encoded = await image.encodeWEBP(90);

    // 3. Upload the thumbnail next to the original.
    const folder = path.split("/").slice(0, -1).join("/");
    outPath = `${folder}/avatar_${SIZE}.webp`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(outPath, encoded, { contentType: "image/webp", upsert: true });
    if (upErr) {
      return json({ error: `upload failed: ${upErr.message}` }, 500);
    }
  } catch (err) {
    return json({ error: `resize failed: ${(err as Error).message}` }, 500);
  }

  return json({ path: outPath }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
