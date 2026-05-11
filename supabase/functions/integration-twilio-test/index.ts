// Twilio integration: verifies credentials and lists phone numbers via the Lovable connector gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { venue_id, action = "test" } = body || {};
    if (!venue_id) return json({ error: "venue_id required" }, 400);

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const TW = Deno.env.get("TWILIO_API_KEY");
    if (!LOVABLE || !TW) {
      return json({ error: "Twilio connector not linked. Connect Twilio first." }, 400);
    }

    // 1) verify credentials via the gateway probe
    const verify = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE}`, "X-Connection-Api-Key": TW },
    });
    const verifyData = await verify.json().catch(() => ({}));
    if (!verify.ok || verifyData?.outcome === "failed") {
      await sb.from("integration_events").insert({
        venue_id, provider: "twilio", type: "test", status: "error",
        message: verifyData?.error || "verify failed", payload: verifyData,
      });
      return json({ ok: false, error: verifyData?.error || "Twilio verification failed" }, 200);
    }

    // 2) fetch phone numbers
    const numbersRes = await fetch(`${GATEWAY}/IncomingPhoneNumbers.json?PageSize=20`, {
      headers: { "Authorization": `Bearer ${LOVABLE}`, "X-Connection-Api-Key": TW },
    });
    const numbersData = await numbersRes.json();
    if (!numbersRes.ok) {
      return json({ ok: false, error: `Twilio ${numbersRes.status}`, details: numbersData }, 200);
    }
    const numbers = (numbersData.incoming_phone_numbers || []).map((n: any) => ({
      sid: n.sid,
      phone_number: n.phone_number,
      friendly_name: n.friendly_name,
      capabilities: n.capabilities,
    }));

    // 3) upsert integration row + log
    const { data: existing } = await sb.from("integrations").select("id,config").eq("venue_id", venue_id).eq("provider", "twilio").maybeSingle();
    const cfg = { ...(existing?.config || {}), numbers, last_test_at: new Date().toISOString() };
    if (existing) {
      await sb.from("integrations").update({
        connected: action === "connect" ? true : existing ? true : false,
        status: "connected", auth_type: "oauth_gateway", sync_health: "healthy",
        last_sync_at: new Date().toISOString(), config: cfg,
      }).eq("id", existing.id);
    } else if (action === "connect") {
      await sb.from("integrations").insert({
        venue_id, provider: "twilio", connected: true, status: "connected",
        auth_type: "oauth_gateway", sync_health: "healthy",
        last_sync_at: new Date().toISOString(), config: cfg,
      });
    }

    await sb.from("integration_events").insert({
      venue_id, provider: "twilio", type: action,
      status: "ok", message: `Verified · ${numbers.length} number(s)`, payload: { count: numbers.length },
    });

    return json({ ok: true, numbers, latency_ms: verifyData?.latency_ms });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
