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

    const { venue_id, to, body, booking_id, from, channels } = await req.json();
    if (!venue_id || !to || !body) {
      return new Response(JSON.stringify({ error: "venue_id, to, body required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Default: send via both SMS and WhatsApp using the same number.
    const sendChannels: string[] = Array.isArray(channels) && channels.length ? channels : ["sms", "whatsapp"];

    if (!TWILIO_API_KEY) {
      // log only
      for (const ch of sendChannels) {
        await sb.from("messages").insert({ venue_id, contact: to, body, channel: ch, direction: "outbound", status: "queued_no_twilio" });
      }
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

    // Normalize To into E.164. If it's a local number (e.g. "0420505750"), use the From number's
    // country code as the default. Common country codes covered; falls back to From's leading digits.
    const COUNTRY_TRUNK: Record<string, string> = {
      "+61": "0", // AU
      "+44": "0", // UK
      "+33": "0", // FR
      "+49": "0", // DE
      "+39": "0", // IT (kept as-is usually, but harmless)
      "+34": "0", // ES
      "+1":  "1", // NANP (rare local form)
    };
    const normalizeTo = (raw: string, fromE164: string): string => {
      let t = (raw || "").trim().replace(/[\s\-().]/g, "");
      if (t.startsWith("+")) return t;
      if (t.startsWith("00")) return "+" + t.slice(2);
      // Heuristic: AU mobile local format (04XXXXXXXX, 10 digits) → +61
      if (/^04\d{8}$/.test(t)) return "+61" + t.slice(1);
      // UK mobile local format (07XXXXXXXXX, 11 digits) → +44
      if (/^07\d{9}$/.test(t)) return "+44" + t.slice(1);
      // Determine country code from From
      const cc = Object.keys(COUNTRY_TRUNK).find(c => fromE164.startsWith(c)) || "";
      const trunk = cc ? COUNTRY_TRUNK[cc] : "";
      if (cc && trunk && t.startsWith(trunk)) t = t.slice(trunk.length);
      if (cc) return cc + t;
      return "+" + t;
    };
    const toNumber = normalizeTo(to, fromNumber);
    if (!/^\+[1-9]\d{6,14}$/.test(toNumber)) {
      return new Response(JSON.stringify({ error: `Invalid destination number: ${to}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toNumber, From: fromNumber, Body: body }),
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
