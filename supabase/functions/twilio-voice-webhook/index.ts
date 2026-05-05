// Public webhook called by Twilio when a phone number rings.
// Looks up the agent by the dialed number, gets a signed WebSocket URL from
// ElevenLabs, and returns TwiML that bridges Twilio Media Streams <-> ElevenLabs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const xmlHeaders = { "Content-Type": "text/xml; charset=utf-8" };

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: xmlHeaders });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const params = req.method === "POST"
      ? new URLSearchParams(await req.text())
      : new URL(req.url).searchParams;

    const from = params.get("From") || "";
    const to = params.get("To") || "";
    const callSid = params.get("CallSid") || "";

    console.log("[twilio-voice-webhook] incoming", { from, to, callSid });

    if (!to) return twiml(`<Say>We could not determine the dialed number. Goodbye.</Say><Hangup/>`);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Try exact match first, then loose match (strip non-digits) as a safety net
    let { data: agent } = await sb
      .from("agents")
      .select("id, venue_id, elevenlabs_agent_id, name, twilio_phone_number")
      .eq("twilio_phone_number", to)
      .maybeSingle();

    if (!agent) {
      const digits = to.replace(/\D/g, "");
      const { data: all } = await sb
        .from("agents")
        .select("id, venue_id, elevenlabs_agent_id, name, twilio_phone_number")
        .not("twilio_phone_number", "is", null);
      agent = (all || []).find((a: any) => (a.twilio_phone_number || "").replace(/\D/g, "") === digits) || null;
    }

    if (!agent) {
      console.error("[twilio-voice-webhook] no agent linked to", to);
      return twiml(`<Say voice="Polly.Joanna">This number is not linked to an A I host yet. Goodbye.</Say><Hangup/>`);
    }

    if (!agent.elevenlabs_agent_id) {
      console.error("[twilio-voice-webhook] agent has no elevenlabs_agent_id", agent.id);
      await sb.from("brain_events").insert({
        venue_id: agent.venue_id, agent_id: agent.id, severity: "error",
        title: "Inbound call rejected — voice agent not provisioned",
        reason: "Open Voice Live once to provision the ElevenLabs agent, then retry.",
        meta: { from, to, callSid },
      });
      return twiml(`<Say voice="Polly.Joanna">The A I host has not been set up yet. Please open Voice Live in the dashboard once and try again. Goodbye.</Say><Hangup/>`);
    }

    // 1) Try the official native register-call endpoint first
    let xml: string | undefined;
    try {
      const reg = await fetch("https://api.elevenlabs.io/v1/convai/twilio/inbound_call", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agent.elevenlabs_agent_id,
          agent_phone_number_id: null,
          to_number: to,
          from_number: from,
          call_sid: callSid,
        }),
      });
      if (reg.ok) {
        const result = await reg.json().catch(() => ({} as any));
        xml = result?.twiml || result?.TwiML;
      } else {
        console.warn("[twilio-voice-webhook] inbound_call non-200", reg.status, await reg.text());
      }
    } catch (e) {
      console.warn("[twilio-voice-webhook] inbound_call error", e);
    }

    // 2) Fallback: signed URL → bridge via <Connect><Stream>
    if (!xml) {
      const signedRes = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent.elevenlabs_agent_id}`,
        { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
      );
      if (!signedRes.ok) {
        const txt = await signedRes.text();
        console.error("[twilio-voice-webhook] signed-url failed", signedRes.status, txt);
        await sb.from("brain_events").insert({
          venue_id: agent.venue_id, agent_id: agent.id, severity: "error",
          title: "Inbound call routing failed",
          reason: `signed-url ${signedRes.status}: ${txt.slice(0, 400)}`,
          meta: { from, to, callSid },
        });
        return twiml(`<Say>Sorry, our A I host is unavailable right now. Please try again shortly.</Say><Hangup/>`);
      }
      const { signed_url } = await signedRes.json();
      const url = escapeXml(signed_url);
      xml = `<Connect><Stream url="${url}"><Parameter name="caller_number" value="${escapeXml(from)}"/><Parameter name="call_sid" value="${escapeXml(callSid)}"/></Stream></Connect>`;
    }

    // Log the call + brain event
    await sb.from("calls").insert({
      venue_id: agent.venue_id, agent_id: agent.id, caller: from,
      conversation_id: callSid, summary: "Inbound Twilio call routed to AI agent",
    });
    await sb.from("brain_events").insert({
      venue_id: agent.venue_id, agent_id: agent.id, severity: "success",
      title: `Inbound call routed to ${agent.name}`,
      reason: `Caller ${from} → ${to}`, meta: { from, to, callSid },
    });

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, { headers: xmlHeaders });
  } catch (e) {
    console.error("[twilio-voice-webhook] error", e);
    return twiml(`<Say>An unexpected error occurred. Goodbye.</Say><Hangup/>`);
  }
});
