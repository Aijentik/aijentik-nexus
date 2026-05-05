import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { venue_id, to, body, booking_id, from } = await req.json();
    if (!venue_id || !to || !body) {
      return new Response(JSON.stringify({ error: "venue_id, to, body required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!TWILIO_API_KEY) {
      // log only
      await sb.from("messages").insert({ venue_id, contact: to, body, channel: "sms", direction: "outbound", status: "queued_no_twilio" });
      return new Response(JSON.stringify({ ok: true, simulated: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lookup From number from venue/agent if not given
    let fromNumber = from;
    if (!fromNumber) {
      const { data: agent } = await sb.from("agents").select("twilio_phone_number").eq("venue_id", venue_id).not("twilio_phone_number", "is", null).maybeSingle();
      fromNumber = agent?.twilio_phone_number;
    }
    if (!fromNumber) {
      return new Response(JSON.stringify({ error: "No Twilio From number configured for venue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    });
    const data = await res.json();
    const status = res.ok ? "sent" : "failed";

    await sb.from("messages").insert({ venue_id, contact: to, body, channel: "sms", direction: "outbound", status });
    if (booking_id) {
      await sb.from("brain_events").insert({ venue_id, title: "Confirmation SMS sent", reason: `→ ${to}`, severity: "info", meta: { booking_id, sid: data.sid } });
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, sid: data.sid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
