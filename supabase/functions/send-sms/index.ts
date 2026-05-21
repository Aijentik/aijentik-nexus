import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { venue_id, to, message } = body as { venue_id?: string; to?: string; message?: string };
    if (!venue_id || !to || !message) return json({ error: "venue_id, to, message required" }, 400);
    if (message.length > 1600) return json({ error: "message too long" }, 400);
    if (!/^\+[1-9]\d{6,14}$/.test(to)) return json({ error: "to must be E.164 e.g. +14155551212" }, 400);

    // RLS check: confirm user is venue member by reading the venue
    const { data: venue, error: vErr } = await supa.from("venues").select("id, phone").eq("id", venue_id).maybeSingle();
    if (vErr || !venue) return json({ error: "Venue not found or access denied" }, 403);

    const from = venue.phone;
    if (!from || !/^\+[1-9]\d{6,14}$/.test(from)) {
      return json({ error: "Venue has no E.164 outgoing number. Set it in Settings → Call routing." }, 400);
    }

    const lovKey = Deno.env.get("LOVABLE_API_KEY");
    const twKey = Deno.env.get("TWILIO_API_KEY");
    if (!lovKey || !twKey) return json({ error: "SMS provider not configured" }, 500);

    const twRes = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovKey}`,
        "X-Connection-Api-Key": twKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    });
    const twData = await twRes.json().catch(() => ({}));
    if (!twRes.ok) {
      const msg = twData?.message || `Twilio error ${twRes.status}`;
      await supa.from("messages").insert({
        venue_id, contact: to, body: message, channel: "sms", direction: "outbound", status: "failed",
      });
      return json({ error: msg, details: twData }, 502);
    }

    await supa.from("messages").insert({
      venue_id, contact: to, body: message, channel: "sms", direction: "outbound", status: "sent",
    });
    await supa.from("brain_events").insert({
      venue_id, title: "SMS sent", reason: `To ${to}`, severity: "info", meta: { sid: twData.sid },
    });

    return json({ ok: true, sid: twData.sid });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
