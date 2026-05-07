// Public endpoint so the Fly mixer can ship debug events into our database.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json().catch(() => ({}));
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await sb.from("mixer_debug_log").insert({
      kind: body.kind || "event",
      message: (body.message || "").slice(0, 1000),
      meta: body,
    });
    if (error) return new Response(JSON.stringify(error), { status: 500 });
    return new Response("ok");
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
