// Public endpoint so the Fly mixer can ship debug events into our database.
// Lets us inspect Twilio<->mixer handshakes without needing Fly CLI access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json().catch(() => ({}));
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    await sb.from("brain_events").insert({
      severity: "info",
      title: `[mixer] ${body.kind || "event"}`,
      reason: (body.message || "").slice(0, 500),
      meta: body,
    });
    return new Response("ok");
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
